<?php
// handle iam authentication
// Which provider to use depends on the address, since a domain can bring its
// own: the login page hands the address over here, and everything downstream
// works from the domain it resolves to.
if (isset($_REQUEST['iam_sso'])){
  $sso_login = strtolower(trim((string)($_REQUEST['iam_sso_login'] ?? $_REQUEST['login_user'] ?? '')));
  $redirect_uri = identity_provider('get-redirect', identity_provider_login_domain($sso_login));
  if (empty($redirect_uri)) {
    // No provider serves that address. Say so rather than bouncing the user
    // back to a login page that looks like it simply forgot the click.
    $_SESSION['return'][] = array(
      'type' => 'danger',
      'log' => array('identity_provider', 'get-redirect', $sso_login),
      'msg' => 'iam_sso_unavailable'
    );
    header('Location: /');
    die();
  }
  header('Location: ' . $redirect_uri);
  die();
}
if ($_SESSION['iam_token'] && $_SESSION['iam_refresh_token']) {
  // Session found, try to refresh with the provider it was opened against
  $isRefreshed = identity_provider('refresh-token');

  if (!$isRefreshed){
    // Session could not be refreshed, redirect to provider
    $redirect_uri = identity_provider('get-redirect', $_SESSION['iam_sso_domain'] ?? '');
    $redirect_uri = !empty($redirect_uri) ? $redirect_uri : '/';
    header('Location: ' . $redirect_uri);
    die();
  }
} elseif ($_GET['code'] && $_GET['state'] === $_SESSION['oauth2state']) {
  // Check given state against previously stored one to mitigate CSRF attack
  // Received access token in $_GET['code']
  // extract info and verify user
  identity_provider('verify-sso');
}

function captcha_login_guard() {
  global $redis;

  if (captcha_guard($GLOBALS['CAPTCHA'], $_POST, get_remote_ip())) {
    return true;
  }

  $_SESSION['return'][] = array(
    'type' => 'danger',
    'log' => array(__FUNCTION__),
    'msg' => 'captcha_failed'
  );

  if (isset($redis)) {
    $redis->publish("F2B_CHANNEL", "mailcow UI: Captcha failed by " . get_remote_ip());
  }
  error_log("mailcow UI: Captcha failed by " . get_remote_ip());
  return false;
}

if (isset($_POST["pw_reset_request"]) && !empty($_POST['username'])) {
  if (!captcha_login_guard()) {
    header("Location: /reset-password");
    exit;
  }
  reset_password("issue", $_POST['username']);
  header("Location: /");
  exit;
}
if (isset($_POST["pw_reset"])) {
  $username = reset_password("check", $_POST['token']);
  $reset_result = reset_password("reset", array(
    'new_password' => $_POST['new_password'],
    'new_password2' => $_POST['new_password2'],
    'token' => $_POST['token'],
    'username' => $username,
    'check_tfa' => True
  ));

  if ($reset_result){
    header("Location: /");
    exit;
  }
}
if (isset($_POST["verify_tfa_login"])) {
  if (verify_tfa_login($_SESSION['pending_mailcow_cc_username'], $_POST)) {
    if ($_SESSION['pending_mailcow_cc_role'] == "user") {
      if (isset($_SESSION['pending_pw_reset_token']) && isset($_SESSION['pending_pw_new_password'])) {
        reset_password("reset", array(
          'new_password' => $_SESSION['pending_pw_new_password'],
          'new_password2' => $_SESSION['pending_pw_new_password'],
          'token' => $_SESSION['pending_pw_reset_token'],
          'username' => $_SESSION['pending_mailcow_cc_username']
        ));
        unset($_SESSION['pending_pw_reset_token']);
        unset($_SESSION['pending_pw_new_password']);
        unset($_SESSION['pending_mailcow_cc_username']);
        unset($_SESSION['pending_tfa_methods']);

        header("Location: /");
        die();
      } else {
        set_user_loggedin_session($_SESSION['pending_mailcow_cc_username']);

        if (isset($_SESSION['oauth2_request'])) {
          $oauth2_request = $_SESSION['oauth2_request'];
          unset($_SESSION['oauth2_request']);
          header('Location: ' . $oauth2_request);
          die();
        }

        $user_details = mailbox("get", "mailbox_details", $_SESSION['mailcow_cc_username']);
        $is_dual = (!empty($_SESSION["dual-login"]["username"])) ? true : false;
        // If pending actions exist, redirect to / to show modal
        if (!empty($_SESSION['pending_tfa_setup']) || !empty($_SESSION['pending_pw_update'])) {
          header("Location: /");
          die();
        }
        if (intval($user_details['attributes']['sogo_access']) == 1 &&
            intval($user_details['attributes']['force_pw_update']) != 1 &&
            getenv('SKIP_SOGO') != "y" &&
            !$is_dual) {
          header("Location: /SOGo/so/");
          die();
        } else {
          header("Location: /user");
          die();
        }
      }
    }
  }

  unset($_SESSION['pending_mailcow_cc_username']);
  unset($_SESSION['pending_mailcow_cc_role']);
  unset($_SESSION['pending_tfa_methods']);
}
if (isset($_POST["verify_fido2_login"])) {
  $res = fido2(array(
    "action" => "verify",
    "token" => $_POST["token"],
    "user" => "user"
  ));
  if (is_array($res) && $res['role'] == "user" && !empty($res['username'])){
    set_user_loggedin_session($res['username']);
    $_SESSION["fido2_cid"] = $res['cid'];
  }
  exit;
}

