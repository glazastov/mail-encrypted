#!/usr/bin/env php
<?php
/* What the login page offers an address once it has been given.
 *
 * The user login asks for the address before anything else, because with a
 * provider per domain there is no single place to send everyone. What comes
 * back is a decision with a rule worth pinning down: a domain goes to single
 * sign-on when it brought a provider of its own, and bringing none is not a
 * request to use someone else's - unless single sign-on is forced, when the
 * appliance-wide provider stands in for the domains that configured nothing.
 *
 * Runs without a database: a stand-in PDO answers the one query the lookup
 * makes.
 *
 *   ./test_login_identify.php
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
  public function query($sql) { return new StubStatement($this->rows); }
}

$pdo = new StubPdo();
require_once __DIR__ . '/../../../data/web/inc/functions.inc.php';

function sso($login, $force_sso = false) {
  $options = login_identify_options($login, $force_sso);
  return $options['sso'];
}
function password($login, $force_sso = false) {
  $options = login_identify_options($login, $force_sso);
  return $options['password'];
}

// tenant.tld and ldap-tenant.tld brought their own provider, shared.tld did
// not. The appliance-wide provider is a Keycloak, so every fallback that does
// happen is one the rule asked for and not one the settings made unavoidable.
$pdo->rows = array(
  array('key' => 'authsource', 'domain' => '',                'value' => 'keycloak'),
  array('key' => 'authsource', 'domain' => 'tenant.tld',      'value' => 'generic-oidc'),
  array('key' => 'authsource', 'domain' => 'ldap-tenant.tld', 'value' => 'ldap'),
);
identity_provider_rows(true);

// --- whether the address has to be asked for at all -------------------------
check('a domain with its own provider makes the address necessary', login_identify_required(), true);

// --- a domain that brought its own provider ---------------------------------
check('its users are sent to it', sso('user@tenant.tld'), true);
check('and may still use a password', password('user@tenant.tld'), true);
check('the address is matched case-insensitively', sso('User@Tenant.TLD'), true);

// --- a domain that brought none ---------------------------------------------
// The appliance-wide provider is not offered to it: a domain that configured
// nothing did not ask for someone else's directory.
check('its users log in against mailcow', sso('user@shared.tld'), false);
check('an unknown domain likewise', sso('user@nowhere.tld'), false);
check('and so does a bare username', sso('admin'), false);
check('no address has been given yet', sso(''), false);

// --- LDAP is a provider, but not one to be redirected to --------------------
check('an LDAP domain stays on the password form', sso('user@ldap-tenant.tld'), false);
check('which is the whole point of the form', password('user@ldap-tenant.tld'), true);

// --- forcing single sign-on --------------------------------------------------
// Now, and only now, the appliance-wide provider stands in for the domains
// that configured nothing.
check('a domain without its own falls back', sso('user@shared.tld', true), true);
check('an unknown domain falls back too', sso('user@nowhere.tld', true), true);
check('a domain with its own keeps its own', sso('user@tenant.tld', true), true);
// A domain that brought an LDAP is not one that configured nothing, so it is
// not stood in for: sending its users to another tenant's Keycloak would be
// worse than telling them the login they were forced onto is unavailable.
check('an LDAP domain is not stood in for', sso('user@ldap-tenant.tld', true), false);
check('no password is offered', password('user@shared.tld', true), false);
check('not even before an address is given', sso('', true), false);

// --- forcing single sign-on with nothing to force it to ----------------------
// An appliance whose own provider is an LDAP has no redirect to fall back on.
// The page has to say so rather than offer a login that cannot be completed.
$pdo->rows = array(
  array('key' => 'authsource', 'domain' => '',           'value' => 'ldap'),
  array('key' => 'authsource', 'domain' => 'tenant.tld', 'value' => 'keycloak'),
);
identity_provider_rows(true);
check('there is nowhere to send the domain', sso('user@shared.tld', true), false);
check('while the tenant is unaffected', sso('user@tenant.tld', true), true);

// --- an appliance with only the appliance-wide provider ----------------------
// Nothing depends on the address, so the login keeps its single form and its
// single button.
$pdo->rows = array(
  array('key' => 'authsource', 'domain' => '', 'value' => 'keycloak'),
);
identity_provider_rows(true);
check('the address need not be asked for', login_identify_required(), false);

// Rows written before providers were per-domain have no domain column at all,
// and read as the appliance-wide configuration.
$pdo->rows = array(
  array('key' => 'authsource', 'value' => 'keycloak'),
);
identity_provider_rows(true);
check('legacy rows ask for no address either', login_identify_required(), false);
check('and no domain is sent to them on its own', sso('user@tenant.tld'), false);
check('until single sign-on is forced', sso('user@tenant.tld', true), true);

// --- an address handed over in the URL ---------------------------------------
// A link may name who is logging in, which skips the step that asks. Only an
// address is taken: anything else is not a login this page can route.
check('an address is taken', login_identify_hint('joao@mail.com'), 'joao@mail.com');
check('and normalised', login_identify_hint('  Joao@Mail.COM '), 'joao@mail.com');
check('a bare username is not an address', login_identify_hint('joao'), '');
check('nor is a domain on its own', login_identify_hint('mail.com'), '');
check('nor is nothing at all', login_identify_hint(''), '');
check('nor is markup', login_identify_hint('<script>@mail.com'), '');

if ($failures) {
  fwrite(STDERR, sprintf("\n%d of %d checks failed\n", count($failures), $checks));
  exit(1);
}
fwrite(STDOUT, sprintf("%d checks, 0 failures\n", $checks));
exit(0);
