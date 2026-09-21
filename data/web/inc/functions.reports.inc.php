<?php
// DMARC aggregate (rua) and SMTP TLS (TLS-RPT) report statistics.
// report_ingest.py in dovecot-mailcow reads the report mailboxes configured
// here and stores the parsed reports; this side manages the settings and
// aggregates the stored rows for the admin reports page.
//
// Report mailboxes must not use PGP storage: their mail would be encrypted to
// the user's key and could not be parsed. The rule is enforced when a mailbox
// is picked here, and in the other direction when PGP storage is switched on
// for a mailbox or enforced for its domain (see reports_pgp_conflict).

const REPORTS_RETENTION_DEFAULT = 180;

function reports_mailboxes() {
  global $redis;
  try {
    $mailboxes = json_decode((string)$redis->Get('REPORTS_MAILBOXES'), true);
  }
  catch (RedisException $e) {
    return array();
  }
  return is_array($mailboxes) ? array_values($mailboxes) : array();
}

// 'ok', 'missing' or 'pgp' - the same rule report_ingest.py applies
function reports_mailbox_state($username) {
  global $pdo;
  $stmt = $pdo->prepare("SELECT JSON_VALUE(`m`.`attributes`, '$.pgp_storage_encrypt') AS `pgp_mailbox`,
      `d`.`pgp_storage`, `d`.`pgp_enforce`
    FROM `mailbox` `m` JOIN `domain` `d` ON `d`.`domain` = `m`.`domain`
    WHERE `m`.`username` = :username AND `m`.`kind` = ''");
  $stmt->execute(array(':username' => $username));
  $row = $stmt->fetch(PDO::FETCH_ASSOC);
  if (!$row) {
    return 'missing';
  }
  if (pgp_flag($row['pgp_mailbox'] ?? 0) || pgp_domain_enforces($row['pgp_storage'], $row['pgp_enforce'])) {
    return 'pgp';
  }
  return 'ok';
}

// Used by the mailbox and domain PGP settings: returns the report mailbox
// that PGP storage would break, or false. $domain checks every mailbox of it.
function reports_pgp_conflict($username = null, $domain = null) {
  foreach (reports_mailboxes() as $mailbox) {
    if ($username !== null && strcasecmp($mailbox, $username) === 0) {
      return $mailbox;
    }
    if ($domain !== null && strcasecmp(substr(strrchr($mailbox, '@'), 1), $domain) === 0) {
      return $mailbox;
    }
  }
  return false;
}

function reports_days($_data) {
  $days = intval($_data['days'] ?? 30);
  return ($days < 1 || $days > 3650) ? 30 : $days;
}

function reports_domain_filter($_data) {
  $domain = strtolower(trim((string)($_data['domain'] ?? '')));
  return ($domain !== '' && is_valid_domain_name($domain)) ? $domain : '';
}

function reports($_action, $_type, $_data = null) {
  global $pdo;
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
    case 'edit':
      switch ($_type) {
        case 'settings':
          $selected = (array)($_data['mailboxes'] ?? array());
          $mailboxes = array();
          foreach ($selected as $username) {
            $username = strtolower(trim((string)$username));
            if ($username === '') {
              continue;
            }
            if (!filter_var($username, FILTER_VALIDATE_EMAIL)) {
              $_SESSION['return'][] = array(
                'type' => 'danger',
                'log' => array(__FUNCTION__, $_action, $_type, $_data),
                'msg' => array('username_invalid', htmlspecialchars($username))
              );
              return false;
            }
            $state = reports_mailbox_state($username);
            if ($state === 'missing') {
              $_SESSION['return'][] = array(
                'type' => 'danger',
                'log' => array(__FUNCTION__, $_action, $_type, $_data),
                'msg' => array('reports_mailbox_missing', htmlspecialchars($username))
              );
              return false;
            }
            if ($state === 'pgp') {
              $_SESSION['return'][] = array(
                'type' => 'danger',
                'log' => array(__FUNCTION__, $_action, $_type, $_data),
                'msg' => array('reports_mailbox_pgp', htmlspecialchars($username))
              );
              return false;
            }
            $mailboxes[] = $username;
          }
          $retention = intval($_data['retention_days'] ?? REPORTS_RETENTION_DEFAULT);
          if ($retention < 0 || $retention > 3650) {
            $_SESSION['return'][] = array(
              'type' => 'danger',
              'log' => array(__FUNCTION__, $_action, $_type, $_data),
              'msg' => 'reports_retention_invalid'
            );
            return false;
          }
          try {
            $redis->Set('REPORTS_MAILBOXES', json_encode(array_values(array_unique($mailboxes))));
            $redis->Set('REPORTS_RETENTION_DAYS', $retention);
          }
          catch (RedisException $e) {
            $_SESSION['return'][] = array(
              'type' => 'danger',
              'log' => array(__FUNCTION__, $_action, $_type, $_data),
              'msg' => array('redis_error', $e)
            );
            return false;
          }
          $_SESSION['return'][] = array(
            'type' => 'success',
            'log' => array(__FUNCTION__, $_action, $_type, $_data),
            'msg' => 'reports_settings_saved'
          );
          return true;
      }
    break;

    case 'get':
      switch ($_type) {
        case 'settings':
          $retention = $redis->Get('REPORTS_RETENTION_DAYS');
          $status = json_decode((string)$redis->Get('REPORTS_STATUS'), true);
          $selected = reports_mailboxes();
          // Every regular mailbox, so the page can offer them and grey out
          // the ones PGP storage rules out
          $stmt = $pdo->query("SELECT `m`.`username`,
              JSON_VALUE(`m`.`attributes`, '$.pgp_storage_encrypt') AS `pgp_mailbox`,
              `d`.`pgp_storage`, `d`.`pgp_enforce`
            FROM `mailbox` `m` JOIN `domain` `d` ON `d`.`domain` = `m`.`domain`
            WHERE `m`.`kind` = '' ORDER BY `m`.`username`");
          $candidates = array();
          while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
            $candidates[] = array(
              'username' => $row['username'],
              'pgp' => pgp_flag($row['pgp_mailbox'] ?? 0) || pgp_domain_enforces($row['pgp_storage'], $row['pgp_enforce']),
              'selected' => in_array($row['username'], $selected)
            );
          }
          // Aliases that deliver into a report mailbox, i.e. usable as rua=/ruf= targets
          $aliases = array();
          if (!empty($selected)) {
            $stmt = $pdo->query("SELECT `address`, `goto` FROM `alias` WHERE `active` = '1' AND `address` NOT LIKE '@%'");
            while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
              $targets = array_map('trim', explode(',', $row['goto']));
              foreach ($selected as $mailbox) {
                if ($row['address'] !== $mailbox && in_array($mailbox, $targets)) {
                  $aliases[$mailbox][] = $row['address'];
                }
              }
            }
          }
          return array(
            'mailboxes' => $selected,
            'retention_days' => ($retention === false || $retention === null) ? REPORTS_RETENTION_DEFAULT : intval($retention),
            'candidates' => $candidates,
            'aliases' => $aliases,
            'status' => is_array($status) ? $status : new stdClass()
          );

        case 'domains':
          $stmt = $pdo->query("SELECT DISTINCT `domain` FROM `dmarc_reports`
            UNION SELECT DISTINCT `policy_domain` FROM `tlsrpt_policies` WHERE `policy_domain` != ''
            ORDER BY 1");
          return $stmt->fetchAll(PDO::FETCH_COLUMN);

        case 'dmarc':
          $days = reports_days($_data);
          $domain = reports_domain_filter($_data);
          $where = "`r`.`date_end` >= UTC_TIMESTAMP() - INTERVAL :days DAY" . ($domain !== '' ? " AND `r`.`domain` = :domain" : "");
          $params = array(':days' => $days);
          if ($domain !== '') {
            $params[':domain'] = $domain;
          }
          // DMARC passes when either aligned DKIM or aligned SPF passes
          $pass = "(`c`.`dkim_eval` = 'pass' OR `c`.`spf_eval` = 'pass')";

          $stmt = $pdo->prepare("SELECT COUNT(DISTINCT `r`.`id`) AS `reports`,
              COUNT(DISTINCT `r`.`org_name`) AS `reporters`,
              COALESCE(SUM(`c`.`count`), 0) AS `messages`,
              COALESCE(SUM(IF($pass, `c`.`count`, 0)), 0) AS `pass`,
              COALESCE(SUM(IF(`c`.`dkim_eval` = 'pass', `c`.`count`, 0)), 0) AS `dkim_pass`,
              COALESCE(SUM(IF(`c`.`spf_eval` = 'pass', `c`.`count`, 0)), 0) AS `spf_pass`,
              COALESCE(SUM(IF(`c`.`disposition` = 'quarantine', `c`.`count`, 0)), 0) AS `quarantine`,
              COALESCE(SUM(IF(`c`.`disposition` = 'reject', `c`.`count`, 0)), 0) AS `reject`
            FROM `dmarc_reports` `r` LEFT JOIN `dmarc_records` `c` ON `c`.`report` = `r`.`id`
            WHERE $where");
          $stmt->execute($params);
          $totals = $stmt->fetch(PDO::FETCH_ASSOC);

          $stmt = $pdo->prepare("SELECT DATE(`r`.`date_begin`) AS `day`,
              SUM(IF($pass, `c`.`count`, 0)) AS `pass`,
              SUM(IF($pass, 0, `c`.`count`)) AS `fail`
            FROM `dmarc_reports` `r` JOIN `dmarc_records` `c` ON `c`.`report` = `r`.`id`
            WHERE $where GROUP BY `day` ORDER BY `day`");
          $stmt->execute($params);
          $series = $stmt->fetchAll(PDO::FETCH_ASSOC);

          $stmt = $pdo->prepare("SELECT `r`.`domain`, SUM(`c`.`count`) AS `messages`,
              SUM(IF($pass, `c`.`count`, 0)) AS `pass`,
              MAX(`r`.`policy_p`) AS `policy`
            FROM `dmarc_reports` `r` JOIN `dmarc_records` `c` ON `c`.`report` = `r`.`id`
            WHERE $where GROUP BY `r`.`domain` ORDER BY `messages` DESC");
          $stmt->execute($params);
          $domains = $stmt->fetchAll(PDO::FETCH_ASSOC);

          $stmt = $pdo->prepare("SELECT `c`.`source_ip`, `c`.`header_from`,
              SUM(`c`.`count`) AS `messages`,
              SUM(IF($pass, `c`.`count`, 0)) AS `pass`,
              SUM(IF(`c`.`dkim_eval` = 'pass', `c`.`count`, 0)) AS `dkim_pass`,
              SUM(IF(`c`.`spf_eval` = 'pass', `c`.`count`, 0)) AS `spf_pass`,
              SUM(IF(`c`.`disposition` IN ('quarantine', 'reject'), `c`.`count`, 0)) AS `enforced`,
              GROUP_CONCAT(DISTINCT `r`.`org_name` ORDER BY `r`.`org_name` SEPARATOR ', ') AS `reporters`
            FROM `dmarc_reports` `r` JOIN `dmarc_records` `c` ON `c`.`report` = `r`.`id`
            WHERE $where GROUP BY `c`.`source_ip`, `c`.`header_from` ORDER BY `messages` DESC LIMIT 500");
          $stmt->execute($params);
          $sources = $stmt->fetchAll(PDO::FETCH_ASSOC);

          $stmt = $pdo->prepare("SELECT `r`.`id`, `r`.`org_name`, `r`.`domain`, `r`.`date_begin`, `r`.`date_end`,
              `r`.`policy_p`, COALESCE(SUM(`c`.`count`), 0) AS `messages`,
              COALESCE(SUM(IF($pass, 0, `c`.`count`)), 0) AS `fail`
            FROM `dmarc_reports` `r` LEFT JOIN `dmarc_records` `c` ON `c`.`report` = `r`.`id`
            WHERE $where GROUP BY `r`.`id` ORDER BY `r`.`date_end` DESC LIMIT 500");
          $stmt->execute($params);
          $reports = $stmt->fetchAll(PDO::FETCH_ASSOC);

          return array('totals' => $totals, 'series' => $series, 'domains' => $domains,
            'sources' => $sources, 'reports' => $reports);

        case 'dmarc_report':
          $stmt = $pdo->prepare("SELECT * FROM `dmarc_reports` WHERE `id` = :id");
          $stmt->execute(array(':id' => intval($_data['id'] ?? 0)));
          $report = $stmt->fetch(PDO::FETCH_ASSOC);
          if (!$report) {
            return false;
          }
          $stmt = $pdo->prepare("SELECT `source_ip`, `count`, `disposition`, `dkim_eval`, `spf_eval`, `reason`,
              `header_from`, `envelope_from`, `auth_results`
            FROM `dmarc_records` WHERE `report` = :id ORDER BY `count` DESC");
          $stmt->execute(array(':id' => $report['id']));
          $report['records'] = array_map(function ($row) {
            $row['auth_results'] = json_decode((string)$row['auth_results'], true);
            return $row;
          }, $stmt->fetchAll(PDO::FETCH_ASSOC));
          return $report;

        case 'tlsrpt':
          $days = reports_days($_data);
          $domain = reports_domain_filter($_data);
          $where = "`r`.`date_end` >= UTC_TIMESTAMP() - INTERVAL :days DAY" . ($domain !== '' ? " AND `p`.`policy_domain` = :domain" : "");
          $params = array(':days' => $days);
          if ($domain !== '') {
            $params[':domain'] = $domain;
          }

          $stmt = $pdo->prepare("SELECT COUNT(DISTINCT `r`.`id`) AS `reports`,
              COUNT(DISTINCT `r`.`org_name`) AS `reporters`,
              COALESCE(SUM(`p`.`success`), 0) AS `success`,
              COALESCE(SUM(`p`.`failure`), 0) AS `failure`
            FROM `tlsrpt_reports` `r` JOIN `tlsrpt_policies` `p` ON `p`.`report` = `r`.`id`
            WHERE $where");
          $stmt->execute($params);
          $totals = $stmt->fetch(PDO::FETCH_ASSOC);

          $stmt = $pdo->prepare("SELECT DATE(`r`.`date_begin`) AS `day`,
              SUM(`p`.`success`) AS `success`, SUM(`p`.`failure`) AS `failure`
            FROM `tlsrpt_reports` `r` JOIN `tlsrpt_policies` `p` ON `p`.`report` = `r`.`id`
            WHERE $where GROUP BY `day` ORDER BY `day`");
          $stmt->execute($params);
          $series = $stmt->fetchAll(PDO::FETCH_ASSOC);

          $stmt = $pdo->prepare("SELECT `p`.`policy_domain`,
              GROUP_CONCAT(DISTINCT `p`.`policy_type` ORDER BY `p`.`policy_type` SEPARATOR ', ') AS `policy_types`,
              SUM(`p`.`success`) AS `success`, SUM(`p`.`failure`) AS `failure`
            FROM `tlsrpt_reports` `r` JOIN `tlsrpt_policies` `p` ON `p`.`report` = `r`.`id`
            WHERE $where GROUP BY `p`.`policy_domain` ORDER BY `failure` DESC, `success` DESC");
          $stmt->execute($params);
          $domains = $stmt->fetchAll(PDO::FETCH_ASSOC);

          $stmt = $pdo->prepare("SELECT `p`.`policy_domain`, `f`.`result_type`, `f`.`receiving_mx_hostname`,
              `f`.`receiving_ip`, `f`.`sending_mta_ip`, SUM(`f`.`failed_sessions`) AS `sessions`,
              GROUP_CONCAT(DISTINCT `r`.`org_name` ORDER BY `r`.`org_name` SEPARATOR ', ') AS `reporters`,
              MAX(`f`.`additional_info`) AS `additional_info`
            FROM `tlsrpt_reports` `r` JOIN `tlsrpt_policies` `p` ON `p`.`report` = `r`.`id`
              JOIN `tlsrpt_failures` `f` ON `f`.`policy` = `p`.`id`
            WHERE $where
            GROUP BY `p`.`policy_domain`, `f`.`result_type`, `f`.`receiving_mx_hostname`, `f`.`receiving_ip`, `f`.`sending_mta_ip`
            ORDER BY `sessions` DESC LIMIT 500");
          $stmt->execute($params);
          $failures = $stmt->fetchAll(PDO::FETCH_ASSOC);

          $stmt = $pdo->prepare("SELECT `r`.`id`, `r`.`org_name`, `r`.`date_begin`, `r`.`date_end`,
              GROUP_CONCAT(DISTINCT `p`.`policy_domain` ORDER BY `p`.`policy_domain` SEPARATOR ', ') AS `domains`,
              SUM(`p`.`success`) AS `success`, SUM(`p`.`failure`) AS `failure`
            FROM `tlsrpt_reports` `r` JOIN `tlsrpt_policies` `p` ON `p`.`report` = `r`.`id`
            WHERE $where GROUP BY `r`.`id` ORDER BY `r`.`date_end` DESC LIMIT 500");
          $stmt->execute($params);
          $reports = $stmt->fetchAll(PDO::FETCH_ASSOC);

          return array('totals' => $totals, 'series' => $series, 'domains' => $domains,
            'failures' => $failures, 'reports' => $reports);

        case 'tlsrpt_report':
          $stmt = $pdo->prepare("SELECT * FROM `tlsrpt_reports` WHERE `id` = :id");
          $stmt->execute(array(':id' => intval($_data['id'] ?? 0)));
          $report = $stmt->fetch(PDO::FETCH_ASSOC);
          if (!$report) {
            return false;
          }
          $stmt = $pdo->prepare("SELECT * FROM `tlsrpt_policies` WHERE `report` = :id");
          $stmt->execute(array(':id' => $report['id']));
          $report['policies'] = array();
          $failures = $pdo->prepare("SELECT `result_type`, `sending_mta_ip`, `receiving_mx_hostname`, `receiving_ip`,
              `failed_sessions`, `failure_reason_code`, `additional_info`
            FROM `tlsrpt_failures` WHERE `policy` = :id ORDER BY `failed_sessions` DESC");
          while ($policy = $stmt->fetch(PDO::FETCH_ASSOC)) {
            $policy['policy_string'] = json_decode((string)$policy['policy_string'], true);
            $policy['mx_host'] = json_decode((string)$policy['mx_host'], true);
            $failures->execute(array(':id' => $policy['id']));
            $policy['failures'] = $failures->fetchAll(PDO::FETCH_ASSOC);
            $report['policies'][] = $policy;
          }
          return $report;
      }
    break;
  }
  return false;
}
