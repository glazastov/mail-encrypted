#!/bin/bash

# Postfix and Dovecot have to resolve every SNI name to the same certificate
# directory. They build their configuration from separate scripts, so this
# runs both over one fixture tree and diffs the mapping they produce, and
# checks that the ACME client's certificate_dir_for() agrees with them.

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
POSTFIX_GEN="${REPO_DIR}/data/Dockerfiles/postfix/generate-sni-map.sh"
DOVECOT_GEN="${REPO_DIR}/data/Dockerfiles/dovecot/generate-sni-conf.sh"
ACME_FUNCTIONS="${REPO_DIR}/data/Dockerfiles/acme/functions.sh"

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

# postmap is not available outside the Postfix image; the mapping is what is
# under test, not the Berkeley DB it ends up in
mkdir -p "${WORK}/bin"
printf '#!/bin/sh\nexit 0\n' > "${WORK}/bin/postmap"
chmod +x "${WORK}/bin/postmap"
export PATH="${WORK}/bin:${PATH}"

SSL_DIR="${WORK}/ssl"

# A certificate covering the hostname and its SANs, a per-domain certificate,
# a wildcard, and a stale directory that repeats a name the first one already
# claims - the case where the two generators could part ways
new_cert(){
  mkdir -p "${SSL_DIR}/${1}"
  printf '%s' "${2}" > "${SSL_DIR}/${1}/domains"
  touch "${SSL_DIR}/${1}/cert.pem" "${SSL_DIR}/${1}/key.pem"
}

new_cert "0-srv01.example.com" "srv01.example.com imap.example.com smtp.example.com"
new_cert "1-example.net" "example.net autodiscover.example.net"
new_cert "2-wildcard.example.org" "*.example.org example.org"
new_cert "3-stale.example.com" "imap.example.com legacy.example.com"
# Incomplete directories are ignored by both
mkdir -p "${SSL_DIR}/4-nokey.example.com"
printf 'nokey.example.com' > "${SSL_DIR}/4-nokey.example.com/domains"
touch "${SSL_DIR}/4-nokey.example.com/cert.pem"

SSL_DIR="${SSL_DIR}" SNI_MAP="${WORK}/sni.map" SKIP_LETS_ENCRYPT=n "${POSTFIX_GEN}" >/dev/null
SSL_DIR="${SSL_DIR}" SNI_CONF="${WORK}/sni.conf" "${DOVECOT_GEN}" >/dev/null

# name -> directory, as Postfix reads it
awk '{ sub(/cert\.pem$/, "", $3); print $1, $3 }' "${WORK}/sni.map" | sort > "${WORK}/postfix.mapping"
# name -> directory, as Dovecot reads it
awk '/^local_name /{ name = $2 }
     /ssl_cert = </ { path = $3; sub(/^</, "", path); sub(/cert\.pem$/, "", path); print name, path }' \
  "${WORK}/sni.conf" | sort > "${WORK}/dovecot.mapping"

check "Postfix and Dovecot map every name to the same directory" \
  "$(cat "${WORK}/postfix.mapping")" "$(cat "${WORK}/dovecot.mapping")"

check "a repeated name resolves to the first directory" \
  "$(awk '$1 == "imap.example.com" { print $2 }' "${WORK}/postfix.mapping")" \
  "${SSL_DIR}/0-srv01.example.com/"

check "a directory without a key is skipped" \
  "$(grep -c 'nokey.example.com' "${WORK}/postfix.mapping")" "0"

check "wildcard names reach the map verbatim" \
  "$(awk '$1 == "*.example.org" { print $2 }' "${WORK}/postfix.mapping")" \
  "${SSL_DIR}/2-wildcard.example.org/"

check "every name appears once" \
  "$(cut -d' ' -f1 "${WORK}/postfix.mapping" | sort | uniq -d)" ""

check "SKIP_LETS_ENCRYPT=y empties the map" \
  "$(SSL_DIR="${SSL_DIR}" SNI_MAP="${WORK}/skipped.map" SKIP_LETS_ENCRYPT=y "${POSTFIX_GEN}" >/dev/null; wc -c < "${WORK}/skipped.map" | tr -d ' ')" \
  "0"

# certificate_dir_for() decides which certificate the default one is copied
# from, so it has to land on the same directory the two generators do
REDIS_CMDLINE="true"
MAILCOW_HOSTNAME="srv01.example.com"
ACME_BASE="${SSL_DIR}"
source "${ACME_FUNCTIONS}"

check "certificate_dir_for finds the hostname certificate" \
  "$(certificate_dir_for "srv01.example.com")" "${SSL_DIR}/0-srv01.example.com/"

check "certificate_dir_for agrees with the map on a repeated name" \
  "$(certificate_dir_for "imap.example.com")" \
  "$(awk '$1 == "imap.example.com" { print $2 }' "${WORK}/postfix.mapping")"

check "certificate_dir_for resolves a name through its wildcard" \
  "$(certificate_dir_for "mail.example.org")" "${SSL_DIR}/2-wildcard.example.org/"

check "certificate_dir_for reports nothing for an uncovered name" \
  "$(certificate_dir_for "absent.example.com" || echo "<none>")" "<none>"

exit ${FAILED}
