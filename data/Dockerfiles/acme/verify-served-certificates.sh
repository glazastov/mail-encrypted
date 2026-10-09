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
# which is what tells the caller to repair the two services.
#
# The certificate on disk is the authority, never the one already being
# served: every name is held to the PEM file it is supposed to come from, so
# the service that is wrong can be named instead of restarting both and
# hoping. The names and the services at fault are written to ${VERIFY_REPORT}
# as "name<TAB>postfix|dovecot|both" lines for the caller to act on.

set -o pipefail

source /srv/functions.sh

ACME_BASE=${ACME_BASE:-/var/lib/acme}
POSTFIX_PROBE=${POSTFIX_PROBE:-postfix:25}
DOVECOT_PROBE=${DOVECOT_PROBE:-dovecot:143}
# A wildcard certificate is probed through a label that cannot collide with a
# real name, since SNI only has to be sent, not resolved
WILDCARD_LABEL=${WILDCARD_LABEL:-acme-sni-probe}

VERIFY_REPORT=${VERIFY_REPORT:-/tmp/acme-cert-mismatch}

MISMATCHES=0
: > "${VERIFY_REPORT}"

# Usage: record_mismatch label postfix|dovecot|both
record_mismatch(){
  MISMATCHES=$((MISMATCHES + 1))
  printf '%s\t%s\n' "${1}" "${2}" >> "${VERIFY_REPORT}"
}

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
# each other, which is all that can be asked of a name no certificate
# directory claims. A wildcard entry is no longer excused: Postfix resolves
# ".example.com" through its map just as Dovecot resolves "*.example.com"
# through local_name, so both have to land on that certificate.
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
    if [[ -z ${POSTFIX_FP} ]] && [[ -z ${DOVECOT_FP} ]]; then
      record_mismatch "${LABEL}" both
    elif [[ -z ${POSTFIX_FP} ]]; then
      record_mismatch "${LABEL}" postfix
    else
      record_mismatch "${LABEL}" dovecot
    fi
    return 1
  fi

  # With the expected certificate in hand the offender is known by name, so
  # only that service has to be put back on it
  if [[ -n ${EXPECTED} ]]; then
    local -a WRONG=()
    [[ ${POSTFIX_FP} != "${EXPECTED}" ]] && WRONG+=(postfix)
    [[ ${DOVECOT_FP} != "${EXPECTED}" ]] && WRONG+=(dovecot)
    if [[ ${#WRONG[@]} -gt 0 ]]; then
      log_f "${LABEL}: ${EXPECTED_FILE} holds ${EXPECTED}, but Postfix serves ${POSTFIX_FP} and Dovecot serves ${DOVECOT_FP}"
      if [[ ${#WRONG[@]} -eq 2 ]]; then
        record_mismatch "${LABEL}" both
      else
        record_mismatch "${LABEL}" "${WRONG[0]}"
      fi
      return 1
    fi
    return 0
  fi

  if [[ ${POSTFIX_FP} != "${DOVECOT_FP}" ]]; then
    log_f "${LABEL}: Postfix and Dovecot serve different certificates (${POSTFIX_FP} vs ${DOVECOT_FP})"
    record_mismatch "${LABEL}" both
    return 1
  fi

  return 0
}

# The default certificate has to track the one covering MAILCOW_HOSTNAME,
# because every name without an SNI entry is served from it
DEFAULT_SOURCE="$(certificate_dir_for "${MAILCOW_HOSTNAME}")"
if [[ -n ${DEFAULT_SOURCE} ]] && ! cmp -s "${DEFAULT_SOURCE}cert.pem" "${ACME_BASE}/cert.pem"; then
  log_f "<default>: ${ACME_BASE}/cert.pem is not the certificate in ${DEFAULT_SOURCE}"
  # Both services read the default chain, so both are wrong until it is synced
  record_mismatch "<default-source>" both
fi

compare_name "${ACME_BASE}/cert.pem"

declare -A CHECKED=()
for CERT_DIR in "${ACME_BASE}"/*/ ; do
  [[ -f "${CERT_DIR}domains" ]] && [[ -f "${CERT_DIR}cert.pem" ]] && [[ -f "${CERT_DIR}key.pem" ]] || continue

  # A directory whose certificate has expired claims nothing. Holding its
  # names to it would demand that both services answer with a certificate
  # every client rejects, and would blame the one that correctly fell through
  # to a current wildcard. Orphans from an ADDITIONAL_SAN change sit here
  # until acme.sh archives them, so this is the normal state, not an anomaly.
  if ! certificate_is_current "${CERT_DIR}cert.pem"; then
    log_f "Ignoring ${CERT_DIR}: expired on $(openssl x509 -enddate -noout -in "${CERT_DIR}cert.pem" 2>/dev/null | cut -d= -f2) - its names are served from whatever still covers them"
    continue
  fi

  IFS=" " read -r -a CERT_DOMAINS <<< "$(cat "${CERT_DIR}domains")"
  for DOMAIN in "${CERT_DOMAINS[@]}"; do
    if [[ ${DOMAIN} == \*.* ]]; then
      PROBE_NAME="${WILDCARD_LABEL}.${DOMAIN#\*.}"
    else
      PROBE_NAME="${DOMAIN}"
    fi
    [[ -n ${CHECKED[${PROBE_NAME}]:-} ]] && continue
    CHECKED[${PROBE_NAME}]=1

    # Resolve the name the way the two services do rather than assuming this
    # directory wins it: another one may list it verbatim while this one only
    # covers it through a wildcard
    if ! EXPECTED_DIR="$(certificate_dir_for "${PROBE_NAME}")"; then
      log_f "${PROBE_NAME}: no current certificate covers this name, skipping"
      continue
    fi
    compare_name "${EXPECTED_DIR}cert.pem" "${PROBE_NAME}"
  done
done

if [[ ${MISMATCHES} -gt 0 ]]; then
  log_f "Postfix and Dovecot disagree on ${MISMATCHES} name(s)"
  exit 1
fi

log_f "Postfix and Dovecot serve the same certificate for every name"
exit 0
