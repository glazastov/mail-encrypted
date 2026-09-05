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

require_once __DIR__ . '/../../../data/web/inc/functions.mailbox.inc.php';

check('level: none stays none', enforce_level('none'), 'none');
check('level: domainadmin stays domainadmin', enforce_level('domainadmin'), 'domainadmin');
check('level: admin stays admin', enforce_level('admin'), 'admin');
check('level: case and padding do not matter', enforce_level("  ADMIN\n"), 'admin');
check('level: an unknown value is no enforcement', enforce_level('superadmin'), 'none');
check('level: an empty value is no enforcement', enforce_level(''), 'none');
check('level: a missing value is no enforcement', enforce_level(null), 'none');
check('level: a number is no enforcement', enforce_level(1), 'none');
check('level: a posted form array takes its last entry',
  enforce_level(array('none', 'domainadmin')), 'domainadmin');
check('level: an unchecked box leaves only the hidden default',
  enforce_level(array('none')), 'none');

check('may set: admin may require it', enforce_may_set('admin', 'none', 'admin'), true);
check('may set: admin may hand the choice to the domain admin',
  enforce_may_set('admin', 'admin', 'domainadmin'), true);
check('may set: admin may lift its own enforcement',
  enforce_may_set('admin', 'admin', 'none'), true);
check('may set: admin may lift the domain admin\'s',
  enforce_may_set('admin', 'domainadmin', 'none'), true);

check('may set: domain admin may require it for its own domain',
  enforce_may_set('domainadmin', 'none', 'domainadmin'), true);
check('may set: domain admin may lift what it required itself',
  enforce_may_set('domainadmin', 'domainadmin', 'none'), true);
check('may set: domain admin may not lift the appliance admin\'s enforcement',
  enforce_may_set('domainadmin', 'admin', 'none'), false);
check('may set: domain admin may not downgrade it either',
  enforce_may_set('domainadmin', 'admin', 'domainadmin'), false);
check('may set: domain admin may not enforce in the appliance admin\'s name',
  enforce_may_set('domainadmin', 'none', 'admin'), false);
check('may set: leaving the level alone is allowed',
  enforce_may_set('domainadmin', 'admin', 'admin'), true);

check('may set: a mailbox owner may not change it at all',
  enforce_may_set('user', 'none', 'domainadmin'), false);
check('may set: an unknown role may not change it',
  enforce_may_set('', 'none', 'domainadmin'), false);
check('may set: a mailbox owner leaving it alone is still not a change',
  enforce_may_set('user', 'admin', 'admin'), true);

check('pgp enforces: allowed and required', pgp_domain_enforces('1', 'admin'), true);
check('pgp enforces: allowed and required by the domain admin',
  pgp_domain_enforces('1', 'domainadmin'), true);
check('pgp enforces: allowed but not required', pgp_domain_enforces('1', 'none'), false);
check('pgp enforces: not allowed outranks a stale requirement',
  pgp_domain_enforces('0', 'admin'), false);
check('pgp enforces: a missing domain row reads as allowed and unenforced',
  pgp_domain_enforces(null, null), false);

$with_key = array('pgp_public_key' => "-----BEGIN PGP PUBLIC KEY BLOCK-----\n\nx\n-----END PGP PUBLIC KEY BLOCK-----\n");
$no_key = array('pgp_public_key' => '');

check('pgp setup: enforced without a key must be asked for',
  pgp_setup_required('1', 'admin', $no_key), true);
check('pgp setup: enforced by the domain admin without a key must be asked for',
  pgp_setup_required('1', 'domainadmin', $no_key), true);
check('pgp setup: enforced with a key already stored is done',
  pgp_setup_required('1', 'admin', $with_key), false);
check('pgp setup: a key of nothing but whitespace is no key',
  pgp_setup_required('1', 'admin', array('pgp_public_key' => "  \n ")), true);
check('pgp setup: an attribute set that never had the field is no key',
  pgp_setup_required('1', 'admin', array()), true);
check('pgp setup: not enforced, nothing to ask',
  pgp_setup_required('1', 'none', $no_key), false);
check('pgp setup: the domain no longer allows PGP, nothing to ask',
  pgp_setup_required('0', 'admin', $no_key), false);

check('tfa forced: the mailbox was told to on its own',
  tfa_is_forced(array('force_tfa' => '1'), 'none'), true);
check('tfa forced: the domain requires it of every mailbox',
  tfa_is_forced(array('force_tfa' => '0'), 'admin'), true);
check('tfa forced: the domain admin requires it of every mailbox',
  tfa_is_forced(array('force_tfa' => '0'), 'domainadmin'), true);
check('tfa forced: neither requires it',
  tfa_is_forced(array('force_tfa' => '0'), 'none'), false);
check('tfa forced: an attribute set that never had the field',
  tfa_is_forced(array(), 'none'), false);
check('tfa forced: no attributes at all and no domain policy',
  tfa_is_forced(null, 'none'), false);
check('tfa forced: no attributes but a domain policy',
  tfa_is_forced(null, 'admin'), true);

if ($failures) {
  fwrite(STDERR, sprintf("\n%d of %d checks failed\n", count($failures), $checks));
  exit(1);
}
fwrite(STDOUT, sprintf("%d checks, 0 failures\n", $checks));
exit(0);
