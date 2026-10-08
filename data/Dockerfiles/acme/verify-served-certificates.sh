#!/bin/bash

# Assert that Postfix and Dovecot answer every SNI name with the same
# certificate, and that it is the certificate currently on disk.
#
# Both build their SNI configuration from the directories under ${ACME_BASE},
# but they consume it differently: Dovecot re-reads the PEM files whenever its
# configuration is loaded, while Postfix bakes their contents into sni.map.db.
# Nothing upstream compares the two, so they drift apart in silence - that is
# how submission ended up offering an expired certificate for days while IMAP
# served a fresh one.
#
# Prints one line per name and exits non-zero as soon as anything disagrees,
# which is what tells the caller to reload or restart the two services.

set -o pipefail

source /srv/functions.sh

ACME_BASE=${ACME_BASE:-/var/lib/acme}
POSTFIX_PROBE=${POSTFIX_PROBE:-postfix:25}
DOVECOT_PROBE=${DOVECOT_PROBE:-dovecot:143}
# A wildcard certificate is probed through a label that cannot collide with a
# real name, since SNI only has to be sent, not resolved
WILDCARD_LABEL=${WILDCARD_LABEL:-acme-sni-probe}

MISMATCHES=0

fingerprint_of_file(){
  [[ -n ${1} ]] || return 0
  openssl x509 -in "${1}" -noout -fingerprint -sha256 2>/dev/null | sed 's/^.*=//'
}

# Usage: fingerprint_served host:port starttls_protocol [sni_name]
fingerprint_served(){
  local TARGET="${1}"
  local PROTOCOL="${2}"
  local NAME="${3}"
  local -a ARGS=(-connect "${TARGET}" -starttls "${PROTOCOL}")

  [[ -n ${NAME} ]] && ARGS+=(-servername "${NAME}")

  echo | timeout 15 openssl s_client "${ARGS[@]}" 2>/dev/null \
    | openssl x509 -noout -fingerprint -sha256 2>/dev/null | sed 's/^.*=//'
}

# Usage: compare_name [expected_certificate] [sni_name]
# An empty expected certificate only asserts that the two services agree with
# each other, which is all a wildcard entry can be held to: whether Postfix
# resolves "*.example.com" through its map or falls back to the default
# certificate is its own business, as long as Dovecot ends up on the same one.
compare_name(){
  local EXPECTED_FILE="${1}"
  local NAME="${2}"
  local LABEL="${NAME:-<default>}"
  local EXPECTED POSTFIX_FP DOVECOT_FP

  EXPECTED="$(fingerprint_of_file "${EXPECTED_FILE}")"
  POSTFIX_FP="$(fingerprint_served "${POSTFIX_PROBE}" smtp "${NAME}")"
  DOVECOT_FP="$(fingerprint_served "${DOVECOT_PROBE}" imap "${NAME}")"

  if [[ -z ${POSTFIX_FP} ]] || [[ -z ${DOVECOT_FP} ]]; then
    log_f "${LABEL}: could not read the served certificate (Postfix '${POSTFIX_FP:-none}', Dovecot '${DOVECOT_FP:-none}')"
    MISMATCHES=$((MISMATCHES + 1))
    return 1
  fi

  if [[ ${POSTFIX_FP} != "${DOVECOT_FP}" ]]; then
    log_f "${LABEL}: Postfix and Dovecot serve different certificates (${POSTFIX_FP} vs ${DOVECOT_FP})"
    MISMATCHES=$((MISMATCHES + 1))
    return 1
  fi

  if [[ -n ${EXPECTED} ]] && [[ ${POSTFIX_FP} != "${EXPECTED}" ]]; then
    log_f "${LABEL}: both serve ${POSTFIX_FP}, but ${EXPECTED_FILE} holds ${EXPECTED}"
    MISMATCHES=$((MISMATCHES + 1))
    return 1
  fi

  return 0
}

# The default certificate has to track the one covering MAILCOW_HOSTNAME,
# because every name without an SNI entry is served from it
DEFAULT_SOURCE="$(certificate_dir_for "${MAILCOW_HOSTNAME}")"
if [[ -n ${DEFAULT_SOURCE} ]] && ! cmp -s "${DEFAULT_SOURCE}cert.pem" "${ACME_BASE}/cert.pem"; then
  log_f "<default>: ${ACME_BASE}/cert.pem is not the certificate in ${DEFAULT_SOURCE}"
  MISMATCHES=$((MISMATCHES + 1))
fi

compare_name "${ACME_BASE}/cert.pem"

declare -A CHECKED=()
for CERT_DIR in "${ACME_BASE}"/*/ ; do
  [[ -f "${CERT_DIR}domains" ]] && [[ -f "${CERT_DIR}cert.pem" ]] && [[ -f "${CERT_DIR}key.pem" ]] || continue
  IFS=" " read -r -a CERT_DOMAINS <<< "$(cat "${CERT_DIR}domains")"
  for DOMAIN in "${CERT_DOMAINS[@]}"; do
    if [[ ${DOMAIN} == \*.* ]]; then
      PROBE_NAME="${WILDCARD_LABEL}.${DOMAIN#\*.}"
      EXPECTED_FILE=""
    else
      PROBE_NAME="${DOMAIN}"
      EXPECTED_FILE="${CERT_DIR}cert.pem"
    fi
    [[ -n ${CHECKED[${PROBE_NAME}]:-} ]] && continue
    CHECKED[${PROBE_NAME}]=1
    compare_name "${EXPECTED_FILE}" "${PROBE_NAME}"
  done
done

if [[ ${MISMATCHES} -gt 0 ]]; then
  log_f "Postfix and Dovecot disagree on ${MISMATCHES} name(s)"
  exit 1
fi

log_f "Postfix and Dovecot serve the same certificate for every name"
exit 0
