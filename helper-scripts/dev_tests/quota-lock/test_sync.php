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
  public function fetchAll($mode = null) { return $this->pdo->rows; }
}

class StubPdo {
  public $rows = array();
  public $queries = array();
  public function prepare($sql) { return new StubStatement($this, preg_replace('/\s+/', ' ', $sql)); }
}

function updates($pdo, $table) {
  return array_values(array_filter($pdo->queries, function ($query) use ($table) {
    return strpos($query['sql'], 'UPDATE `' . $table . '`') === 0;
  }));
}

$pdo = new StubPdo();
$_SESSION['return'] = array();

require_once __DIR__ . '/../../../data/web/inc/functions.quota_lock.inc.php';

$mib = 1048576;

check('storing more than the quota exceeds it', quota_lock_exceeds(11 * $mib, 10 * $mib), true);
check('storing exactly the quota fits', quota_lock_exceeds(10 * $mib, 10 * $mib), false);
check('an unlimited quota is never exceeded', quota_lock_exceeds(500 * $mib, 0), false);
check('values read from the database as strings', quota_lock_exceeds('11', '10'), true);

// lowering a quota: the active mailbox above it is locked, the one within is not
$pdo->rows = array(
  array('username' => 'ana@empresa.com', 'active' => '1', 'quota' => 10 * $mib, 'quota_lock_from' => null, 'bytes' => 12 * $mib),
  array('username' => 'bia@empresa.com', 'active' => '1', 'quota' => 10 * $mib, 'quota_lock_from' => null, 'bytes' => 3 * $mib),
  array('username' => 'cris@empresa.com', 'active' => '3', 'quota' => 10 * $mib, 'quota_lock_from' => null, 'bytes' => 12 * $mib),
);
$result = quota_lock_sync(array('ana@empresa.com', 'bia@empresa.com', 'cris@empresa.com'), true);
check('only the active mailbox storing too much is locked', $result['locked'], array('ana@empresa.com'));
check('and nothing is unlocked', $result['unlocked'], array());
check('the lookup is limited to the listed mailboxes, as parameters',
  $pdo->queries[0]['params'],
  array(':username0' => 'ana@empresa.com', ':username1' => 'bia@empresa.com', ':username2' => 'cris@empresa.com'));
$mailbox_updates = updates($pdo, 'mailbox');
check('one mailbox row is written', count($mailbox_updates), 1);
check('it becomes read-only and remembers it was active',
  strpos($mailbox_updates[0]['sql'], "`active` = '3', `attributes` = JSON_SET(`attributes`, '$.quota_lock_from', '1')") !== false, true);
check('only if it is still active when written',
  strpos($mailbox_updates[0]['sql'], "WHERE `username` = :username AND `active` = '1'") !== false, true);
$alias_updates = updates($pdo, 'alias');
check('its own alias follows', $alias_updates[0]['params'], array(':active' => '3', ':address' => 'ana@empresa.com'));

// a read-only status set by hand (no quota_lock_from) is never lifted
$pdo->queries = array();
$pdo->rows = array(
  array('username' => 'cris@empresa.com', 'active' => '3', 'quota' => 10 * $mib, 'quota_lock_from' => null, 'bytes' => 1 * $mib),
);
$result = quota_lock_sync(null, false);
check('a read-only mailbox set by hand stays read-only', $result['unlocked'], array());
check('and without a list every mailbox is looked at', $pdo->queries[0]['params'], array());

// a locked mailbox that fits again gets its status back, a still-full one does not
$pdo->queries = array();
$pdo->rows = array(
  array('username' => 'ana@empresa.com', 'active' => '3', 'quota' => 10 * $mib, 'quota_lock_from' => '1', 'bytes' => 9 * $mib),
  array('username' => 'dani@empresa.com', 'active' => '3', 'quota' => 10 * $mib, 'quota_lock_from' => '1', 'bytes' => 11 * $mib),
  array('username' => 'eva@empresa.com', 'active' => '3', 'quota' => 0, 'quota_lock_from' => '1', 'bytes' => 90 * $mib),
);
$result = quota_lock_sync(null, false);
check('the mailboxes that fit are unlocked, an unlimited one included',
  $result['unlocked'], array('ana@empresa.com', 'eva@empresa.com'));
check('the periodic run never locks', $result['locked'], array());
$mailbox_updates = updates($pdo, 'mailbox');
check('the remembered status is restored', $mailbox_updates[0]['params'], array(':active' => '1', ':username' => 'ana@empresa.com'));
check('and forgotten', strpos($mailbox_updates[0]['sql'], "JSON_REMOVE(`attributes`, '$.quota_lock_from')") !== false, true);
check('only while it is still read-only', strpos($mailbox_updates[0]['sql'], "AND `active` = '3'") !== false, true);
check('its own alias follows', updates($pdo, 'alias')[0]['params'], array(':active' => '1', ':address' => 'ana@empresa.com'));

// an empty list touches nothing
$pdo->queries = array();
check('an empty list is a no-op', quota_lock_sync(array(), true), array('locked' => array(), 'unlocked' => array()));
check('without querying', count($pdo->queries), 0);

// the report
$_SESSION['return'] = array();
quota_lock_report(array('locked' => array('ana@empresa.com', 'bia@empresa.com'), 'unlocked' => array()), array('test'));
check('locking is reported as a warning naming the mailboxes', $_SESSION['return'], array(array(
  'type' => 'warning',
  'log' => array('test'),
  'msg' => array('mailbox_quota_locked', 'ana@empresa.com, bia@empresa.com'),
)));
$_SESSION['return'] = array();
quota_lock_report(array('locked' => array(), 'unlocked' => array()), array('test'));
check('nothing changed, nothing reported', $_SESSION['return'], array());

if ($failures) {
  fwrite(STDERR, sprintf("\n%d of %d checks failed\n", count($failures), $checks));
  exit(1);
}
fwrite(STDOUT, sprintf("%d checks, 0 failures\n", $checks));
exit(0);
