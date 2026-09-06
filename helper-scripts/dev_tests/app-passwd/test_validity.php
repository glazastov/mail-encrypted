#!/usr/bin/env php
<?php

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

if (!class_exists('PDO')) {
  class PDO { const FETCH_ASSOC = 2; }
}

class StubStatement {
  private $pdo;
  private $sql;
  public function __construct($pdo, $sql) { $this->pdo = $pdo; $this->sql = $sql; }
  public function execute($params = null) {
    $this->pdo->queries[] = array('sql' => $this->sql, 'params' => $params);
    return true;
  }
  public function fetch($mode = null) { return $this->pdo->row; }
  public function fetchAll($mode = null) { return array($this->pdo->row); }
}

class StubPdo {
  public $row = false;
  public $queries = array();
  public function prepare($sql) { return new StubStatement($this, preg_replace('/\s+/', ' ', $sql)); }
  public function reset() { $this->queries = array(); }
}

function hasMailboxObjectAccess($username, $role, $object) { return true; }
function mailbox($action, $object, $username = null) { return array('domain' => 'example.org'); }
function password_check($password, $password2) { return true; }
function hash_password($password) { return '{SSHA256}stub'; }

$pdo = new StubPdo();
$lang = array();
$_SESSION['mailcow_cc_username'] = 'teste@example.org';
$_SESSION['mailcow_cc_role'] = 'user';
$_SESSION['return'] = array();

require_once __DIR__ . '/../../../data/web/inc/functions.app_passwd.inc.php';

function statements($fragment) {
  global $pdo;
  $found = array();
  foreach ($pdo->queries as $query) {
    if (strpos($query['sql'], $fragment) !== false) {
      $found[] = $query;
    }
  }
  return $found;
}

function last_message() {
  $return = end($_SESSION['return']);
  if (!$return) {
    return null;
  }
  return is_array($return['msg']) ? $return['msg'][0] : $return['msg'];
}

function add($data) {
  global $pdo;
  $pdo->reset();
  $_SESSION['return'] = array();
  return app_passwd('add', array_merge(array(
    'app_name' => 'thunderbird',
    'app_passwd' => 'a-very-long-app-password',
    'app_passwd2' => 'a-very-long-app-password',
    'active' => 1,
    'protocols' => array('imap_access', 'smtp_access'),
  ), $data));
}

function edit($data, $stored_validity = 0) {
  global $pdo;
  $pdo->row = array(
    'id' => 7,
    'name' => 'thunderbird',
    'mailbox' => 'teste@example.org',
    'validity' => $stored_validity,
    'imap_access' => 1,
    'smtp_access' => 1,
    'dav_access' => 0,
    'eas_access' => 0,
    'pop3_access' => 0,
    'sieve_access' => 0,
    'active' => 1,
  );
  $pdo->reset();
  $_SESSION['return'] = array();
  return app_passwd('edit', array_merge(array('id' => 7), $data));
}

function near($actual, $expected) {
  return is_int($actual) && abs($actual - $expected) <= 5;
}

check('a lifetime of zero hours never expires', app_passwd_expiry(0), 0);
check('and so does the string the form posts for it', app_passwd_expiry('0'), 0);
check('a day of validity becomes the moment it ends',
  near(app_passwd_expiry(24), time() + 86400), true);
check('the hours arrive from the API as a string just the same',
  near(app_passwd_expiry('720'), time() + 720 * 3600), true);
check('ten years is as long as a password may live',
  near(app_passwd_expiry(87600), time() + 87600 * 3600), true);
check('a day longer than that is refused', app_passwd_expiry(87601), false);
check('a negative lifetime is refused', app_passwd_expiry(-1), false);
check('a lifetime that is not a number is refused', app_passwd_expiry('soon'), false);
check('a fractional lifetime is refused', app_passwd_expiry('1.5'), false);
check('an empty lifetime is refused rather than read as never', app_passwd_expiry(''), false);

check('a password that never expires is not expired', app_passwd_expired(0), false);
check('one whose moment has passed is', app_passwd_expired(time() - 1), true);
check('one whose moment is still ahead is not', app_passwd_expired(time() + 60), false);
check('the timestamp is read from the string the database returns',
  app_passwd_expired(strval(time() - 1)), true);

add(array());
$inserts = statements('INSERT INTO `app_passwd`');
check('a password created without a lifetime is stored', count($inserts), 1);
check('and never expires, as it always did', $inserts[0]['params'][':validity'], 0);

add(array('validity' => '720'));
$inserts = statements('INSERT INTO `app_passwd`');
check('a password created with a lifetime stores when it ends',
  near($inserts[0]['params'][':validity'], time() + 720 * 3600), true);

check('creating one with a lifetime that makes no sense fails',
  add(array('validity' => 'soon')), false);
check('and stores nothing', count(statements('INSERT INTO `app_passwd`')), 0);
check('saying why', last_message(), 'app_passwd_validity_invalid');

edit(array('validity' => '24'));
$updates = statements('UPDATE `app_passwd` SET `name`');
check('editing a password writes the new moment it ends',
  near($updates[0]['params'][':validity'], time() + 86400), true);

edit(array('validity' => '0'), time() + 86400);
$updates = statements('UPDATE `app_passwd` SET `name`');
check('a lifetime of zero takes an expiry away', $updates[0]['params'][':validity'], 0);

edit(array(), time() + 86400);
$updates = statements('UPDATE `app_passwd` SET `name`');
check('an edit that says nothing about the lifetime keeps the one stored',
  $updates[0]['params'][':validity'], time() + 86400);

edit(array('validity' => ''), time() + 86400);
$updates = statements('UPDATE `app_passwd` SET `name`');
check('and so does the form field left on keep current',
  $updates[0]['params'][':validity'], time() + 86400);

edit(array('validity' => 'soon'), time() + 86400);
check('an edit with a lifetime that makes no sense changes nothing',
  count(statements('UPDATE `app_passwd` SET `name`')), 0);
check('and says why', last_message(), 'app_passwd_validity_invalid');

if ($failures) {
  fwrite(STDERR, sprintf("\n%d of %d checks failed\n", count($failures), $checks));
  exit(1);
}
fwrite(STDOUT, sprintf("%d checks, 0 failures\n", $checks));
exit(0);
