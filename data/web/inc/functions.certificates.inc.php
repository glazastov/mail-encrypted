<?php
// The certificates acme-mailcow manages, for the admin certificates page.
//
// Two sources are combined here. The certificates themselves are read from the
// ACME directory, which is mounted read-only: everything that can be seen in a
// certificate - its domains, issuer, validity - comes from the file. Why a
// domain has no certificate, or which domain of a multi-domain certificate
// failed its challenge, cannot be seen there at all, so acme-mailcow records it
// in the Redis key ACME_STATUS while it runs (see acme_status_* in the ACME
// container's functions.sh) and this side reads that record.
//
// The private keys live in the same directory and are never served: the
// download only ever hands out certificates, and the key files are chmod 600
// root, so php-fpm cannot read them even by mistake.

const CERTIFICATES_ACME_BASE = '/var/lib/acme';
// Directories under the ACME base that hold no certificate of their own
const CERTIFICATES_RESERVED_DIRS = array('acme', 'acme-sh', 'backups');
const CERTIFICATES_RENEW_BEFORE_DEFAULT = 2592000;

// The whole status record acme-mailcow published at the end of its last loop
function certificates_acme_status() {
  global $redis;
  try {
    $status = json_decode((string)$redis->Get('ACME_STATUS'), true);
  }
  catch (RedisException $e) {
    return array();
  }
  return is_array($status) ? $status : array();
}

// The certificate directories, as the names acme-mailcow gives them
function certificates_names() {
  $names = array();
  foreach ((array)@scandir(CERTIFICATES_ACME_BASE) as $entry) {
    if ($entry === false || $entry[0] === '.' || in_array($entry, CERTIFICATES_RESERVED_DIRS)) {
      continue;
    }
    $dir = CERTIFICATES_ACME_BASE . '/' . $entry;
    if (is_dir($dir) && is_readable($dir . '/cert.pem')) {
      $names[] = $entry;
    }
  }
  sort($names);
  return $names;
}

// A name from the request is only ever accepted when it is one of the
// directories that exist, so no input reaches a path
function certificates_valid_name($name) {
  return in_array((string)$name, certificates_names(), true) ? (string)$name : false;
}

// The PEM blocks of a file, leaf first
function certificates_pem_blocks($file) {
  $pem = @file_get_contents($file);
  if ($pem === false) {
    return array();
  }
  if (!preg_match_all('/-----BEGIN CERTIFICATE-----.+?-----END CERTIFICATE-----/s', $pem, $matches)) {
    return array();
  }
  return $matches[0];
}

// Everything that can be read out of one certificate
function certificates_parse($pem) {
  $x509 = @openssl_x509_parse($pem);
  if ($x509 === false) {
    return false;
  }
  $san = array();
  if (!empty($x509['extensions']['subjectAltName'])) {
    foreach (explode(',', $x509['extensions']['subjectAltName']) as $entry) {
      $entry = trim($entry);
      if (strpos($entry, 'DNS:') === 0) {
        $san[] = substr($entry, 4);
      }
    }
  }
  $key_type = null;
  $key_bits = null;
  $public_key = @openssl_pkey_get_public($pem);
  if ($public_key !== false) {
    $details = @openssl_pkey_get_details($public_key);
    if (!empty($details)) {
      $key_bits = $details['bits'] ?? null;
      $types = array(OPENSSL_KEYTYPE_RSA => 'RSA', OPENSSL_KEYTYPE_EC => 'EC',
        OPENSSL_KEYTYPE_DSA => 'DSA', OPENSSL_KEYTYPE_DH => 'DH');
      $key_type = $types[$details['type'] ?? -1] ?? null;
    }
  }
  return array(
    'subject' => $x509['subject']['CN'] ?? null,
    'issuer' => $x509['issuer']['CN'] ?? ($x509['issuer']['O'] ?? null),
    'issuer_org' => $x509['issuer']['O'] ?? null,
    'serial' => $x509['serialNumberHex'] ?? ($x509['serialNumber'] ?? null),
    'sig_alg' => $x509['signatureTypeSN'] ?? null,
    'not_before' => $x509['validFrom_time_t'] ?? null,
    'not_after' => $x509['validTo_time_t'] ?? null,
    'san' => $san,
    'key_type' => $key_type,
    'key_bits' => $key_bits,
    'self_signed' => ($x509['subject'] ?? null) == ($x509['issuer'] ?? null),
    'fingerprint' => @openssl_x509_fingerprint($pem, 'sha256') ?: null
  );
}

