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
  private $row;
  public $log;
  public function __construct($row, $log) { $this->row = $row; $this->log = $log; }
  public function execute($params = null) { $this->log->calls[] = $params; return true; }
  public function fetch($mode = null) { return $this->row; }
}

class StubPdo {
  public $row = false;
  public $sql = '';
  public $calls = array();
  public function prepare($sql) { $this->sql = preg_replace('/\s+/', ' ', $sql); return new StubStatement($this->row, $this); }
}

$pdo = new StubPdo();
require_once __DIR__ . '/../../../data/web/inc/functions.mailbox.inc.php';

$key = "-----BEGIN PGP PUBLIC KEY BLOCK-----\n\nx\n-----END PGP PUBLIC KEY BLOCK-----\n";

function row($storage, $enforce, $attributes) {
  return array(
    'pgp_storage' => $storage,
    'pgp_enforce' => $enforce,
    'attributes' => json_encode($attributes),
  );
}

$pdo->row = row('1', 'admin', array('pgp_public_key' => ''));
check('enforced mailbox without a key has to set one', pgp_setup_pending('teste@example.org'), true);

$pdo->row = row('1', 'domainadmin', array('pgp_public_key' => ''));
check('the domain admin\'s enforcement asks just the same', pgp_setup_pending('teste@example.org'), true);

$pdo->row = row('1', 'admin', array('pgp_public_key' => $key));
check('a key already stored asks nothing', pgp_setup_pending('teste@example.org'), false);

$pdo->row = row('1', 'none', array('pgp_public_key' => ''));
check('an unenforced domain asks nothing', pgp_setup_pending('teste@example.org'), false);

$pdo->row = row('0', 'admin', array('pgp_public_key' => ''));
check('a domain that no longer allows PGP asks nothing', pgp_setup_pending('teste@example.org'), false);

$pdo->row = false;
check('a mailbox that does not exist asks nothing', pgp_setup_pending('nobody@example.org'), false);

check('the address is passed as a parameter, never built into the SQL',
  end($pdo->calls), array(':username' => 'nobody@example.org'));
check('a mailbox whose domain row is missing reads as allowed',
  strpos($pdo->sql, "IFNULL(`domain`.`pgp_storage`, '1')") !== false, true);
check('a mailbox whose domain row is missing reads as unenforced',
  strpos($pdo->sql, "IFNULL(`domain`.`pgp_enforce`, 'none')") !== false, true);
check('the domain is joined, not required',
  strpos($pdo->sql, 'LEFT JOIN `domain`') !== false, true);

if ($failures) {
  fwrite(STDERR, sprintf("\n%d of %d checks failed\n", count($failures), $checks));
  exit(1);
}
fwrite(STDOUT, sprintf("%d checks, 0 failures\n", $checks));
exit(0);
