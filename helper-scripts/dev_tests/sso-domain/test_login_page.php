#!/usr/bin/env php
<?php
/* What the user login page actually renders for each of those decisions.
 *
 * The rule itself is checked in test_login_identify.php; this renders the page
 * around it, because a decision that never reaches a form is no decision at
 * all. It also keeps the two-step login honest: the first step must not carry
 * a password field, and the second must carry the address it was given so the
 * form that follows knows who is logging in.
 *
 * Renders the real template with the real language file, so a missing key or a
 * broken branch fails here rather than on someone's login page.
 *
 *   ./test_login_page.php
 */

$web = __DIR__ . '/../../../data/web';
require_once $web . '/inc/lib/vendor/autoload.php';

$failures = array();
$checks = 0;

function check($name, $actual, $expected) {
  global $failures, $checks;
  $checks++;
  if ($actual === $expected) {
    return;
  }
  $failures[] = $name;
  fwrite(STDERR, sprintf("FAIL %s\n  expected: %s\n  actual:   %s\n",
    $name, var_export($expected, true), var_export($actual, true)));
}

$loader = new Twig\Loader\FilesystemLoader($web . '/templates');
$twig = new Twig\Environment($loader);
$twig->addFunction(new Twig\TwigFunction('query_string', function (array $params = array()) {
  return http_build_query($params);
}));
$twig->addFunction(new Twig\TwigFunction('is_uri', function (string $uri, string $where = null) { return false; }));
$twig->addFilter(new Twig\TwigFilter('rot13', 'str_rot13'));
$twig->addFilter(new Twig\TwigFilter('base64_encode', 'base64_encode'));
$twig->addFilter(new Twig\TwigFilter('formatBytes', function ($bytes) { return $bytes; }));

$lang = json_decode(file_get_contents($web . '/lang/lang.en-gb.json'), true);
if (!$lang) {
  fwrite(STDERR, "could not read lang.en-gb.json\n");
  exit(1);
}

function login_page($twig, $lang, $context) {
  return $twig->render('user_index.twig', array_merge(array(
    'lang' => $lang,
    'ui_texts' => array('main_name' => 'mailcow', 'title_name' => 'mailcow'),
    'available_languages' => array('en-gb' => 'English'),
    'mailcow_locale' => 'en-gb',
    'css_path' => '/css/site.css',
    'js_path' => '/js/site.js',
    'mailcow_apps' => array(),
    'app_links' => array(),
    'custom_login' => array(),
    'captcha' => null,
    'has_iam_sso' => false,
    'identify_first' => false,
    'login_identify' => '',
    'identify_sso' => false,
  ), $context));
}

// --- an appliance where nothing depends on the address ----------------------
// No domain brought a provider of its own, so the login keeps the single form
// and the single button it always had.
$page = login_page($twig, $lang, array('has_iam_sso' => true));
check('one form asks for both', str_contains($page, 'name="login_user"') && str_contains($page, 'name="pass_user"'), true);
check('the provider is one link away', str_contains($page, 'href="/?iam_sso=1"'), true);
check('nothing is asked in two steps', str_contains($page, 'name="login_identify"'), false);
// An address given in the URL is still worth something here: it fills the form
// in rather than asking for what the link already said.
$page = login_page($twig, $lang, array('has_iam_sso' => true, 'login_identify' => 'joao@mail.com'));
check('an address from the URL fills the form in', str_contains($page, 'value="joao@mail.com"'), true);

// --- first step: the address and nothing else -------------------------------
$page = login_page($twig, $lang, array('has_iam_sso' => true, 'identify_first' => true));
check('the address is asked for on its own', str_contains($page, 'name="login_identify"'), true);
check('no password is asked for yet', str_contains($page, 'name="pass_user"'), false);
// Which domains have a provider is exactly what the page must not say, so
// there is nothing to send anyone to before the address is known.
check('no provider is offered yet', str_contains($page, 'name="iam_sso"'), false);
check('and none is linked to either', str_contains($page, 'iam_sso=1"'), false);
check('the continue button is labelled', str_contains($page, $lang['login']['continue_login']), true);

// --- second step, a domain without a provider -------------------------------
$page = login_page($twig, $lang, array(
  'has_iam_sso' => true, 'identify_first' => true, 'login_identify' => 'user@shared.tld'));
check('the address is shown back', str_contains($page, 'user@shared.tld'), true);
check('and can be corrected', str_contains($page, 'login_forget=1'), true);
check('the password is asked for', str_contains($page, 'name="pass_user"'), true);
check('carrying the address it belongs to', str_contains($page, 'name="login_user" value="user@shared.tld"'), true);
check('no provider is offered', str_contains($page, 'name="iam_sso"'), false);

// --- second step, a domain with a provider ----------------------------------
$page = login_page($twig, $lang, array(
  'has_iam_sso' => true, 'identify_first' => true,
  'login_identify' => 'user@tenant.tld', 'identify_sso' => true));
check('the provider is offered', str_contains($page, 'name="iam_sso" value="1"'), true);
check('for the address that was given', str_contains($page, 'name="iam_sso_login" value="user@tenant.tld"'), true);
check('the address is not asked for again', str_contains($page, 'name="login_identify"'), false);
check('a password is still accepted', str_contains($page, 'name="pass_user"'), true);

// --- second step with single sign-on forced ---------------------------------
$page = login_page($twig, $lang, array(
  'has_iam_sso' => true, 'identify_first' => true, 'custom_login' => array('force_sso' => 1),
  'login_identify' => 'user@tenant.tld', 'identify_sso' => true));
check('only the provider is offered', str_contains($page, 'name="iam_sso" value="1"'), true);
check('no password is accepted', str_contains($page, 'name="pass_user"'), false);
check('nor a security key', str_contains($page, 'id="fido2-login"'), false);

// Forced, with no provider serving the address: there is no way in, and saying
// so beats rendering a card with nothing on it.
$page = login_page($twig, $lang, array(
  'has_iam_sso' => true, 'identify_first' => true, 'custom_login' => array('force_sso' => 1),
  'login_identify' => 'user@shared.tld'));
check('the dead end is spelled out', str_contains($page, $lang['danger']['iam_sso_unavailable']), true);
check('with no password to try', str_contains($page, 'name="pass_user"'), false);
check('and no provider to try', str_contains($page, 'name="iam_sso"'), false);

if ($failures) {
  fwrite(STDERR, sprintf("\n%d of %d checks failed\n", count($failures), $checks));
  exit(1);
}
fwrite(STDOUT, sprintf("%d checks, 0 failures\n", $checks));
exit(0);
