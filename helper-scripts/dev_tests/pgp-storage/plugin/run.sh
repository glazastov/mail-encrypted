#!/bin/sh
# Builds the Dovecot storage plugin on Alpine 3.21 (Dovecot 2.3, as in the
# dovecot-mailcow image) and saves mail through IMAP and LMTP against it.
set -e
ROOT=$(cd "$(dirname "$0")/../../../.." && pwd)
docker build -q -t mailcow-pgp-storage-plugin-test \
  -f "$ROOT/helper-scripts/dev_tests/pgp-storage/plugin/Dockerfile" "$ROOT" >/dev/null
exec docker run --rm mailcow-pgp-storage-plugin-test
