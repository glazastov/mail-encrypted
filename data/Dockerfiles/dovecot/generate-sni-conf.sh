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

# An expired certificate is worse than no entry at all: every client rejects
# it, while a name with no entry of its own falls through to a wildcard
# certificate that is still valid, or to the default chain. A directory left
# behind by an ADDITIONAL_SAN change keeps its "domains" file and goes on
# claiming names it was once issued for - and because an exact name beats a
# wildcard, it wins them back from the certificate that is actually current.
# If openssl is unavailable the entry is kept: a map built without it would be
# worse than a stale one.
certificate_is_current(){
  command -v openssl > /dev/null 2>&1 || return 0
  openssl x509 -checkend 0 -noout -in "${1}" > /dev/null 2>&1
}

declare -A SEEN=()
echo "" > "${SNI_CONF}"

for cert_dir in "${SSL_DIR}"/*/ ; do
  if [[ ! -f "${cert_dir}domains" ]] || [[ ! -f "${cert_dir}cert.pem" ]] || [[ ! -f "${cert_dir}key.pem" ]]; then
    continue
  fi
  if ! certificate_is_current "${cert_dir}cert.pem"; then
    echo "Skipping ${cert_dir}: its certificate has expired" >&2
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
