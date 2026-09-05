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

class StubStatement {
  private $pdo;
  public function __construct($pdo) { $this->pdo = $pdo; }
  public function execute($params = null) { $this->pdo->calls[] = $params; return true; }
  public function fetch($mode = null) { return $this->pdo->row; }
  public function fetchColumn($n = 0) { return $this->pdo->column; }
}

class StubPdo {
  public $row = false;
  public $column = false;
  public $sql = '';
  public $calls = array();
  public function prepare($sql) { $this->sql = preg_replace('/\s+/', ' ', $sql); return new StubStatement($this); }
}

$pdo = new StubPdo();
require_once __DIR__ . '/../../../data/web/inc/functions.mailbox.inc.php';

function mailbox_row($force_tfa, $tfa_enforce) {
  return array(
    'attributes' => json_encode(array('force_tfa' => $force_tfa)),
    'tfa_enforce' => $tfa_enforce,
  );
}

$pdo->row = mailbox_row('1', 'none');
check('a mailbox told to keep two-factor may not remove it',
  tfa_removal_blocked('teste@example.org', 'user'), true);

$pdo->row = mailbox_row('0', 'none');
check('a mailbox nobody requires it of may remove it',
  tfa_removal_blocked('teste@example.org', 'user'), false);

$pdo->row = mailbox_row('0', 'admin');
check('a domain the appliance admin requires it of blocks removal',
  tfa_removal_blocked('teste@example.org', 'user'), true);

$pdo->row = mailbox_row('0', 'domainadmin');
check('a domain its own admin requires it of blocks removal',
  tfa_removal_blocked('teste@example.org', 'user'), true);

check('the mailbox query joins the domain policy',
  strpos($pdo->sql, "IFNULL(`domain`.`tfa_enforce`, 'none')") !== false, true);
check('the mailbox query is parameterised',
  end($pdo->calls), array(':username' => 'teste@example.org'));

$pdo->row = false;
check('a mailbox that does not exist blocks nothing',
  tfa_removal_blocked('nobody@example.org', 'user'), false);

$pdo->column = '1';
check('an admin told to keep two-factor may not remove it',
  tfa_removal_blocked('admin', 'admin'), true);
check('the admin lookup reads the admin table, not the mailbox one',
  strpos($pdo->sql, 'FROM `admin`') !== false, true);

$pdo->column = '0';
check('an admin nobody requires it of may remove it',
  tfa_removal_blocked('admin', 'admin'), false);
check('a domain admin is read from the admin table too',
  tfa_removal_blocked('da@example.org', 'domainadmin'), false);

if ($failures) {
  fwrite(STDERR, sprintf("\n%d of %d checks failed\n", count($failures), $checks));
  exit(1);
}
fwrite(STDOUT, sprintf("%d checks, 0 failures\n", $checks));
exit(0);
