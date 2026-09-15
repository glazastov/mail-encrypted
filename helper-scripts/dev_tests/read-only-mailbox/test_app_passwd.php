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
  public function fetch($mode = null) { return $this->pdo->rows ? $this->pdo->rows[0] : false; }
  public function fetchAll($mode = null) { return $this->pdo->rows; }
}

class StubPdo {
  public $rows = array();
  public $queries = array();
  public function prepare($sql) { return new StubStatement($this, preg_replace('/\s+/', ' ', $sql)); }
}

function verify_hash($hash, $password) { return $hash === '{PLAIN}' . $password; }

$pdo = new StubPdo();
$_SESSION['return'] = array();

require_once __DIR__ . '/../../../data/web/inc/functions.auth.inc.php';

// every protocol flag is on, so only the mailbox status can refuse the login
$pdo->rows = array(array(
  'app_passwd_id' => 7,
  'password' => '{PLAIN}a-very-long-app-password',
  'validity' => 0,
  'mailbox_active' => '3',
  'imap_access' => 1,
  'pop3_access' => 1,
  'smtp_access' => 1,
  'sieve_access' => 1,
  'eas_access' => 1,
  'dav_access' => 1,
));

$login = function ($service) {
  return apppass_login('arquivo@example.org', 'a-very-long-app-password', array(
    'service' => $service,
    'is_internal' => true,
  ));
};

check('a read-only mailbox reads over IMAP with an app password', $login('imap'), 'user');
check('and over POP3', $login('pop3'), 'user');
check('SOGo (service NONE) still accepts it', $login('NONE'), 'user');
foreach (array('smtp', 'sieve', 'eas', 'dav') as $service) {
  check("but $service refuses it", $login($service), false);
}

check('the database hands out app passwords of read-only mailboxes',
  strpos($pdo->queries[0]['sql'], "`mailbox`.`active` IN ('1', '3')") !== false, true);
check('and reports the status the loop decides on',
  strpos($pdo->queries[0]['sql'], "`mailbox`.`active` as `mailbox_active`") !== false, true);

$pdo->rows[0]['mailbox_active'] = '1';
check('an active mailbox keeps SMTP', $login('smtp'), 'user');

if ($failures) {
  fwrite(STDERR, sprintf("\n%d of %d checks failed\n", count($failures), $checks));
  exit(1);
}
fwrite(STDOUT, sprintf("%d checks, 0 failures\n", $checks));
exit(0);