if (isset($_GET["cancel_tfa_login"])) {
  unset($_SESSION['pending_pw_reset_token']);
  unset($_SESSION['pending_pw_new_password']);
  unset($_SESSION['pending_mailcow_cc_username']);
  unset($_SESSION['pending_mailcow_cc_role']);
  unset($_SESSION['pending_tfa_methods']);

  header("Location: /");
}

if (isset($_GET["cancel_tfa_setup"])) {
  session_regenerate_id(true);
  session_unset();
  session_destroy();
  session_write_close();
  header("Location: /");
  exit();
}

if (isset($_POST["login_user"]) && isset($_POST["pass_user"])) {
  if (!captcha_login_guard()) {
    header("Location: /");
    exit;
  }
  $login_user = strtolower(trim($_POST["login_user"]));
  $as = check_login($login_user, $_POST["pass_user"], array("role" => "user", "service" => "MAILCOWUI"));

  if ($as == "user") {
    set_user_loggedin_session($login_user);
    $http_parameters = explode('&', $_SESSION['index_query_string']);
    unset($_SESSION['index_query_string']);
    if (in_array('mobileconfig', $http_parameters)) {
        if (in_array('only_email', $http_parameters)) {
            header("Location: /mobileconfig.php?only_email");
            die();
        }
        header("Location: /mobileconfig.php");
        die();
    }
    if (isset($_SESSION['oauth2_request'])) {
      $oauth2_request = $_SESSION['oauth2_request'];
      unset($_SESSION['oauth2_request']);
      header('Location: ' . $oauth2_request);
      die();
    }

    $user_details = mailbox("get", "mailbox_details", $login_user);
    $is_dual = (!empty($_SESSION["dual-login"]["username"])) ? true : false;
    // If pending actions exist, redirect to / to show modal
    if (!empty($_SESSION['pending_tfa_setup']) || !empty($_SESSION['pending_pw_update'])) {
      header("Location: /");
      die();
    }
    if (intval($user_details['attributes']['sogo_access']) == 1 &&
        intval($user_details['attributes']['force_pw_update']) != 1 &&
        getenv('SKIP_SOGO') != "y" &&
        !$is_dual) {
      header("Location: /SOGo/so/");
      die();
    } else {
      header("Location: /user");
      die();
    }
	}
	elseif ($as != "pending") {
    unset($_SESSION['pending_mailcow_cc_username']);
    unset($_SESSION['pending_mailcow_cc_role']);
    unset($_SESSION['pending_tfa_methods']);
		unset($_SESSION['mailcow_cc_username']);
		unset($_SESSION['mailcow_cc_role']);
	}
}
?>