// The certificate Postfix, Dovecot and nginx are configured with. acme-mailcow
// copies one of the certificates here, so this is what is actually deployed.
function certificates_deployed_fingerprint() {
  $blocks = certificates_pem_blocks(CERTIFICATES_ACME_BASE . '/cert.pem');
  if (empty($blocks)) {
    return null;
  }
  return @openssl_x509_fingerprint($blocks[0], 'sha256') ?: null;
}

// How long before expiry acme-mailcow renews, which is what makes a
// certificate "expiring" rather than merely valid. The shortlived profile
// issues 6 day certificates, so a fixed 30 day window would be meaningless.
function certificates_renew_before($status) {
  $renew_before = intval($status['config']['renew_before'] ?? 0);
  return $renew_before > 0 ? $renew_before : CERTIFICATES_RENEW_BEFORE_DEFAULT;
}

// Does a certificate SAN entry cover a domain, wildcards included
function certificates_san_covers($san_entry, $domain) {
  $san_entry = strtolower($san_entry);
  $domain = strtolower($domain);
  if ($san_entry === $domain) {
    return true;
  }
  if (strpos($san_entry, '*.') === 0) {
    $parent = substr($san_entry, 2);
    // a wildcard covers exactly one label
    return substr($domain, -strlen($parent) - 1) === '.' . $parent
      && strpos(substr($domain, 0, -strlen($parent) - 1), '.') === false;
  }
  return false;
}

function certificates_covered_by($domain, $certificates) {
  foreach ($certificates as $certificate) {
    foreach ($certificate['san'] as $san_entry) {
      if (certificates_san_covers($san_entry, $domain)) {
        return $certificate['name'];
      }
    }
  }
  return null;
}

// One certificate, as the page shows it
function certificates_details($name, $status, $deployed_fingerprint) {
  $dir = CERTIFICATES_ACME_BASE . '/' . $name;
  $blocks = certificates_pem_blocks($dir . '/cert.pem');
  if (empty($blocks)) {
    return false;
  }
  $details = certificates_parse($blocks[0]);
  if ($details === false) {
    return false;
  }

  $acme = null;
  foreach ((array)($status['certificates'] ?? array()) as $record) {
    if (($record['name'] ?? null) === $name) {
      $acme = $record;
      break;
    }
  }

  // The domains acme-mailcow asked for, which are not necessarily the ones the
  // CA issued: a difference here means the certificate is behind its request.
  // The domains file is only rewritten when a request succeeds, so after a
  // failure it still holds the previous one - the record of the last run is
  // what says which domains were actually asked for.
  if (!empty($acme['domains'])) {
    $requested = array_values(array_filter(array_column($acme['domains'], 'domain')));
  }
  else {
    $requested = array_values(array_filter(preg_split('/\s+/', (string)@file_get_contents($dir . '/domains'))));
  }

  $now = time();
  $seconds_left = $details['not_after'] !== null ? $details['not_after'] - $now : null;
  // A failure matters more than an expiry date that is still comfortable: the
  // certificate is valid today and will not be renewed
  if (($acme['state'] ?? null) === 'failed') {
    $state = 'failed';
  }
  elseif ($seconds_left !== null && $seconds_left <= 0) {
    $state = 'expired';
  }
  elseif ($seconds_left !== null && $seconds_left < certificates_renew_before($status)) {
    $state = 'expiring';
  }
  else {
    $state = 'ok';
  }

  $missing_san = array();
  foreach ($requested as $domain) {
    if (certificates_covered_by($domain, array(array('name' => $name, 'san' => $details['san']))) === null) {
      $missing_san[] = $domain;
    }
  }

  return array_merge($details, array(
    'name' => $name,
    'requested' => $requested,
    // domains acme-mailcow asked for that the certificate does not cover
    'missing_san' => $missing_san,
    'state' => $state,
    'seconds_left' => $seconds_left,
    'chain_length' => count($blocks),
    'deployed' => $deployed_fingerprint !== null && $details['fingerprint'] === $deployed_fingerprint,
    'has_key' => file_exists($dir . '/key.pem'),
    'has_csr' => is_readable($dir . '/acme.csr'),
    'modified' => @filemtime($dir . '/cert.pem') ?: null,
    'acme' => $acme
  ));
}

