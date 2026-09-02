#!/usr/bin/env php
<?php
/* Which identity provider answers for which address.
 *
 * This is the rule that keeps tenants apart: a domain's own provider speaks
 * for that domain, the appliance-wide one for every domain that brings none,
 * and neither may vouch for an address on the other side of that line. The
 * login callback and the token refresh both refuse when these disagree, so the
 * resolution is worth pinning down on its own.
 *
 * Runs without a database: a stand-in PDO answers the one query the lookup
 * makes.
 *
 *   ./test_provider_resolution.php
 */

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
  private $rows;
  public function __construct($rows) { $this->rows = $rows; }
  public function fetchAll($mode = null) { return $this->rows; }
}

class StubPdo {
  public $rows = array();
  public $queries = 0;
  public function query($sql) {
    $this->queries++;
    return new StubStatement($this->rows);
  }
}

$pdo = new StubPdo();
require_once __DIR__ . '/../../../data/web/inc/functions.inc.php';

// tenant.tld runs its own Keycloak; shared.tld and anything else fall back to
// the appliance-wide provider. stale.tld only ever had an admin token written
// for it, which is not a configuration.
$pdo->rows = array(
  array('key' => 'authsource',   'domain' => '',           'value' => 'ldap'),
  array('key' => 'host',         'domain' => '',           'value' => 'ldap.example.org'),
  array('key' => 'authsource',   'domain' => 'tenant.tld', 'value' => 'keycloak'),
  array('key' => 'client_id',    'domain' => 'tenant.tld', 'value' => 'mailcow'),
  array('key' => 'access_token', 'domain' => 'stale.tld',  'value' => 'leftover'),
);
identity_provider_rows(true);

// --- the domain of a login name --------------------------------------------
check('address', identity_provider_login_domain('user@tenant.tld'), 'tenant.tld');
check('address is lowercased', identity_provider_login_domain('User@TENANT.TLD'), 'tenant.tld');
check('surrounding space is ignored', identity_provider_login_domain('  user@tenant.tld  '), 'tenant.tld');
check('a bare username has no domain', identity_provider_login_domain('admin'), '');
check('empty input has no domain', identity_provider_login_domain(''), '');
// A local part may itself contain an @ when quoted; the last one separates.
check('the last @ separates', identity_provider_login_domain('"odd@name"@tenant.tld'), 'tenant.tld');

// --- which domains bring their own provider --------------------------------
check('a configured domain has its own', identity_provider_has_own('tenant.tld'), true);
check('case does not matter', identity_provider_has_own('Tenant.TLD'), true);
check('an unconfigured domain has none', identity_provider_has_own('shared.tld'), false);
check('an unknown domain has none', identity_provider_has_own('nowhere.tld'), false);
check('a lone access token is not a configuration', identity_provider_has_own('stale.tld'), false);
check('the global config is not a domain', identity_provider_has_own(''), false);

// --- which configuration serves an address ---------------------------------
check('own provider serves its domain', identity_provider_owner('tenant.tld'), 'tenant.tld');
check('everyone else gets the global one', identity_provider_owner('shared.tld'), '');
check('unknown domains get the global one', identity_provider_owner('nowhere.tld'), '');

// The isolation rule, stated the way the login callback checks it: the
// configuration that started the flow must be the one that serves the address
// the provider hands back.
$serves = function ($flow_domain, $email) {
  return identity_provider_owner(identity_provider_login_domain($email)) === $flow_domain;
};
check('a tenant provider may vouch for its own users', $serves('tenant.tld', 'user@tenant.tld'), true);
check('a tenant provider may not vouch for a global domain', $serves('tenant.tld', 'user@shared.tld'), false);
check('a tenant provider may not vouch for another tenant', $serves('tenant.tld', 'user@other-tenant.tld'), false);
check('the global provider may vouch for a domain without its own', $serves('', 'user@shared.tld'), true);
check('the global provider may not vouch for a tenant with its own', $serves('', 'user@tenant.tld'), false);
check('a login without a domain is served by nobody but the global one', $serves('tenant.tld', 'admin'), false);

// --- rows from the schema before this feature -------------------------------
// The settings are read before the schema is migrated, so on the first request
// after an update the rows come back without a domain column at all. They must
// read as the appliance-wide configuration rather than blowing up.
$pdo->rows = array(
  array('key' => 'authsource', 'value' => 'keycloak'),
  array('key' => 'realm',      'value' => 'mailcow'),
);
identity_provider_rows(true);
check('legacy rows have no domain of their own', identity_provider_has_own('tenant.tld'), false);
check('legacy rows serve every domain', identity_provider_owner('tenant.tld'), '');
$legacy = identity_provider('get');
check('legacy rows are read as the global config', $legacy['authsource'], 'keycloak');

// --- the lookup is read once ------------------------------------------------
$before = $pdo->queries;
identity_provider_has_own('tenant.tld');
identity_provider_owner('shared.tld');
check('rows are cached for the request', $pdo->queries, $before);

if ($failures) {
  fwrite(STDERR, sprintf("\n%d of %d checks failed\n", count($failures), $checks));
  exit(1);
}
fwrite(STDOUT, sprintf("%d checks, 0 failures\n", $checks));
exit(0);
