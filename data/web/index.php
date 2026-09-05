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
  if (empty($_SESSION['pending_tfa_setup']) && empty($_SESSION['pending_pw_update']) && empty($_SESSION['pending_pgp_setup'])) {
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
  if (empty($_SESSION['pending_tfa_setup']) && empty($_SESSION['pending_pw_update']) && empty($_SESSION['pending_pgp_setup'])) {
    header('Location: /admin/dashboard');
    exit();
  }
}
elseif (isset($_SESSION['mailcow_cc_role']) && $_SESSION['mailcow_cc_role'] == 'domainadmin') {
  if (empty($_SESSION['pending_tfa_setup']) && empty($_SESSION['pending_pw_update']) && empty($_SESSION['pending_pgp_setup'])) {
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

// Whether to offer SSO at all, and how. With providers configured per domain
// there is no single redirect to send everyone to, so the login asks for the
// address first and the domain it belongs to decides what the next step
// offers. Asking cannot be skipped by listing the domains: that would publish
// which ones this server hosts.
$oidc_authsources = identity_provider_redirect_authsources();
$has_global_sso = in_array(identity_provider('get')['authsource'] ?? '', $oidc_authsources, true);
$identify_first = login_identify_required();
$has_iam_sso = $has_global_sso || $identify_first;

$custom_login = customize('get', 'custom_login');
$force_sso = (($custom_login['force_sso'] ?? 0) == 1);

// The address, whether it was asked for in the first step or handed over in the
// URL. Without providers per domain there is no first step, but the address is
// still worth keeping: it fills in the form the user would otherwise retype.
$login_identify = strtolower(trim((string)($_SESSION['login_identify'] ?? '')));
$identify_options = login_identify_options($identify_first ? $login_identify : '', $force_sso);

$template = 'user_index.twig';
$template_data = [
  'oauth2_request' => @$_SESSION['oauth2_request'],
  'is_mobileconfig' => str_contains($_SESSION['index_query_string'], 'mobileconfig'),
  'login_delay' => @$_SESSION['ldelay'],
  'has_iam_sso' => $has_iam_sso,
  'identify_first' => $identify_first,
  'login_identify' => $login_identify,
  'identify_sso' => $identify_options['sso'],
  'custom_login' => $custom_login,
  'captcha' => captcha_template_data($CAPTCHA),
];

$js_minifier->add('/web/js/site/index.js');
require_once $_SERVER['DOCUMENT_ROOT'] . '/inc/footer.inc.php';
