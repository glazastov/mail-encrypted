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
      # Postfix looks the SNI name up verbatim and then retries with its
      # ancestor domains prefixed by a dot. It never matches a "*." key, so a
      # wildcard certificate written the way it is stored in "domains" is
      # simply absent from the map and every name it covers gets answered
      # from the default chain instead. Dovecot's local_name does match
      # "*.example.com" - that asymmetry is how submission served the default
      # certificate while IMAP served the wildcard one for the same name.
      if [[ ${domain} == \*.* ]]; then
        key=".${domain#\*.}"
      else
        key="${domain}"
      fi
      # postmap keeps the first entry for a key and drops the rest; Dovecot
      # resolves duplicates the same way, so both land on the same directory
      [[ -n ${SEEN[${key}]:-} ]] && continue
      SEEN[${key}]=1
      printf '%s %skey.pem %scert.pem\n' "${key}" "${cert_dir}" "${cert_dir}" >> "${SNI_MAP}"
    done
  done
fi

if ! postmap -F "hash:${SNI_MAP}"; then
  echo "Could not rebuild ${SNI_MAP}.db - Postfix keeps serving the certificates of the previous snapshot" >&2
  exit 1
fi
