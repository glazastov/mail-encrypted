#!/usr/bin/env python3
"""Usage:
  protect <file>                  emit the payload with protected headers marked
  wrap <file> <armor> [--hide]    emit the PGP/MIME message around that armor
"""

import importlib.util
import os
import sys

FILTER = os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    "..", "..", "..",
    "data", "conf", "dovecot", "sieve-pipe-bin", "mailcow-pgp-storage-encrypt",
)


def load_filter():
    spec = importlib.util.spec_from_loader(
        "mailcow_pgp_storage_encrypt",
        importlib.machinery.SourceFileLoader("mailcow_pgp_storage_encrypt", FILTER),
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def main():
    if len(sys.argv) < 3:
        sys.stderr.write(__doc__)
        return 2

    module = load_filter()
    command = sys.argv[1]

    if command == "protect":
        with open(sys.argv[2], "rb") as handle:
            sys.stdout.buffer.write(module.mark_protected_headers(handle.read()))
        return 0

    if command == "wrap":
        with open(sys.argv[2], "rb") as handle:
            original = handle.read()
        with open(sys.argv[3], "rb") as handle:
            armor = handle.read()
        hide = "--hide" in sys.argv[4:]
        sys.stdout.buffer.write(module.pgp_mime(original, armor, hide_subject=hide))
        return 0

    sys.stderr.write("unknown command: {}\n".format(command))
    return 2


if __name__ == "__main__":
    sys.exit(main())
