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
  public function execute($params = null) { return true; }
  public function fetch($mode = null) { return false; }
  public function fetchAll($mode = null) { return array(); }
  public function fetchColumn($n = 0) { return false; }
}

class StubPdo {
  public function prepare($sql) { return new StubStatement(); }
  public function query($sql) { return new StubStatement(); }
}

class StubRedis {
  public $hash = array();
  public function hGet($key, $field) {
    if ($key !== 'PASSWD_POLICY' || !array_key_exists($field, $this->hash)) {
      return false;
    }
    return $this->hash[$field];
  }
}

$pdo = new StubPdo();
$redis = new StubRedis();
require_once __DIR__ . '/../../../data/web/inc/functions.inc.php';

function policy($fields) {
  global $redis;
  $redis->hash = $fields;
  return password_complexity('describe');
}

$strict = policy(array(
  'length' => '12',
  'chars' => '1',
  'special_chars' => '1',
  'lowerupper' => '1',
  'numbers' => '1',
));

check('the minimum length is a number, not the string redis stores',
  $strict['min_length'], 12);
check('letters are required', $strict['letters'], true);
check('numbers are required', $strict['numbers'], true);
check('special characters are required', $strict['special_chars'], true);
check('both cases are required', $strict['lower_and_upper'], true);

$lax = policy(array(
  'length' => '6',
  'chars' => '0',
  'special_chars' => '0',
  'lowerupper' => '0',
  'numbers' => '0',
));

check('the default length comes back as it is', $lax['min_length'], 6);
check('letters are not required', $lax['letters'], false);
check('numbers are not required', $lax['numbers'], false);
check('special characters are not required', $lax['special_chars'], false);
check('both cases are not required', $lax['lower_and_upper'], false);

$unset = policy(array());
check('a policy that was never stored requires no length', $unset['min_length'], 0);
check('and requires no character class', $unset['letters'], false);

$patterns = $strict['patterns'];
check('what counts as a letter is stated',
  preg_match('/^' . $patterns['letters'] . '$/', 'a'), 1);
check('what counts as a number is stated',
  preg_match('/^' . $patterns['numbers'] . '$/', '7'), 1);
check('a letter is not a special character',
  preg_match('/^' . $patterns['special_chars'] . '$/', 'a'), 0);
check('a digit is not a special character either',
  preg_match('/^' . $patterns['special_chars'] . '$/', '7'), 0);
check('but a punctuation mark is',
  preg_match('/^' . $patterns['special_chars'] . '$/', '!'), 1);
check('lowercase is stated', preg_match('/^' . $patterns['lowercase'] . '$/', 'a'), 1);
check('uppercase is stated', preg_match('/^' . $patterns['uppercase'] . '$/', 'A'), 1);

check('the pool the appliance draws its own special characters from is offered',
  $strict['special_chars_pool'], password_special_chars());
check('and every character in it satisfies the rule it is offered for',
  preg_match('/^' . $patterns['special_chars'] . '+$/', password_special_chars()), 1);

$generated = password_generate();
check('a password the appliance generates satisfies the strictest policy',
  password_check($generated, $generated), true);
check('and is at least as long as the policy asks',
  strlen($generated) >= $strict['min_length'], true);

if ($failures) {
  fwrite(STDERR, sprintf("\n%d of %d checks failed\n", count($failures), $checks));
  exit(1);
}
fwrite(STDOUT, sprintf("%d checks, 0 failures\n", $checks));
exit(0);
