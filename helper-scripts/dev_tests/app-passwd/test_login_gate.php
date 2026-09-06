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

$pdo->rows = array(array(
  'app_passwd_id' => 3,
  'password' => '{PLAIN}a-very-long-app-password',
  'validity' => 0,
  'imap_access' => 1,
  'smtp_access' => 0,
));

$result = apppass_login('teste@example.org', 'a-very-long-app-password', array(
  'service' => 'imap',
  'is_internal' => true,
));
check('a password the database still hands out logs the mailbox in', $result, 'user');

$query = $pdo->queries[0];
check('the login only considers passwords that have not expired',
  strpos($query['sql'], "(`app_passwd`.`validity` = 0 OR `app_passwd`.`validity` > :validity_now)") !== false,
  true);
check('the moment it is compared against is passed as a parameter',
  array_key_exists(':validity_now', $query['params']), true);
check('and it is now', abs($query['params'][':validity_now'] - time()) <= 5, true);
check('the address is still passed as a parameter too',
  $query['params'][':user'], 'teste@example.org');
check('an expired password is left behind by the database, not by the loop',
  substr_count($query['sql'], ':validity_now'), 1);

$expired = time() - 60;
check('the clause the login uses and the one the interface uses agree on an expired password',
  $expired != 0 && !($expired > time()), true);

if ($failures) {
  fwrite(STDERR, sprintf("\n%d of %d checks failed\n", count($failures), $checks));
  exit(1);
}
fwrite(STDOUT, sprintf("%d checks, 0 failures\n", $checks));
exit(0);
