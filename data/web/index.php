<?php
require_once $_SERVER['DOCUMENT_ROOT'] . '/inc/prerequisites.inc.php';
require_once $_SERVER['DOCUMENT_ROOT'] . '/inc/triggers.user.inc.php';

if (isset($_SESSION['mailcow_cc_role']) && isset($_SESSION['oauth2_request'])) {
  $oauth2_request = $_SESSION['oauth2_request'];
  unset($_SESSION['oauth2_request']);
  header('Location: ' . $oauth2_request);
  exit();
}
elseif (isset($_SESSION['mailcow_cc_role']) && $_SESSION['mailcow_cc_role'] == 'user') {
  if (empty($_SESSION['pending_tfa_setup']) && empty($_SESSION['pending_pw_update'])) {
    $user_details = mailbox("get", "mailbox_details", $_SESSION['mailcow_cc_username']);
    $is_dual = (!empty($_SESSION["dual-login"]["username"])) ? true : false;
    if (intval($user_details['attributes']['sogo_access']) == 1 && !$is_dual && getenv('SKIP_SOGO') != "y") {
      header("Location: /SOGo/so/");
    } else {
      header("Location: /user");
    }
    exit();
  }
}
elseif (isset($_SESSION['mailcow_cc_role']) && $_SESSION['mailcow_cc_role'] == 'admin') {
  if (empty($_SESSION['pending_tfa_setup']) && empty($_SESSION['pending_pw_update'])) {
    header('Location: /admin/dashboard');
    exit();
  }
}
elseif (isset($_SESSION['mailcow_cc_role']) && $_SESSION['mailcow_cc_role'] == 'domainadmin') {
  if (empty($_SESSION['pending_tfa_setup']) && empty($_SESSION['pending_pw_update'])) {
    header('Location: /domainadmin/mailbox');
    exit();
  }
}

$host = strtolower($_SERVER['HTTP_HOST'] ?? '');
if (str_starts_with($host, 'autodiscover.') || str_starts_with($host, 'autoconfig.')) {
  http_response_code(404);
  exit();
}

require_once $_SERVER['DOCUMENT_ROOT'] . '/inc/header.inc.php';
$_SESSION['return_to'] = $_SERVER['REQUEST_URI'];
$_SESSION['index_query_string'] = $_SERVER['QUERY_STRING'];

// Whether to offer SSO at all, and whether the address has to be asked for
// first. With providers configured per domain there is no single redirect to
// send everyone to, so the button collects the address and the domain decides.
// Asking cannot be skipped by listing the domains: that would publish which
// ones this server hosts.
$oidc_authsources = array('keycloak', 'generic-oidc');
$has_global_sso = in_array(identity_provider('get')['authsource'] ?? '', $oidc_authsources, true);
$iam_sso_discovery = false;
foreach (identity_provider_rows() as $iam_domain => $iam_domain_settings) {
  if ($iam_domain !== '' && in_array($iam_domain_settings['authsource'] ?? '', $oidc_authsources, true)) {
    $iam_sso_discovery = true;
    break;
  }
}
$has_iam_sso = $has_global_sso || $iam_sso_discovery;
$custom_login = customize('get', 'custom_login');

$template = 'user_index.twig';
$template_data = [
  'oauth2_request' => @$_SESSION['oauth2_request'],
  'is_mobileconfig' => str_contains($_SESSION['index_query_string'], 'mobileconfig'),
  'login_delay' => @$_SESSION['ldelay'],
  'has_iam_sso' => $has_iam_sso,
  'iam_sso_discovery' => $iam_sso_discovery,
  'custom_login' => $custom_login,
  'captcha' => captcha_template_data($CAPTCHA),
];

$js_minifier->add('/web/js/site/index.js');
require_once $_SERVER['DOCUMENT_ROOT'] . '/inc/footer.inc.php';
