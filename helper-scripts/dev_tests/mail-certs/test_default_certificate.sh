#!/bin/bash

# Every name without an SNI entry is served from the default certificate, by
# both Postfix and Dovecot. sync_default_certificate() is what keeps it on the
# certificate covering MAILCOW_HOSTNAME; when it stops running the default
# stays frozen until it expires, which is how submission ended up offering an
# expired certificate while IMAP was current.

# functions.sh addresses optional arguments directly, so no set -u here

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "${SCRIPT_DIR}/../../.." && pwd)"

FAILED=0

check(){
  if [[ "${2}" == "${3}" ]]; then
    printf 'ok   %s\n' "${1}"
  else
    printf 'FAIL %s\n       expected: %s\n       actual:   %s\n' "${1}" "${3}" "${2}"
    FAILED=1
  fi
}

WORK="$(mktemp -d)"
trap 'rm -rf "${WORK}"' EXIT

make_pair(){
  openssl req -x509 -newkey rsa:2048 -nodes -days 7 -subj "/CN=${2}" \
    -keyout "${1}/key.pem" -out "${1}/cert.pem" 2>/dev/null
}

REDIS_CMDLINE="true"
MAILCOW_HOSTNAME="srv01.example.com"
ACME_BASE="${WORK}/ssl"
source "${REPO_DIR}/data/Dockerfiles/acme/functions.sh"

mkdir -p "${ACME_BASE}/srv01.example.com"
printf 'srv01.example.com imap.example.com' > "${ACME_BASE}/srv01.example.com/domains"
make_pair "${ACME_BASE}/srv01.example.com" "srv01.example.com"

# A default certificate left behind by an earlier issuance
mkdir -p "${WORK}/stale"
make_pair "${WORK}/stale" "srv01.example.com"
cp "${WORK}/stale/cert.pem" "${ACME_BASE}/cert.pem"
cp "${WORK}/stale/key.pem" "${ACME_BASE}/key.pem"

sync_default_certificate >/dev/null
check "a stale default certificate is replaced" \
  "$(cmp -s "${ACME_BASE}/cert.pem" "${ACME_BASE}/srv01.example.com/cert.pem" && echo same)" "same"
check "the key is replaced together with the certificate" \
  "$(cmp -s "${ACME_BASE}/key.pem" "${ACME_BASE}/srv01.example.com/key.pem" && echo same)" "same"

BEFORE="$(md5sum < "${ACME_BASE}/cert.pem")"
sync_default_certificate >/dev/null
check "an up to date default certificate is left alone" \
  "$(md5sum < "${ACME_BASE}/cert.pem")" "${BEFORE}"

# A certificate and key that do not belong together must never be copied over
# the default: both services would fail every handshake
cp "${WORK}/stale/key.pem" "${ACME_BASE}/srv01.example.com/key.pem"
sync_default_certificate >/dev/null
RC=$?
check "a mismatched certificate and key are refused" "${RC}" "1"
check "the default certificate survives the refusal" \
  "$(md5sum < "${ACME_BASE}/cert.pem")" "${BEFORE}"
check "no staging files are left behind" \
  "$(ls "${ACME_BASE}"/*.new 2>/dev/null | wc -l | tr -d ' ')" "0"

# Nothing covers the hostname: the default is the only certificate there is,
# so overwriting it with an unrelated one would be worse than leaving it
rm -f "${ACME_BASE}/srv01.example.com/domains"
sync_default_certificate >/dev/null
RC=$?
check "an uncovered hostname leaves the default certificate in place" "${RC}" "1"
check "the default certificate is untouched" \
  "$(md5sum < "${ACME_BASE}/cert.pem")" "${BEFORE}"

exit ${FAILED}