// The certificates that were archived: a renewal keeps the previous one, and a
// certificate whose domains are gone is moved aside whole
function certificates_backups() {
  $backups = array();
  $base = CERTIFICATES_ACME_BASE . '/backups';
  foreach ((array)@scandir($base) as $name) {
    if ($name === false || $name[0] === '.' || !is_dir($base . '/' . $name)) {
      continue;
    }
    foreach ((array)@scandir($base . '/' . $name) as $stamp) {
      if ($stamp === false || $stamp[0] === '.') {
        continue;
      }
      $dir = $base . '/' . $name . '/' . $stamp;
      $blocks = certificates_pem_blocks($dir . '/cert.pem');
      if (empty($blocks)) {
        continue;
      }
      $details = certificates_parse($blocks[0]);
      if ($details === false) {
        continue;
      }
      $backups[] = array(
        'name' => $name,
        'archived' => $stamp,
        'archived_time' => @filemtime($dir . '/cert.pem') ?: null,
        'subject' => $details['subject'],
        'san' => $details['san'],
        'not_before' => $details['not_before'],
        'not_after' => $details['not_after'],
        'serial' => $details['serial'],
        'expired' => $details['not_after'] !== null && $details['not_after'] < time()
      );
    }
  }
  usort($backups, function($a, $b) { return ($b['archived_time'] ?? 0) <=> ($a['archived_time'] ?? 0); });
  return $backups;
}

// The domains acme-mailcow dropped before it even asked for a certificate,
// with the reason it gives, plus whether another certificate covers them anyway
function certificates_missing($status, $certificates) {
  $missing = array();
  foreach ((array)($status['skipped'] ?? array()) as $skipped) {
    $domain = (string)($skipped['domain'] ?? '');
    if ($domain === '') {
      continue;
    }
    $missing[] = array(
      'domain' => $domain,
      'reason' => $skipped['reason'] ?? null,
      'time' => $skipped['time'] ?? null,
      'covered_by' => certificates_covered_by($domain, $certificates),
      'kind' => 'skipped'
    );
  }
  // A certificate that failed before it was ever issued has no file to list,
  // so its domains would otherwise not show up anywhere
  $names = array_column($certificates, 'name');
  foreach ((array)($status['certificates'] ?? array()) as $record) {
    if (($record['state'] ?? null) !== 'failed' || in_array($record['name'] ?? '', $names, true)) {
      continue;
    }
    foreach ((array)($record['domains'] ?? array()) as $domain) {
      $missing[] = array(
        'domain' => $domain['domain'] ?? '',
        'reason' => $domain['error'] ?? ($domain['diagnosis'] ?? ($record['error'] ?? null)),
        'time' => $record['time'] ?? null,
        'covered_by' => certificates_covered_by($domain['domain'] ?? '', $certificates),
        'certificate' => $record['name'] ?? null,
        'challenge' => $domain['challenge'] ?? null,
        'kind' => 'failed'
      );
    }
  }
  return $missing;
}

