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
  'mailcow_cc_username' => 'admin',
  'is_dual' => false,
);

$lang = json_decode(file_get_contents($web . '/lang/lang.en-gb.json'), true);
if (!$lang) {
  fwrite(STDERR, "could not read lang.en-gb.json\n");
  exit(1);
}

function domain_form($twig, $lang, $role, $pgp_storage, $pgp_enforce, $tfa_enforce) {
  global $base;
  return $twig->render('edit/domain.twig', array_merge($base, array(
    'lang' => $lang,
    'mailcow_cc_role' => $role,
    'acl' => array('domain_desc' => 1, 'domain_relayhost' => 1),
    'domain' => 'example.org',
    'result' => array(
      'domain_name' => 'example.org',
      'domain_h_name' => 'example.org',
      'description' => '',
      'active' => '1',
      'gal' => '1',
      'backupmx' => '0',
      'relay_all_recipients' => '0',
      'relay_unknown_only' => '0',
      'relayhost' => '0',
      'max_num_aliases_for_domain' => 400,
      'max_num_mboxes_for_domain' => 10,
      'def_quota_for_mbox' => 3072,
      'max_quota_for_mbox' => 10240,
      'max_quota_for_domain' => 10240,
      'pgp_storage' => $pgp_storage,
      'pgp_enforce' => $pgp_enforce,
      'tfa_enforce' => $tfa_enforce,
      'rl' => array(),
      'created' => '',
      'modified' => '',
      'tags' => array(),
    ),
    'relayhosts' => array(),
    'templates' => array(),
  )));
}

function settings_tab($twig, $lang, $attributes, $domain_pgp_storage, $domain_pgp_enforce) {
  global $base;
  return $twig->render('user/tab-user-settings.twig', array_merge($base, array(
    'lang' => $lang,
    'mailcow_cc_username' => 'teste@example.org',
    'mailcow_cc_role' => 'user',
    'acl' => array(),
    'tags' => array(),
    'mailboxdata' => array(
      'attributes' => $attributes,
      'domain_pgp_storage' => $domain_pgp_storage,
      'domain_pgp_enforce' => $domain_pgp_enforce,
      'tags' => array(),
    ),
    'get_tls_policy' => array('tls_enforce_in' => '0', 'tls_enforce_out' => '0'),
    'user_spam_score' => array('spam_score' => '5,15'),
    'is_dual' => false,
    'pushover_data' => array(),
    'quarantine_notification' => 'never',
    'quarantine_category' => 'reject',
  )));
}

$page = domain_form($twig, $lang, 'admin', '1', 'none', 'none');
check('the appliance admin is offered the PGP requirement',
  substr_count($page, 'name="pgp_enforce"'), 2);
check('unchecking it posts no requirement',
  str_contains($page, '<input type="hidden" value="none" name="pgp_enforce">'), true);
check('checking it records the appliance admin as its author',
  str_contains($page, 'value="admin" name="pgp_enforce"'), true);
check('the same for two-factor',
  str_contains($page, 'value="admin" name="tfa_enforce"'), true);
check('nothing is required yet', str_contains($page, 'name="pgp_enforce" checked'), false);

$page = domain_form($twig, $lang, 'admin', '1', 'domainadmin', 'domainadmin');
check('an admin saving what the domain admin required keeps it theirs',
  str_contains($page, 'value="domainadmin" name="pgp_enforce" checked'), true);
check('and does not silently take over the two-factor one either',
  str_contains($page, 'value="domainadmin" name="tfa_enforce" checked'), true);

$page = domain_form($twig, $lang, 'domainadmin', '1', 'none', 'none');
check('a domain admin may require it for its own domain',
  str_contains($page, 'value="domainadmin" name="pgp_enforce"'), true);
check('and is never offered the appliance admin\'s level',
  str_contains($page, 'value="admin" name="pgp_enforce"'), false);

$page = domain_form($twig, $lang, 'domainadmin', '1', 'admin', 'admin');
check('a requirement the appliance admin set is locked for the domain admin',
  str_contains($page, 'name="pgp_enforce" checked disabled'), true);
check('and nothing is posted that could lift it',
  str_contains($page, '<input type="hidden" value="none" name="pgp_enforce">'), false);
check('the two-factor requirement is locked the same way',
  str_contains($page, 'name="tfa_enforce" checked disabled'), true);
check('and nothing is posted that could lift that one either',
  str_contains($page, '<input type="hidden" value="none" name="tfa_enforce">'), false);
check('the domain admin is told why',
  str_contains($page, $lang['edit']['pgp_enforce_locked']), true);

$page = domain_form($twig, $lang, 'admin', '1', 'admin', 'admin');
check('the appliance admin can still lift its own requirement',
  str_contains($page, '<input type="hidden" value="none" name="pgp_enforce">'), true);
check('and is not shown a lock', str_contains($page, 'name="pgp_enforce" checked disabled'), false);

$off = array('pgp_storage_encrypt' => '0', 'pgp_public_key' => '', 'pgp_failure_mode' => 'deliver');

$page = settings_tab($twig, $lang, $off, '1', 'none');
check('an unenforced mailbox owns the switch',
  str_contains($page, 'name="pgp_storage_encrypt" value="1" disabled'), false);
check('and its form falls back to off',
  str_contains($page, '<input type="hidden" value="0" name="pgp_storage_encrypt">'), true);

$page = settings_tab($twig, $lang, $off, '1', 'admin');
check('an enforced mailbox cannot turn the switch off',
  str_contains($page, 'name="pgp_storage_encrypt" value="1" checked disabled'), true);
check('and its form falls back to on rather than to off',
  str_contains($page, '<input type="hidden" value="1" name="pgp_storage_encrypt">'), true);
check('the owner is told the domain requires it',
  str_contains($page, $lang['user']['pgp_domain_enforced']), true);

$page = settings_tab($twig, $lang, $off, '0', 'admin');
check('a domain that no longer allows PGP does not claim to require it',
  str_contains($page, $lang['user']['pgp_domain_enforced']), false);
check('and the switch stays off there',
  str_contains($page, '<input type="hidden" value="0" name="pgp_storage_encrypt">'), true);

$page = $twig->render('base.twig', array_merge($base, array(
  'lang' => $lang,
  'mailcow_cc_role' => 'user',
  'acl' => array(),
  'pending_pgp_setup' => true,
  'csrf_token' => 'token',
)));
check('a mailbox that must set a key is asked for one before anything else',
  str_contains($page, 'id="SetupPGPModal"'), true);
check('the modal cannot be dismissed',
  str_contains($page, "backdrop: 'static'"), true);
check('and it says why it is there',
  str_contains($page, $lang['user']['pgp_setup_required']), true);

$page = $twig->render('base.twig', array_merge($base, array(
  'lang' => $lang,
  'mailcow_cc_role' => 'user',
  'acl' => array(),
  'pending_pgp_setup' => false,
  'csrf_token' => 'token',
)));
check('nobody else is asked', str_contains($page, 'id="SetupPGPModal"'), false);

if ($failures) {
  fwrite(STDERR, sprintf("\n%d of %d checks failed\n", count($failures), $checks));
  exit(1);
}
fwrite(STDOUT, sprintf("%d checks, 0 failures\n", $checks));
exit(0);
