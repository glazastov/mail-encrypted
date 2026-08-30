<?php
require_once $_SERVER['DOCUMENT_ROOT'] . '/inc/prerequisites.inc.php';

header('Content-Type: application/json');

if (!isset($_SESSION['mailcow_cc_role']) || $_SESSION['mailcow_cc_role'] !== 'admin') {
  http_response_code(403);
  echo json_encode(array('status' => 'error', 'message' => 'access denied'));
  exit;
}

$owner   = $GLOBALS['MAILCOW_GIT_OWNER'] ?? '';
$repo    = $GLOBALS['MAILCOW_GIT_REPO'] ?? '';
$branch  = $GLOBALS['MAILCOW_BRANCH'] ?? 'master';
$current = $GLOBALS['MAILCOW_GIT_VERSION'] ?? '';
$head    = $GLOBALS['MAILCOW_GIT_HEAD_COMMIT'] ?? ($GLOBALS['MAILCOW_GIT_COMMIT'] ?? '');

$up_owner = $GLOBALS['MAILCOW_UPSTREAM_OWNER'] ?? 'mailcow';
$up_repo  = $GLOBALS['MAILCOW_UPSTREAM_REPO'] ?? 'mailcow-dockerized';
$up_base  = $GLOBALS['MAILCOW_UPSTREAM_BASE_COMMIT'] ?? '';

$cache_key = 'MAILCOW_UPDATE_CHECK/' . md5($current . '|' . $head . '|' . $up_base);

$cached = $redis->get($cache_key);
if ($cached !== false) {
  echo $cached;
  exit;
}

function github_get($url) {
  $headers = array('Accept: application/vnd.github+json');
  $token = getenv('GITHUB_TOKEN');
  if (!empty($token)) $headers[] = 'Authorization: Bearer ' . $token;

  $ch = curl_init($url);
  curl_setopt_array($ch, array(
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_USERAGENT      => 'mailcow-update-check',
    CURLOPT_TIMEOUT        => 10,
    CURLOPT_HTTPHEADER     => $headers,
  ));
  $body = curl_exec($ch);
  $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
  curl_close($ch);
  if ($body === false || $code !== 200) return false;
  $json = json_decode($body, true);
  return is_array($json) ? $json : false;
}

function github_compare($owner, $repo, $base, $ref) {
  $cmp = github_get(sprintf(
    'https://api.github.com/repos/%s/%s/compare/%s...%s',
    rawurlencode($owner), rawurlencode($repo), rawurlencode($base), rawurlencode($ref)
  ));
  if ($cmp === false || empty($cmp['status'])) return false;
  return array(
    'status'   => $cmp['status'],
    'ahead_by' => (int)($cmp['ahead_by'] ?? 0),
    'url'      => $cmp['html_url'] ?? '',
  );
}

function check_own($owner, $repo, $branch, $current, $head) {
  $result = array('repo' => $owner . '/' . $repo, 'status' => 'unknown');
  if (empty($owner) || empty($repo)) return $result;

  if (!empty($current)) {
    $latest  = github_get("https://api.github.com/repos/{$owner}/{$repo}/releases/latest");
    $release = github_get("https://api.github.com/repos/{$owner}/{$repo}/releases/tags/{$current}");
    if ($latest !== false && $release !== false &&
        !empty($latest['tag_name']) && !empty($latest['created_at']) && !empty($release['created_at'])) {
      if (strtotime($latest['created_at']) <= strtotime($release['created_at'])) {
        $result['status'] = 'no_update';
      } else {
        $result['status'] = 'update_available';
        $result['tag']    = $latest['tag_name'];
        $result['url']    = $latest['html_url'] ?? "https://github.com/{$owner}/{$repo}/releases/tag/" . $latest['tag_name'];
      }
      return $result;
    }
  }

  if (empty($head)) return $result;

  $cmp = github_compare($owner, $repo, $head, $branch);
  if ($cmp === false) return $result;

  if ($cmp['status'] === 'ahead' || ($cmp['status'] === 'diverged' && $cmp['ahead_by'] > 0)) {
    $result['status']  = 'update_available';
    $result['commits'] = $cmp['ahead_by'];
    $result['url']     = $cmp['url'];
  } else {
    $result['status'] = 'no_update';
  }
  return $result;
}

function check_upstream($owner, $repo, $base) {
  $result = array('repo' => $owner . '/' . $repo, 'status' => 'unknown');

  $latest = github_get("https://api.github.com/repos/{$owner}/{$repo}/releases/latest");
  if ($latest === false || empty($latest['tag_name'])) return $result;

  $result['tag'] = $latest['tag_name'];
  $result['url'] = $latest['html_url'] ?? "https://github.com/{$owner}/{$repo}/releases/tag/" . $latest['tag_name'];

  if (empty($base)) return $result;

  $cmp = github_compare($owner, $repo, $base, $latest['tag_name']);
  if ($cmp === false) return $result;

  if ($cmp['status'] === 'ahead' || ($cmp['status'] === 'diverged' && $cmp['ahead_by'] > 0)) {
    $result['status']  = 'update_available';
    $result['commits'] = $cmp['ahead_by'];
  } else {
    $result['status'] = 'no_update';
  }
  return $result;
}

$own      = check_own($owner, $repo, $branch, $current, $head);
$upstream = check_upstream($up_owner, $up_repo, $up_base);

$result = json_encode(array('status' => 'ok', 'own' => $own, 'upstream' => $upstream));

$ttl = ($own['status'] === 'unknown' || $upstream['status'] === 'unknown') ? 300 : 3600;
$redis->setex($cache_key, $ttl, $result);
echo $result;