function certificates($_action, $_type, $_data = null) {
  global $redis;

  if ($_SESSION['mailcow_cc_role'] != "admin") {
    $_SESSION['return'][] = array(
      'type' => 'danger',
      'log' => array(__FUNCTION__, $_action, $_type),
      'msg' => 'access_denied'
    );
    return false;
  }

  switch ($_action) {
    case 'get':
      $status = certificates_acme_status();
      switch ($_type) {
        case 'all':
          $deployed_fingerprint = certificates_deployed_fingerprint();
          $certificates = array();
          foreach (certificates_names() as $name) {
            $details = certificates_details($name, $status, $deployed_fingerprint);
            if ($details !== false) {
              $certificates[] = $details;
            }
          }
          return $certificates;
        break;

        case 'status':
          // What the page needs to frame everything else: the configuration the
          // last run used, when it ran, and whether it is still failing
          $deployed = null;
          $blocks = certificates_pem_blocks(CERTIFICATES_ACME_BASE . '/cert.pem');
          if (!empty($blocks)) {
            $deployed = certificates_parse($blocks[0]);
            $deployed['modified'] = @filemtime(CERTIFICATES_ACME_BASE . '/cert.pem') ?: null;
          }
          try {
            $fail_time = $redis->Get('ACME_FAIL_TIME');
            $renew_pending = $redis->Get('ACME_FORCE_RENEW') == '1';
          }
          catch (RedisException $e) {
            $fail_time = null;
            $renew_pending = false;
          }
          return array(
            'config' => $status['config'] ?? array(),
            'started' => $status['started'] ?? null,
            'finished' => $status['finished'] ?? null,
            'errors' => $status['errors'] ?? null,
            'has_record' => !empty($status),
            'fail_time' => $fail_time ? intval($fail_time) : null,
            'renew_pending' => $renew_pending,
            'deployed' => $deployed
          );
        break;

        case 'missing':
          $deployed_fingerprint = certificates_deployed_fingerprint();
          $certificates = array();
          foreach (certificates_names() as $name) {
            $details = certificates_details($name, $status, $deployed_fingerprint);
            if ($details !== false) {
              $certificates[] = $details;
            }
          }
          return certificates_missing($status, $certificates);
        break;

        case 'backups':
          return certificates_backups();
        break;

        case 'log':
          // The ACME client log, newest first, as the dashboard shows it
          return get_logs('acme-mailcow', intval($_data['lines'] ?? 100));
        break;
      }
      return false;
    break;

    case 'edit':
      switch ($_type) {
        case 'renew':
          // acme-mailcow sleeps between its runs, so the marker alone would sit
          // unread for up to a day: the container is restarted and picks it up
          // on its next start (acme_check_force_renew)
          try {
            $redis->Set('ACME_FORCE_RENEW', '1');
          }
          catch (RedisException $e) {
            $_SESSION['return'][] = array(
              'type' => 'danger',
              'log' => array(__FUNCTION__, $_action, $_type),
              'msg' => array('redis_error', $e)
            );
            return false;
          }
          // an empty response is a success too, see docker()
          $restart = docker('post', 'acme-mailcow', 'restart');
          if ($restart !== true && strpos((string)$restart, 'success') === false) {
            try {
              $redis->Del('ACME_FORCE_RENEW');
            }
            catch (RedisException $e) {
            }
            $_SESSION['return'][] = array(
              'type' => 'danger',
              'log' => array(__FUNCTION__, $_action, $_type),
              'msg' => 'acme_renew_failed'
            );
            return false;
          }
          $_SESSION['return'][] = array(
            'type' => 'success',
            'log' => array(__FUNCTION__, $_action, $_type),
            'msg' => 'acme_renew_started'
          );
          return true;
        break;
      }
      return false;
    break;
  }
  return false;
}

// The certificate files a download may hand out. The private keys are not
// among them, and the list is what the download endpoint accepts.
function certificates_download($name, $file) {
  if ($_SESSION['mailcow_cc_role'] != "admin") {
    return false;
  }
  $name = certificates_valid_name($name);
  if ($name === false) {
    return false;
  }
  $dir = CERTIFICATES_ACME_BASE . '/' . $name;
  $blocks = certificates_pem_blocks($dir . '/cert.pem');

  switch ($file) {
    case 'cert':
      // as stored: the leaf followed by the chain the CA sent
      $content = @file_get_contents($dir . '/cert.pem');
      $filename = $name . '.pem';
    break;
    case 'leaf':
      $content = empty($blocks) ? false : $blocks[0] . "\n";
      $filename = $name . '-cert.pem';
    break;
    case 'chain':
      $content = count($blocks) > 1 ? implode("\n", array_slice($blocks, 1)) . "\n" : false;
      $filename = $name . '-chain.pem';
    break;
    case 'csr':
      $content = @file_get_contents($dir . '/acme.csr');
      $filename = $name . '.csr';
    break;
    default:
      return false;
  }
  if ($content === false || $content === null || $content === '') {
    return false;
  }
  return array('filename' => $filename, 'content' => $content);
}
