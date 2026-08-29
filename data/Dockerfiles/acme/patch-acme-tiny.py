#!/usr/bin/env python3
"""Teach acme-tiny to request an ACME certificate profile.

acme-tiny has no --profile support, which is what selects Let's Encrypt's
6-day "shortlived" certificates. The change is three lines, but it has to be
applied against a moving upstream package, so every anchor is asserted: if
acme-tiny changes shape, the image build fails loudly instead of quietly
handing back 90-day certificates when 6-day ones were asked for.
"""
import sys

path = sys.argv[1]
src = open(path).read()

edits = [
    (
        "def get_crt(account_key, csr, acme_dir, log=LOGGER, CA=DEFAULT_CA, "
        "disable_check=False, directory_url=DEFAULT_DIRECTORY_URL, "
        "contact=None, check_port=None):",
        "def get_crt(account_key, csr, acme_dir, log=LOGGER, CA=DEFAULT_CA, "
        "disable_check=False, directory_url=DEFAULT_DIRECTORY_URL, "
        "contact=None, check_port=None, profile=None):",
    ),
    (
        '    order_payload = {"identifiers": [{"type": "dns", "value": d} for d in domains]}\n',
        '    order_payload = {"identifiers": [{"type": "dns", "value": d} for d in domains]}\n'
        '    if profile:\n'
        '        order_payload["profile"] = profile\n'
        '        log.info("Requesting certificate profile: {0}".format(profile))\n',
    ),
    (
        '    parser.add_argument("--check-port", metavar="PORT", default=None, '
        'help="what port to use when self-checking the challenge file, default is port 80")\n',
        '    parser.add_argument("--check-port", metavar="PORT", default=None, '
        'help="what port to use when self-checking the challenge file, default is port 80")\n'
        '    parser.add_argument("--profile", default=None, '
        'help="ACME certificate profile to request (e.g. shortlived)")\n',
    ),
    (
        "contact=args.contact, check_port=args.check_port)",
        "contact=args.contact, check_port=args.check_port, profile=args.profile)",
    ),
]

for i, (old, new) in enumerate(edits, 1):
    if src.count(old) != 1:
        sys.exit(
            "patch-acme-tiny: anchor {0} matched {1} times in {2}; "
            "acme-tiny changed upstream and this patch needs review".format(
                i, src.count(old), path))
    src = src.replace(old, new)

open(path, "w").write(src)
print("patch-acme-tiny: profile support added to " + path)
