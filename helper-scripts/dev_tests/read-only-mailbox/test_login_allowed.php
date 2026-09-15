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

require_once __DIR__ . '/../../../data/web/inc/functions.auth.inc.php';

// active comes from the database as a string
check('active mailbox, UI session', mailbox_login_allowed('1'), true);
foreach (array('IMAP', 'POP3', 'SMTP', 'SIEVE', 'EAS', 'DAV') as $service) {
  check("active mailbox, $service", mailbox_login_allowed('1', $service), true);
  // reading is allowed; Dovecot's read-only ACL refuses the changes
  check("read-only mailbox, $service", mailbox_login_allowed('3', $service), in_array($service, array('IMAP', 'POP3'), true));
  check("login disabled, $service", mailbox_login_allowed('2', $service), false);
  check("inactive mailbox, $service", mailbox_login_allowed('0', $service), false);
}
check('read-only mailbox, UI session', mailbox_login_allowed('3'), true);
check('read-only mailbox, explicit NONE', mailbox_login_allowed('3', 'NONE'), true);
check('read-only mailbox, lowercase none', mailbox_login_allowed('3', 'none'), true);
check('read-only mailbox, lowercase imap', mailbox_login_allowed('3', 'imap'), true);
check('login disabled, UI session', mailbox_login_allowed('2'), false);
check('inactive mailbox, UI session', mailbox_login_allowed('0'), false);

if ($failures) {
  fwrite(STDERR, sprintf("\n%d of %d checks failed\n", count($failures), $checks));
  exit(1);
}
fwrite(STDOUT, sprintf("%d checks, 0 failures\n", $checks));
exit(0);
