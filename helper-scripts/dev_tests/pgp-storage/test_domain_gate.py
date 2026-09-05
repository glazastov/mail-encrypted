#!/usr/bin/env python3
"""Checks that the storage filter honours the domain's PGP switch.

The lookup is the enforcement point closest to delivery: whatever the mailbox
has configured, no key comes back once the admin has turned PGP storage off for
the domain. No database is involved - a stand-in MySQLdb answers the query and
records it, so the SQL itself is asserted too.

  ./test_domain_gate.py
"""

import importlib.util
import json
import os
import sys
import types

HERE = os.path.dirname(os.path.abspath(__file__))
FILTER = os.path.join(
    HERE, "..", "..", "..",
    "data", "conf", "dovecot", "sieve-pipe-bin", "mailcow-pgp-storage-encrypt",
)

PUBLIC_KEY = "-----BEGIN PGP PUBLIC KEY BLOCK-----\n\nnot-a-real-key\n-----END PGP PUBLIC KEY BLOCK-----"

failures = []
checks = [0]


def check(name, actual, expected):
    checks[0] += 1
    if actual == expected:
        return
    failures.append(name)
    sys.stderr.write("FAIL {}\n  expected: {!r}\n  actual:   {!r}\n".format(name, expected, actual))


class FakeCursor(object):
    def __init__(self, row, log):
        self.row = row
        self.log = log

    def execute(self, sql, params):
        self.log.append((" ".join(sql.split()), params))

    def fetchone(self):
        return self.row


class FakeConnection(object):
    def __init__(self, row, log):
        self.row = row
        self.log = log

    def cursor(self, *args, **kwargs):
        return FakeCursor(self.row, self.log)

    def close(self):
        pass


def fake_mysqldb(row, log):
    module = types.ModuleType("MySQLdb")
    module.Error = Exception
    module.cursors = types.SimpleNamespace(DictCursor=object)
    module.connect = lambda **kwargs: FakeConnection(row, log)
    return module


def load_filter():
    spec = importlib.util.spec_from_loader(
        "mailcow_pgp_storage_encrypt",
        importlib.machinery.SourceFileLoader("mailcow_pgp_storage_encrypt", FILTER),
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def lookup(module, row):
    """Runs load_public_key against a single stand-in mailbox row."""
    log = []
    sys.modules["MySQLdb"] = fake_mysqldb(row, log)
    try:
        return module.load_public_key(["teste@example.org"]), log
    finally:
        del sys.modules["MySQLdb"]


def main():
    os.environ.pop("PGP_PUBLIC_KEY", None)
    os.environ["PGP_STORAGE_DEBUG"] = "0"
    os.environ["DBNAME"] = "mailcow"
    os.environ["DBUSER"] = "mailcow"
    os.environ["DBPASS"] = "mailcow"

    module = load_filter()

    enabled = {
        "attributes": json.dumps({
            "pgp_storage_encrypt": "1",
            "pgp_public_key": PUBLIC_KEY,
            "pgp_encrypt_subject": "1",
        }),
    }

    (key, hide), log = lookup(module, dict(enabled, domain_pgp_storage="1", domain_pgp_enforce="none"))
    check("domain allows: key returned", key, PUBLIC_KEY)
    check("domain allows: subject option honoured", hide, True)

    (key, hide), _ = lookup(module, dict(enabled, domain_pgp_storage="0", domain_pgp_enforce="none"))
    check("domain forbids: no key", key, None)
    check("domain forbids: no subject hiding", hide, False)

    # A mailbox whose domain row went missing keeps working as it did before
    # the setting existed: the query's IFNULL turns that case into a '1', which
    # is what the lookup then sees.
    (key, _), _ = lookup(module, dict(enabled, domain_pgp_storage="1", domain_pgp_enforce="none"))
    check("missing domain row reads as allowed", key, PUBLIC_KEY)

    # The mailbox's own switch still has to be on.
    off = {"attributes": '{"pgp_storage_encrypt": "0", "pgp_public_key": "x"}',
           "domain_pgp_storage": "1", "domain_pgp_enforce": "none"}
    (key, _), _ = lookup(module, off)
    check("mailbox switch off: no key", key, None)

    # Unless the domain requires encryption, in which case the mailbox's switch
    # is not its to turn off and the key is used regardless of what it says.
    (key, _), _ = lookup(module, dict(off, domain_pgp_enforce="admin"))
    check("domain enforces: mailbox switch off is overridden", key, "x")
    (key, _), _ = lookup(module, dict(off, domain_pgp_enforce="domainadmin"))
    check("domain admin enforces: mailbox switch off is overridden", key, "x")

    # Withdrawing PGP from the domain still outranks a requirement left on it.
    (key, _), _ = lookup(module, dict(off, domain_pgp_storage="0", domain_pgp_enforce="admin"))
    check("domain forbids: a stale requirement changes nothing", key, None)

    # An enforced mailbox that has not set a key yet has nothing to encrypt to.
    nokey = {"attributes": '{"pgp_storage_encrypt": "0", "pgp_public_key": ""}',
             "domain_pgp_storage": "1", "domain_pgp_enforce": "admin"}
    (key, _), _ = lookup(module, nokey)
    check("domain enforces without a key: no key", key, None)

    sql, params = log[0]
    check("query joins the domain table",
          "LEFT JOIN domain ON domain.domain = mailbox.domain" in sql, True)
    check("query defaults a missing domain row to allowed",
          "IFNULL(domain.pgp_storage, '1') AS domain_pgp_storage" in sql, True)
    check("query defaults a missing domain row to unenforced",
          "IFNULL(domain.pgp_enforce, 'none') AS domain_pgp_enforce" in sql, True)
    check("query is still parameterised", params, ("teste@example.org",))

    if failures:
        sys.stderr.write("\n{} of {} checks failed\n".format(len(failures), checks[0]))
        return 1
    sys.stdout.write("{} checks, 0 failures\n".format(checks[0]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
