#!/bin/bash

# Rebuild the Dovecot SNI configuration from the certificates in /etc/ssl/mail.
#
# A standalone script so that it stays the mirror image of the Postfix one in
# data/Dockerfiles/postfix/generate-sni-map.sh: both walk the same directories
# in the same order and resolve a repeated name the same way. When the two
# disagree, Postfix and Dovecot answer the same SNI name with different
# certificates.

set -o pipefail

SSL_DIR=${SSL_DIR:-/etc/ssl/mail}
SNI_CONF=${SNI_CONF:-/etc/dovecot/sni.conf}

declare -A SEEN=()
echo "" > "${SNI_CONF}"

for cert_dir in "${SSL_DIR}"/*/ ; do
  if [[ ! -f "${cert_dir}domains" ]] || [[ ! -f "${cert_dir}cert.pem" ]] || [[ ! -f "${cert_dir}key.pem" ]]; then
    continue
  fi
  IFS=" " read -r -a domains <<< "$(cat "${cert_dir}domains")"
  for domain in "${domains[@]}"; do
    # postmap keeps the first entry for a name and drops the rest
    [[ -n ${SEEN[${domain}]:-} ]] && continue
    SEEN[${domain}]=1
    printf 'local_name %s {\n  ssl_cert = <%scert.pem\n  ssl_key = <%skey.pem\n}\n' \
      "${domain}" "${cert_dir}" "${cert_dir}" >> "${SNI_CONF}"
  done
done
