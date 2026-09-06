#!/usr/bin/env php
<?php

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

$base = array(
  'ui_texts' => array('main_name' => 'mailcow', 'title_name' => 'mailcow', 'apps_name' => 'apps'),
  'available_languages' => array('en-gb' => 'English'),
  'mailcow_locale' => 'en-gb',
  'css_path' => '/css/site.css',
  'js_path' => '/js/site.js',
  'mailcow_apps' => array(),
  'app_links' => array(),
  'custom_login' => array(),
  'skip_sogo' => true,
  'mailcow_cc_username' => 'teste@example.org',
  'mailcow_cc_role' => 'user',
  'is_dual' => false,
  'acl' => array(),
  'csrf_token' => 'token',
);

$lang = json_decode(file_get_contents($web . '/lang/lang.en-gb.json'), true);
if (!$lang) {
  fwrite(STDERR, "could not read lang.en-gb.json\n");
  exit(1);
}

function add_modal($twig, $lang) {
  global $base;
  return $twig->render('modals/user.twig', array_merge($base, array(
    'lang' => $lang,
    'mailboxdata' => array('attributes' => array(), 'tags' => array()),
    'user_get_alias_details' => array('alias_domains' => array()),
    'number_of_app_passwords' => 0,
    'tfa_data' => array('additional' => array()),
    'fido2_data' => array(),
  )));
}

function edit_form($twig, $lang, $validity) {
  global $base;
  return $twig->render('edit/app-passwd.twig', array_merge($base, array(
    'lang' => $lang,
    'result' => array(
      'id' => 7,
      'name' => 'thunderbird',
      'active' => '1',
      'validity' => $validity,
      'expired' => $validity != 0 && $validity <= time(),
      'imap_access' => 1,
      'smtp_access' => 1,
      'eas_access' => 0,
      'dav_access' => 0,
      'pop3_access' => 0,
      'sieve_access' => 0,
    ),
  )));
}

$page = add_modal($twig, $lang);
check('creating an app password asks how long it should live',
  substr_count($page, 'name="validity"'), 1);
check('and it may be told never to expire',
  str_contains($page, '<option value="0">' . $lang['user']['forever'] . '</option>'), true);
check('ninety days is what it offers unless told otherwise',
  str_contains($page, '<option value="2160" selected>'), true);
check('a year is offered as well', str_contains($page, '<option value="8760">'), true);
check('but never longer than the ten years the API accepts',
  str_contains($page, '<option value="87600"'), false);

$page = edit_form($twig, $lang, 0);
check('editing an app password offers the same choice',
  substr_count($page, 'name="validity"'), 1);
check('and leaving the choice alone changes nothing',
  str_contains($page, '<option value="" selected>' . $lang['edit']['app_passwd_validity_keep'] . '</option>'), true);
check('one that never expires says so',
  str_contains($page, $lang['edit']['app_passwd_validity_forever']), true);

$expires = mktime(12, 0, 0, 6, 1, 2027);
$page = edit_form($twig, $lang, $expires);
check('one with an expiry says when it ends',
  str_contains($page, date('Y-m-d H:i', $expires)), true);
check('and does not also claim to live forever',
  str_contains($page, $lang['edit']['app_passwd_validity_forever']), false);
check('an expiry still ahead is not announced as passed',
  str_contains($page, $lang['edit']['app_passwd_expired']), false);

$page = edit_form($twig, $lang, time() - 60);
check('one that has already expired is announced as such',
  str_contains($page, $lang['edit']['app_passwd_expired']), true);

if ($failures) {
  fwrite(STDERR, sprintf("\n%d of %d checks failed\n", count($failures), $checks));
  exit(1);
}
fwrite(STDOUT, sprintf("%d checks, 0 failures\n", $checks));
exit(0);
