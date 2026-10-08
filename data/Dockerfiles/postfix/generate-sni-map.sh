#!/bin/bash

# Rebuild the Postfix SNI map from the certificates in /etc/ssl/mail.
#
# This lives in a script of its own, and not inside postfix.sh, because
# "postmap -F" copies the certificate and key *contents* into sni.map.db.
# The database is a snapshot: when ACME renews a certificate the PEM file on
# disk changes but the snapshot does not, and "postfix reload" never rebuilds
# it. Dovecot reads "ssl_cert = <file" again on every reload and does pick the
# renewal up, so without a rebuild the two start answering the same SNI name
# with different certificates - up to and including one that has expired.
# Keeping the generator callable on its own lets a reload refresh the snapshot
# instead of needing a container restart.

set -o pipefail

SSL_DIR=${SSL_DIR:-/etc/ssl/mail}
SNI_MAP=${SNI_MAP:-/opt/postfix/conf/sni.map}

declare -A SEEN=()
: > "${SNI_MAP}"

if [[ ! "${SKIP_LETS_ENCRYPT}" =~ ^([yY][eE][sS]|[yY])+$ ]]; then
  for cert_dir in "${SSL_DIR}"/*/ ; do
    if [[ ! -f "${cert_dir}domains" ]] || [[ ! -f "${cert_dir}cert.pem" ]] || [[ ! -f "${cert_dir}key.pem" ]]; then
      continue
    fi
    IFS=" " read -r -a domains <<< "$(cat "${cert_dir}domains")"
    for domain in "${domains[@]}"; do
      # postmap keeps the first entry for a name and drops the rest; Dovecot
      # resolves duplicates the same way, so both land on the same directory
      [[ -n ${SEEN[${domain}]:-} ]] && continue
      SEEN[${domain}]=1
      printf '%s %skey.pem %scert.pem\n' "${domain}" "${cert_dir}" "${cert_dir}" >> "${SNI_MAP}"
    done
  done
fi

if ! postmap -F "hash:${SNI_MAP}"; then
  echo "Could not rebuild ${SNI_MAP}.db - Postfix keeps serving the certificates of the previous snapshot" >&2
  exit 1
fi
