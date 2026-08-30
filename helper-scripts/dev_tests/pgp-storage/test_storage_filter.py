#!/usr/bin/env python3
"""Runs the storage filter over the message shapes a PGP conversation produces.

The public key is handed over through PGP_PUBLIC_KEY, the same path the Dovecot
plugin uses, so no database is involved. gpg does the encrypting, so it needs a
scratch keyring.

  export GNUPGHOME=$(mktemp -d) && chmod 700 "$GNUPGHOME"
  gpg --batch --pinentry-mode loopback --passphrase "" \
      --quick-generate-key "Teste <teste@example.org>" default default never
  gpg --armor --export teste@example.org > "$GNUPGHOME/pub.asc"
  PGP_TEST_PUBLIC_KEY="$GNUPGHOME/pub.asc" ./test_storage_filter.py
"""

import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
FILTER = os.path.join(
    HERE, "..", "..", "..",
    "data", "conf", "dovecot", "sieve-pipe-bin", "mailcow-pgp-storage-encrypt",
)

EXIT_NOT_ENCRYPTED = 75

failures = []
checks = [0]


def check(name, actual, expected):
    checks[0] += 1
    if actual == expected:
        return
    failures.append(name)
    sys.stderr.write("FAIL {}\n  expected: {!r}\n  actual:   {!r}\n".format(name, expected, actual))


def run_filter(message, public_key, hide_subject=False):
    env = dict(os.environ)
    env["PGP_PUBLIC_KEY"] = public_key
    env["PGP_ENCRYPT_SUBJECT"] = "1" if hide_subject else "0"
    env["PGP_STORAGE_DEBUG"] = "0"
    env["PGP_STORAGE_RECIPIENT"] = "teste@example.org"

    result = subprocess.run(
        [sys.executable, FILTER, "teste@example.org"],
        input=message,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        env=env,
    )
    return result.returncode, result.stdout


def armored_block(size):
    body = ("QWERTYUIOPASDFGHJKLZXCVBNM1234567890abcdefghijklmnop" * size)
    lines = [body[i:i + 64] for i in range(0, len(body), 64)]
    return (
        "-----BEGIN PGP MESSAGE-----\n\n"
        + "\n".join(lines)
        + "\n=AbCd\n-----END PGP MESSAGE-----\n"
    )


def message(headers, body):
    return (headers + "\n" + body).encode("utf-8")


def main():
    if not os.environ.get("GNUPGHOME"):
        sys.stderr.write("set GNUPGHOME to a scratch keyring first\n")
        return 2

    key_path = os.environ.get("PGP_TEST_PUBLIC_KEY")
    if not key_path or not os.path.exists(key_path):
        sys.stderr.write("set PGP_TEST_PUBLIC_KEY to an armored public key file\n")
        return 2

    with open(key_path) as handle:
        public_key = handle.read()

    plain = message(
        "From: ana@example.org\nTo: teste@example.org\nSubject: Ola\n",
        "corpo em claro\n",
    )
    code, out = run_filter(plain, public_key)
    check("plaintext in is encrypted for storage", code, 0)
    check("plaintext in becomes PGP/MIME", b"multipart/encrypted" in out, True)
    check("plaintext in is marked", b"X-Mailcow-PGP-Storage: encrypted" in out, True)

    pgp_mime_in = message(
        'From: ana@example.org\nTo: teste@example.org\nSubject: E2EE\n'
        'MIME-Version: 1.0\n'
        'Content-Type: multipart/encrypted; protocol="application/pgp-encrypted";\n'
        ' boundary="B"\n',
        "--B\nContent-Type: application/pgp-encrypted\n\nVersion: 1\n\n"
        "--B\nContent-Type: application/octet-stream\n\n" + armored_block(2) + "--B--\n",
    )
    code, out = run_filter(pgp_mime_in, public_key)
    check("PGP/MIME in passes through", code, 0)
    check("PGP/MIME in is unchanged", out, pgp_mime_in)

    short_inline = message(
        "From: teste@example.org\nTo: ana@example.org\nSubject: Re: E2EE\n",
        armored_block(1),
    )
    code, out = run_filter(short_inline, public_key)
    check("short inline reply passes through", code, 0)
    check("short inline reply is unchanged", out, short_inline)

    long_headers = (
        "From: teste@example.org\nTo: ana@example.org\nSubject: Re: E2EE\n"
        + "References: " + " ".join("<msg%d@example.org>" % n for n in range(300)) + "\n"
        + "In-Reply-To: <msg119@example.org>\n"
    )
    long_inline = message(long_headers, armored_block(1))
    check("the armor really sits past the sniff window", long_inline.find(b"BEGIN PGP MESSAGE") > 4096, True)

    code, out = run_filter(long_inline, public_key)
    check("long inline reply is not rejected", code != EXIT_NOT_ENCRYPTED, True)
    check("long inline reply passes through", code, 0)
    check("long inline reply is unchanged", out, long_inline)

    quoted_reply = message(
        "From: teste@example.org\nTo: ana@example.org\nSubject: Re: E2EE\n",
        "Em resposta ao que escreveste:\n\n> " + armored_block(1).replace("\n", "\n> ") + "\n",
    )
    code, out = run_filter(quoted_reply, public_key)
    check("a quoted armor is still stored encrypted", code, 0)
    check("a quoted armor is not mistaken for an encrypted message", b"multipart/encrypted" in out, True)
    check("a quoted armor is marked as stored by us", b"X-Mailcow-PGP-Storage: encrypted" in out, True)

    encoded_inline = message(
        "From: teste@example.org\nTo: ana@example.org\nSubject: Re: E2EE\n"
        "Content-Type: text/plain; charset=utf-8\n"
        "Content-Transfer-Encoding: base64\n",
        __import__("base64").encodebytes(armored_block(1).encode()).decode(),
    )
    code, out = run_filter(encoded_inline, public_key)
    check("a base64 inline message passes through", code, 0)
    check("a base64 inline message is unchanged", out, encoded_inline)

    no_key_code, no_key_out = run_filter(plain, "")
    check("no key means not encrypted", no_key_code, EXIT_NOT_ENCRYPTED)
    check("no key still emits the original", no_key_out, plain)

    print("{} checks, {} failures".format(checks[0], len(failures)))
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
