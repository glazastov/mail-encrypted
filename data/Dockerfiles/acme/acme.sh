#!/bin/bash
set -o pipefail
exec 5>&1

# Do not attempt to write to slave
if [[ ! -z ${REDIS_SLAVEOF_IP} ]]; then
  export REDIS_CMDLINE="redis-cli -h ${REDIS_SLAVEOF_IP} -p ${REDIS_SLAVEOF_PORT} -a ${REDISPASS} --no-auth-warning"
else
  export REDIS_CMDLINE="redis-cli -h redis -p 6379 -a ${REDISPASS} --no-auth-warning"
fi

until [[ $(${REDIS_CMDLINE} PING) == "PONG" ]]; do
  echo "Waiting for Redis..."
  sleep 2
done

# Create DNS-01 configuration template if it doesn't exist
if [[ ! -f /etc/acme/dns-01.conf ]]; then
  mkdir -p /etc/acme
  cat > /etc/acme/dns-01.conf <<'EOF'
# Add here your DNS-01 challenge configuration
# For more information, visit the acme.sh documentation:
# https://github.com/acmesh-official/acme.sh/wiki/dnsapi
EOF
  echo "Created DNS-01 configuration template at /etc/acme/dns-01.conf"
fi

source /srv/functions.sh
# Thanks to https://github.com/cvmiller -> https://github.com/cvmiller/expand6
source /srv/expand6.sh

# Skipping IP check when we like to live dangerously
if [[ "${SKIP_IP_CHECK}" =~ ^([yY][eE][sS]|[yY])+$ ]]; then
  SKIP_IP_CHECK=y
fi

# Skipping HTTP check when we like to live dangerously
if [[ "${SKIP_HTTP_VERIFICATION}" =~ ^([yY][eE][sS]|[yY])+$ ]]; then
  SKIP_HTTP_VERIFICATION=y
fi

# Request certificate for MAILCOW_HOSTNAME only
if [[ "${ONLY_MAILCOW_HOSTNAME}" =~ ^([yY][eE][sS]|[yY])+$ ]]; then
  ONLY_MAILCOW_HOSTNAME=y
fi

if [[ "${AUTODISCOVER_SAN}" =~ ^([yY][eE][sS]|[yY])+$ ]]; then
  AUTODISCOVER_SAN=y
fi

# Request individual certificate for every domain
if [[ "${ENABLE_SSL_SNI}" =~ ^([yY][eE][sS]|[yY])+$ ]]; then
  ENABLE_SSL_SNI=y
fi

# Which challenge validates a domain:
#   n    - HTTP-01 for every domain (acme-tiny)
#   y    - DNS-01 for every domain (acme.sh)
#   auto - DNS-01 for the domains whose zone the DNS provider's API manages,
#          HTTP-01 for all others
case "${ACME_DNS_CHALLENGE,,}" in
  y|yes)
    ACME_DNS_CHALLENGE=y
    ;;
  auto)
    ACME_DNS_CHALLENGE=auto
    ;;
  *)
    ACME_DNS_CHALLENGE=n
    ;;
esac
if [[ ${ACME_DNS_CHALLENGE} != "n" ]] && [[ -z ${ACME_DNS_PROVIDER} || ${ACME_DNS_PROVIDER} == "dns_xxx" ]]; then
  log_f "ACME_DNS_CHALLENGE=${ACME_DNS_CHALLENGE} needs ACME_DNS_PROVIDER to be set - falling back to the HTTP-01 challenge"
  ACME_DNS_CHALLENGE=n
fi
# obtain-certificate.sh and its children read the normalized value
export ACME_DNS_CHALLENGE

# Obtain the mail server certificate (MAILCOW_HOSTNAME + ADDITIONAL_SAN) used
# by Postfix and Dovecot. The web subdomains (autodiscover, autoconfig,
# mta-sts) are switched separately by AUTODISCOVER_SAN.
if [[ "${ACME_MAIL_CERTS}" =~ ^([nN][oO]|[nN])+$ ]]; then
  ACME_MAIL_CERTS=n
else
  ACME_MAIL_CERTS=y
fi

# Restart Postfix and Dovecot until they serve the same certificate for every
# name. Switching this off leaves the mismatch reported but unattended.
if [[ "${ACME_ENFORCE_CERT_MATCH}" =~ ^([nN][oO]|[nN])+$ ]]; then
  ACME_ENFORCE_CERT_MATCH=n
else
  ACME_ENFORCE_CERT_MATCH=y
fi

# E-mail ACME_ACCOUNT_EMAIL when a certificate cannot be obtained
if [[ "${ACME_NOTIFY_FAILURES}" =~ ^([nN][oO]|[nN])+$ ]]; then
  ACME_NOTIFY_FAILURES=n
else
  ACME_NOTIFY_FAILURES=y
fi

if [[ "${SKIP_LETS_ENCRYPT}" =~ ^([yY][eE][sS]|[yY])+$ ]]; then
  log_f "SKIP_LETS_ENCRYPT=y, skipping Let's Encrypt..."
  ${REDIS_CMDLINE} DEL ACME_FORCE_RENEW > /dev/null
  sleep 365d
  exec $(readlink -f "$0")
fi

if [[ ${ACME_MAIL_CERTS} == "n" && ${AUTODISCOVER_SAN} != "y" ]]; then
  log_f "ACME_MAIL_CERTS=n and AUTODISCOVER_SAN=n, no certificates to obtain - skipping Let's Encrypt..."
  ${REDIS_CMDLINE} DEL ACME_FORCE_RENEW > /dev/null
  sleep 365d
  exec $(readlink -f "$0")
fi

log_f "Waiting for Docker API..."
until ping dockerapi -c1 > /dev/null; do
  sleep 1
done
log_f "Docker API OK"

log_f "Waiting for Postfix..."
until ping postfix -c1 > /dev/null; do
  sleep 1
done
log_f "Postfix OK"

log_f "Waiting for Dovecot..."
until ping dovecot -c1 > /dev/null; do
  sleep 1
done
log_f "Dovecot OK"

ACME_BASE=/var/lib/acme

# Resolves ACME_PROFILE / ACME_RENEW_BEFORE / ACME_CHECK_INTERVAL
acme_profile_defaults
log_f "Certificate profile: ${ACME_PROFILE:-CA default}, renewing ${ACME_RENEW_DAYS} day(s) before expiry, checking every ${ACME_CHECK_INTERVAL}"
SSL_EXAMPLE=/var/lib/ssl-example

mkdir -p ${ACME_BASE}/acme

acme_check_force_renew

# Migrate
[[ -f ${ACME_BASE}/acme/private/privkey.pem ]] && mv ${ACME_BASE}/acme/private/privkey.pem ${ACME_BASE}/acme/key.pem
[[ -f ${ACME_BASE}/acme/private/account.key ]] && mv ${ACME_BASE}/acme/private/account.key ${ACME_BASE}/acme/account.pem
if [[ -f ${ACME_BASE}/acme/key.pem && -f ${ACME_BASE}/acme/cert.pem ]]; then
  if verify_hash_match ${ACME_BASE}/acme/cert.pem ${ACME_BASE}/acme/key.pem; then
    log_f "Migrating to SNI folder structure..."
    CERT_DOMAIN=($(openssl x509 -noout -text -in ${ACME_BASE}/acme/cert.pem | grep "Subject:" | sed -e 's/\(Subject:\)\|\(CN = \)\|\(CN=\)//g' | sed -e 's/^[[:space:]]*//'))
    CERT_DOMAINS=(${CERT_DOMAIN} $(openssl x509 -noout -text -in ${ACME_BASE}/acme/cert.pem | grep "DNS:" | sed -e 's/\(DNS:\)\|,//g' | sed "s/${CERT_DOMAIN}//" | sed -e 's/^[[:space:]]*//'))
    mkdir -p ${ACME_BASE}/${CERT_DOMAIN}
    mv ${ACME_BASE}/acme/cert.pem ${ACME_BASE}/${CERT_DOMAIN}/cert.pem
    # key is only copied, not moved, because it is used by all other requests too
    cp ${ACME_BASE}/acme/key.pem ${ACME_BASE}/${CERT_DOMAIN}/key.pem
    chmod 600 ${ACME_BASE}/${CERT_DOMAIN}/key.pem
    echo -n ${CERT_DOMAINS[*]} > ${ACME_BASE}/${CERT_DOMAIN}/domains
    mv ${ACME_BASE}/acme/acme.csr ${ACME_BASE}/${CERT_DOMAIN}/acme.csr
    log_f "OK" no_date
  fi
fi

[[ ! -f ${ACME_BASE}/dhparams.pem ]] && cp ${SSL_EXAMPLE}/dhparams.pem ${ACME_BASE}/dhparams.pem

if [[ -f ${ACME_BASE}/cert.pem ]] && [[ -f ${ACME_BASE}/key.pem ]] && [[ $(stat -c%s ${ACME_BASE}/cert.pem) != 0 ]]; then
  ISSUER=$(openssl x509 -in ${ACME_BASE}/cert.pem -noout -issuer)
  # With ACME_MAIL_CERTS=n the server certificate is managed outside of ACME,
  # so a foreign issuer must not stop the web certificates from renewing
  if [[ ${ACME_MAIL_CERTS} == "y" && ${ISSUER} != *"Let's Encrypt"* && ${ISSUER} != *"mailcow"* && ${ISSUER} != *"Fake LE Intermediate"* ]]; then
    log_f "Found certificate with issuer other than mailcow snake-oil CA and Let's Encrypt, skipping ACME client..."
    ${REDIS_CMDLINE} DEL ACME_FORCE_RENEW > /dev/null
    sleep 3650d
    exec $(readlink -f "$0")
  fi
else
  if [[ -f ${ACME_BASE}/${MAILCOW_HOSTNAME}/cert.pem ]] && [[ -f ${ACME_BASE}/${MAILCOW_HOSTNAME}/key.pem ]] && verify_hash_match ${ACME_BASE}/${MAILCOW_HOSTNAME}/cert.pem ${ACME_BASE}/${MAILCOW_HOSTNAME}/key.pem; then
    log_f "Restoring previous acme certificate and restarting script..."
    cp ${ACME_BASE}/${MAILCOW_HOSTNAME}/cert.pem ${ACME_BASE}/cert.pem
    cp ${ACME_BASE}/${MAILCOW_HOSTNAME}/key.pem ${ACME_BASE}/key.pem
    # Restarting with env var set to trigger a restart,
    exec env TRIGGER_RESTART=1 $(readlink -f "$0")
  else
    log_f "Restoring mailcow snake-oil certificates and restarting script..."
    cp ${SSL_EXAMPLE}/cert.pem ${ACME_BASE}/cert.pem
    cp ${SSL_EXAMPLE}/key.pem ${ACME_BASE}/key.pem
    exec env TRIGGER_RESTART=1 $(readlink -f "$0")
  fi
fi

chmod 600 ${ACME_BASE}/key.pem

log_f "Waiting for database..."
while ! /usr/bin/mariadb-admin status --ssl=false --socket=/var/run/mysqld/mysqld.sock -u${DBUSER} -p${DBPASS} --silent > /dev/null; do
  sleep 2
done
log_f "Database OK"

log_f "Waiting for Nginx..."
until $(curl --output /dev/null --silent --head --fail http://nginx.${COMPOSE_PROJECT_NAME}_mailcow-network:8081); do
  sleep 2
done
log_f "Nginx OK"

log_f "Waiting for resolver..."
until dig letsencrypt.org +time=3 +tries=1 @unbound > /dev/null; do
  sleep 2
done
log_f "Resolver OK"

# Waiting for domain table
log_f "Waiting for domain table..."
while [[ -z ${DOMAIN_TABLE} ]]; do
  curl --silent http://nginx.${COMPOSE_PROJECT_NAME}_mailcow-network/ >/dev/null 2>&1
  DOMAIN_TABLE=$(mariadb --skip-ssl --socket=/var/run/mysqld/mysqld.sock -u ${DBUSER} -p${DBPASS} ${DBNAME} -e "SHOW TABLES LIKE 'domain'" -Bs)
  [[ -z ${DOMAIN_TABLE} ]] && sleep 10
done
log_f "OK" no_date

log_f "Initializing, please wait..."

while true; do
  # Re-using previous acme-mailcow account and domain keys
  if [[ ! -f ${ACME_BASE}/acme/key.pem ]]; then
    log_f "Generating missing domain private rsa key..."
    openssl genrsa 4096 > ${ACME_BASE}/acme/key.pem
  else
    log_f "Using existing domain rsa key ${ACME_BASE}/acme/key.pem"
  fi
  if [[ ! -f ${ACME_BASE}/acme/account.pem ]]; then
    log_f "Generating missing Lets Encrypt account key..."
    openssl genrsa 4096 > ${ACME_BASE}/acme/account.pem
  else
    log_f "Using existing Lets Encrypt account key ${ACME_BASE}/acme/account.pem"
  fi

  chmod 600 ${ACME_BASE}/acme/key.pem
  chmod 600 ${ACME_BASE}/acme/account.pem

  unset EXISTING_CERTS
  declare -a EXISTING_CERTS
  for cert_dir in ${ACME_BASE}/*/ ; do
    if [[ ! -f ${cert_dir}domains ]] || [[ ! -f ${cert_dir}cert.pem ]] || [[ ! -f ${cert_dir}key.pem ]]; then
      continue
    fi
    EXISTING_CERTS+=("$(basename ${cert_dir})")
  done

  # Ask the DNS provider about a zone once per loop, so that a zone added or
  # removed there is picked up on the next run
  rm -f /tmp/acme-dns-managed.cache

  # The certificates page reads this record, which is published at the end of
  # the loop by acme_status_publish
  acme_status_reset
  acme_status_config

  # Cleaning up and init validation arrays
  unset SQL_DOMAIN_ARR
  unset VALIDATED_CONFIG_DOMAINS
  unset ADDITIONAL_VALIDATED_SAN
  unset ADDITIONAL_WC_ARR
  unset ADDITIONAL_SAN_ARR
  unset CERT_ERRORS
  unset CERT_CHANGED
  unset CERT_AMOUNT_CHANGED
  unset VALIDATED_CERTIFICATES
  CERT_ERRORS=0
  CERT_CHANGED=0
  CERT_AMOUNT_CHANGED=0
  declare -a SQL_DOMAIN_ARR
  declare -a VALIDATED_CONFIG_DOMAINS
  declare -a ADDITIONAL_VALIDATED_SAN
  declare -a ADDITIONAL_WC_ARR
  declare -a ADDITIONAL_SAN_ARR
  declare -a VALIDATED_CERTIFICATES
  # ADDITIONAL_SAN belongs to the mail server certificate
  TMP_ARR=()
  if [[ ${ACME_MAIL_CERTS} == "y" ]]; then
    IFS=',' read -r -a TMP_ARR <<< "${ADDITIONAL_SAN}"
  fi
  for i in "${TMP_ARR[@]}" ; do
    if [[ "$i" =~ \.\*$ ]]; then
      ADDITIONAL_WC_ARR+=(${i::-2})
    else
      ADDITIONAL_SAN_ARR+=($i)
    fi
  done

  if [[ ${AUTODISCOVER_SAN} == "y" ]]; then
  # Fetch certs for autoconfig and autodiscover subdomains
  ADDITIONAL_WC_ARR+=('autodiscover' 'autoconfig' 'mta-sts')
  fi

  if [[ ${SKIP_IP_CHECK} != "y" ]]; then
  # Start IP detection
  log_f "Detecting IP addresses..."
  IPV4=$(get_ipv4)
  IPV6=$(get_ipv6)
  log_f "OK: ${IPV4}, ${IPV6:-"0000:0000:0000:0000:0000:0000:0000:0000"}"
  fi

  #########################################
  # IP and webroot challenge verification #
  SQL_DOMAINS=$(mariadb --skip-ssl --socket=/var/run/mysqld/mysqld.sock -u ${DBUSER} -p${DBPASS} ${DBNAME} -e "SELECT domain FROM domain WHERE backupmx=0 and active=1" -Bs)
  if [[ ! $? -eq 0 ]]; then
    log_f "Failed to read SQL domains, retrying in 1 minute..."
    sleep 1m
    exec $(readlink -f "$0")
  fi
  while read domains; do
    if [[ -z "${domains}" ]]; then
      # ignore empty lines
      continue
    fi
    SQL_DOMAIN_ARR+=("${domains}")
  done <<< "${SQL_DOMAINS}"

  if [[ ${ONLY_MAILCOW_HOSTNAME} != "y" ]]; then
  # Fetch all domains with an active MTA-STS policy once.
  unset MTA_STS_ACTIVE_DOMAINS
  declare -A MTA_STS_ACTIVE_DOMAINS
  if [[ ${AUTODISCOVER_SAN} == "y" ]]; then
    SQL_MTA_STS_DOMAINS=$(mariadb --skip-ssl --socket=/var/run/mysqld/mysqld.sock -u ${DBUSER} -p${DBPASS} ${DBNAME} -e "SELECT domain FROM mta_sts WHERE active = 1" -Bs)
    if [[ $? -eq 0 ]]; then
      while read mta_sts_domain; do
        if [[ -z "${mta_sts_domain}" ]]; then
          # ignore empty lines
          continue
        fi
        MTA_STS_ACTIVE_DOMAINS["${mta_sts_domain}"]=1
      done <<< "${SQL_MTA_STS_DOMAINS}"
    fi
  fi
  for SQL_DOMAIN in "${SQL_DOMAIN_ARR[@]}"; do
    unset VALIDATED_CONFIG_DOMAINS_SUBDOMAINS
    declare -a VALIDATED_CONFIG_DOMAINS_SUBDOMAINS
    for SUBDOMAIN in "${ADDITIONAL_WC_ARR[@]}"; do
      FULL_SUBDOMAIN="${SUBDOMAIN}.${SQL_DOMAIN}"

      # Skip mta-sts subdomain unless MTA-STS is enabled (active) for this domain
      if [[ "${SUBDOMAIN}" == "mta-sts" && -z "${MTA_STS_ACTIVE_DOMAINS[${SQL_DOMAIN}]}" ]]; then
        log_f "MTA-STS is not enabled for ${SQL_DOMAIN} - skipping mta-sts subdomain certificate"
        continue
      fi

      # Skip if subdomain matches MAILCOW_HOSTNAME
      if [[ "${FULL_SUBDOMAIN}" == "${MAILCOW_HOSTNAME}" ]]; then
        continue
      fi
      # Skip if subdomain is covered by a wildcard in ADDITIONAL_SAN
      if is_covered_by_wildcard "${FULL_SUBDOMAIN}"; then
        log_f "Subdomain '${FULL_SUBDOMAIN}' is covered by wildcard - skipping explicit subdomain"
        continue
      fi
      # Validate and add subdomain
      if check_domain "${FULL_SUBDOMAIN}"; then
        VALIDATED_CONFIG_DOMAINS_SUBDOMAINS+=("${FULL_SUBDOMAIN}")
      fi
    done
    VALIDATED_CONFIG_DOMAINS+=("${VALIDATED_CONFIG_DOMAINS_SUBDOMAINS[*]}")
  done

  # Fetch alias domains where target domain has MTA-STS enabled
  if [[ ${AUTODISCOVER_SAN} == "y" ]]; then
    SQL_ALIAS_DOMAINS=$(mariadb --skip-ssl --socket=/var/run/mysqld/mysqld.sock -u ${DBUSER} -p${DBPASS} ${DBNAME} -e "SELECT ad.alias_domain FROM alias_domain ad INNER JOIN mta_sts m ON ad.target_domain = m.domain WHERE ad.active = 1 AND m.active = 1" -Bs)
    if [[ $? -eq 0 ]]; then
      while read alias_domain; do
        if [[ -z "${alias_domain}" ]]; then
          # ignore empty lines
          continue
        fi
        # Only add mta-sts subdomain for alias domains
        if [[ "mta-sts.${alias_domain}" != "${MAILCOW_HOSTNAME}" ]]; then
          # Skip if mta-sts subdomain is covered by a wildcard
          if is_covered_by_wildcard "mta-sts.${alias_domain}"; then
            log_f "Alias domain mta-sts subdomain 'mta-sts.${alias_domain}' is covered by wildcard - skipping"
          elif check_domain "mta-sts.${alias_domain}"; then
            VALIDATED_CONFIG_DOMAINS+=("mta-sts.${alias_domain}")
          fi
        fi
      done <<< "${SQL_ALIAS_DOMAINS}"
    fi
  fi
  fi

  unset VALIDATED_MAILCOW_HOSTNAME
  if [[ ${ACME_MAIL_CERTS} == "y" ]] && check_domain ${MAILCOW_HOSTNAME}; then
    VALIDATED_MAILCOW_HOSTNAME="${MAILCOW_HOSTNAME}"
  fi

  if [[ ${ONLY_MAILCOW_HOSTNAME} != "y" ]]; then
  for SAN in "${ADDITIONAL_SAN_ARR[@]}"; do
    # Skip on CAA errors for SAN
    SAN_PARENT_DOMAIN=$(echo ${SAN} | cut -d. -f2-)
    SAN_CAAS=( $(dig CAA ${SAN_PARENT_DOMAIN} +short | sed -n 's/\d issue "\(.*\)"/\1/p') )
    if [[ ! -z ${SAN_CAAS} ]]; then
      if [[ ${SAN_CAAS[@]} =~ "letsencrypt.org" ]]; then
        log_f "Validated CAA for parent domain ${SAN_PARENT_DOMAIN} of ${SAN}"
      else
        log_f "Skipping ACME validation for ${SAN}: Lets Encrypt disallowed for ${SAN} by CAA record"
        continue
      fi
    fi
    if [[ ${SAN} == ${MAILCOW_HOSTNAME} ]]; then
      continue
    fi
    if check_domain ${SAN}; then
      ADDITIONAL_VALIDATED_SAN+=("${SAN}")
    fi
  done
  fi

  # Check if MAILCOW_HOSTNAME is covered by a wildcard in ADDITIONAL_SAN
  MAILCOW_HOSTNAME_COVERED=0
  if [[ ! -z ${VALIDATED_MAILCOW_HOSTNAME} ]]; then
    if is_covered_by_wildcard "${VALIDATED_MAILCOW_HOSTNAME}"; then
      MAILCOW_PARENT_DOMAIN=$(echo ${VALIDATED_MAILCOW_HOSTNAME} | cut -d. -f2-)
      log_f "MAILCOW_HOSTNAME '${VALIDATED_MAILCOW_HOSTNAME}' is covered by wildcard '*.${MAILCOW_PARENT_DOMAIN}' - skipping explicit hostname"
      MAILCOW_HOSTNAME_COVERED=1
    fi
  fi

  # Unique domains for server certificate
  unset SERVER_SAN_VALIDATED
  if [[ ${ACME_MAIL_CERTS} == "n" ]]; then
    # no server certificate, the web subdomains get SNI certificates below
    :
  elif [[ ${ENABLE_SSL_SNI} == "y" ]]; then
    # create certificate for server name and fqdn SANs only
    if [[ ${MAILCOW_HOSTNAME_COVERED} == "1" ]]; then
      SERVER_SAN_VALIDATED=($(echo ${ADDITIONAL_VALIDATED_SAN[*]} | xargs -n1 | sort -u | xargs))
    else
      SERVER_SAN_VALIDATED=(${VALIDATED_MAILCOW_HOSTNAME} $(echo ${ADDITIONAL_VALIDATED_SAN[*]} | xargs -n1 | sort -u | xargs))
    fi
  else
    # create certificate for all domains, including all subdomains from other domains [*]
    if [[ ${MAILCOW_HOSTNAME_COVERED} == "1" ]]; then
      SERVER_SAN_VALIDATED=($(echo ${VALIDATED_CONFIG_DOMAINS[*]} ${ADDITIONAL_VALIDATED_SAN[*]} | xargs -n1 | sort -u | xargs))
    else
      SERVER_SAN_VALIDATED=(${VALIDATED_MAILCOW_HOSTNAME} $(echo ${VALIDATED_CONFIG_DOMAINS[*]} ${ADDITIONAL_VALIDATED_SAN[*]} | xargs -n1 | sort -u | xargs))
    fi
  fi
  if [[ ! -z ${SERVER_SAN_VALIDATED[*]} ]]; then
    CERT_NAME=${SERVER_SAN_VALIDATED[0]}
    VALIDATED_CERTIFICATES+=("${CERT_NAME}")

    # obtain server certificate if required
    DOMAINS=${SERVER_SAN_VALIDATED[@]} /srv/obtain-certificate.sh rsa
    RETURN="$?"
    # before acme_notify_result, which consumes the error output of the client
    acme_status_cert "${CERT_NAME}" "${RETURN}" "${SERVER_SAN_VALIDATED[*]}"
    acme_notify_result "${CERT_NAME}" "${RETURN}" "${SERVER_SAN_VALIDATED[*]}"
    if [[ "$RETURN" == "0" ]]; then # 0 = cert created successfully
      CERT_AMOUNT_CHANGED=1
      CERT_CHANGED=1
    elif [[ "$RETURN" == "1" ]]; then # 1 = cert renewed successfully
      CERT_CHANGED=1
    elif [[ "$RETURN" == "2" ]]; then # 2 = cert not due for renewal
      :
    else
      CERT_ERRORS=1
    fi
    # copy hostname certificate to default/server certificate
    # do not a key when cert is missing, this can lead to a mismatch of cert/key
    if [[ -f ${ACME_BASE}/${CERT_NAME}/cert.pem ]]; then
      cp ${ACME_BASE}/${CERT_NAME}/cert.pem ${ACME_BASE}/cert.pem
      cp ${ACME_BASE}/${CERT_NAME}/key.pem ${ACME_BASE}/key.pem
    fi
  fi

  # individual certificates for SNI [@]
  # Without the server certificate the web subdomains have nowhere else to go
  if [[ ${ENABLE_SSL_SNI} == "y" || ${ACME_MAIL_CERTS} == "n" ]]; then
  for VALIDATED_DOMAINS in "${VALIDATED_CONFIG_DOMAINS[@]}"; do
    VALIDATED_DOMAINS_ARR=(${VALIDATED_DOMAINS})

    unset VALIDATED_DOMAINS_SORTED
    declare -a VALIDATED_DOMAINS_SORTED
    VALIDATED_DOMAINS_SORTED=(${VALIDATED_DOMAINS_ARR[0]} $(echo ${VALIDATED_DOMAINS_ARR[@]:1} | xargs -n1 | sort -u | xargs))

    # remove all domain names that are already inside the server certificate (SERVER_SAN_VALIDATED)
    for domain in "${SERVER_SAN_VALIDATED[@]}"; do
      for i in "${!VALIDATED_DOMAINS_SORTED[@]}"; do
        if [[ ${VALIDATED_DOMAINS_SORTED[i]} = $domain ]]; then
          unset 'VALIDATED_DOMAINS_SORTED[i]'
        fi
      done
    done

    if [[ ! -z ${VALIDATED_DOMAINS_SORTED[*]} ]]; then
      CERT_NAME=${VALIDATED_DOMAINS_SORTED[0]}
      VALIDATED_CERTIFICATES+=("${CERT_NAME}")
      # obtain certificate if required
      DOMAINS=${VALIDATED_DOMAINS_SORTED[@]} /srv/obtain-certificate.sh rsa
      RETURN="$?"
      # before acme_notify_result, which consumes the error output of the client
      acme_status_cert "${CERT_NAME}" "${RETURN}" "${VALIDATED_DOMAINS_SORTED[*]}"
      acme_notify_result "${CERT_NAME}" "${RETURN}" "${VALIDATED_DOMAINS_SORTED[*]}"
      if [[ "$RETURN" == "0" ]]; then # 0 = cert created successfully
        CERT_AMOUNT_CHANGED=1
        CERT_CHANGED=1
      elif [[ "$RETURN" == "1" ]]; then # 1 = cert renewed successfully
        CERT_CHANGED=1
      elif [[ "$RETURN" == "2" ]]; then # 2 = cert not due for renewal
        :
      else
        CERT_ERRORS=1
      fi
    fi
  done
  fi

  if [[ -z ${VALIDATED_CERTIFICATES[*]} ]]; then
    log_f "Cannot validate any hostnames, skipping Let's Encrypt for 1 hour."
    log_f "Use SKIP_LETS_ENCRYPT=y in mailcow.conf to skip it permanently."
    ${REDIS_CMDLINE} SET ACME_FAIL_TIME "$(date +%s)"
    acme_status_publish 1
    sleep 1h
    exec $(readlink -f "$0")
  fi

  # find orphaned certificates if no errors occurred
  if [[ "${CERT_ERRORS}" == "0" ]]; then
    for EXISTING_CERT in "${EXISTING_CERTS[@]}"; do
      if [[ ! "`printf '_%s_\n' "${VALIDATED_CERTIFICATES[@]}"`" == *"_${EXISTING_CERT}_"* ]]; then
        DATE=$(date +%Y-%m-%d_%H_%M_%S)
        log_f "Found orphaned certificate: ${EXISTING_CERT} - archiving it at ${ACME_BASE}/backups/${EXISTING_CERT}/"
        BACKUP_DIR=${ACME_BASE}/backups/${EXISTING_CERT}/${DATE}
        # archive rsa cert and any other files
        mkdir -p ${ACME_BASE}/backups/${EXISTING_CERT}
        mv ${ACME_BASE}/${EXISTING_CERT} ${BACKUP_DIR}
        CERT_CHANGED=1
        CERT_AMOUNT_CHANGED=1
      fi
    done
  fi

  [[ "${CERT_CHANGED}" == "1" ]] && rm -f "${ACME_BASE}/force_renew" 2> /dev/null

  if [[ ${ACME_MAIL_CERTS} == "n" ]]; then
    # The mail certificate is managed outside of ACME, so there is no default
    # certificate to keep in sync and nothing to hold the two services to
    if [[ "${CERT_CHANGED}" == "1" ]]; then
      log_f "Reloading or restarting services..."
      CERT_AMOUNT_CHANGED=${CERT_AMOUNT_CHANGED} /srv/reload-configurations.sh
    fi
  elif [[ ${ACME_ENFORCE_CERT_MATCH} == "n" ]]; then
    if [[ "${CERT_CHANGED}" == "1" ]]; then
      log_f "Reloading or restarting services..."
      CERT_AMOUNT_CHANGED=${CERT_AMOUNT_CHANGED} /srv/reload-configurations.sh
    fi
    /srv/verify-served-certificates.sh || log_f "Not enforcing the match, ACME_ENFORCE_CERT_MATCH=n"
  else
    sync_default_certificate || CERT_ERRORS=1

    # Checked on every loop, not only after a renewal: the two drift apart
    # whenever one of them reloads without the other, and the old check could
    # not see it at all - it compared each service against a second sample of
    # itself, never Postfix against Dovecot.
    export VERIFY_REPORT=/tmp/acme-cert-mismatch
    RELOAD_LOOP_C=0
    while ! /srv/verify-served-certificates.sh; do
      RELOAD_LOOP_C=$((RELOAD_LOOP_C + 1))
      if [[ ${RELOAD_LOOP_C} -gt 3 ]]; then
        log_f "Postfix and Dovecot still disagree after ${RELOAD_LOOP_C} attempts, something went wrong!"
        ${REDIS_CMDLINE} SET ACME_FAIL_TIME "$(date +%s)"
        acme_notify_cert_mismatch "${VERIFY_REPORT}"
        CERT_ERRORS=1
        break
      fi

      # The certificate on disk is what both services are brought onto, so a
      # default certificate that drifted is re-synced before anything is
      # reloaded - otherwise the reload would only reinstate the wrong one
      sync_default_certificate || true

      # Repair the service the verifier blamed, not both: it names which one
      # answers a name with a certificate other than the one on disk, and
      # mailcow has no reason to drop every SMTP and IMAP connection because
      # one of the two went stale.
      REPAIR_TARGETS=""
      awk -F'\t' '$2 == "postfix" || $2 == "both" { found = 1 } END { exit !found }' "${VERIFY_REPORT}" \
        && REPAIR_TARGETS="${REPAIR_TARGETS} postfix"
      awk -F'\t' '$2 == "dovecot" || $2 == "both" { found = 1 } END { exit !found }' "${VERIFY_REPORT}" \
        && REPAIR_TARGETS="${REPAIR_TARGETS} dovecot"

      case "${RELOAD_LOOP_C}" in
        1) # Cheapest fix that works: both reload tasks regenerate sni.map.db
           # and sni.conf from the PEM files before reloading
           REPAIR_LEVEL=1 ;;
        2) # A reload did not take, restart the blamed containers
           REPAIR_LEVEL=2 ;;
        *) # Nothing specific left to try: restart the whole TLS front
           REPAIR_LEVEL=2
           REPAIR_TARGETS="nginx dovecot postfix" ;;
      esac

      # An empty blame list can only come from the default certificate being
      # out of sync, which every service reads
      [[ -z ${REPAIR_TARGETS// /} ]] && REPAIR_TARGETS="nginx dovecot postfix"

      log_f "Repairing${REPAIR_TARGETS} at level ${REPAIR_LEVEL}... (${RELOAD_LOOP_C})"
      CERT_AMOUNT_CHANGED=${CERT_AMOUNT_CHANGED} \
        REPAIR_TARGETS="${REPAIR_TARGETS}" \
        REPAIR_LEVEL=${REPAIR_LEVEL} \
        /srv/reload-configurations.sh
      log_f "Waiting for containers to settle..."
      sleep 10
      until nc -z dovecot 143; do
        sleep 1
      done
      until nc -z postfix 25; do
        sleep 1
      done
    done
  fi

  acme_status_publish ${CERT_ERRORS}

  case "$CERT_ERRORS" in
    0) # all successful
      if [[ "${CERT_CHANGED}" == "1" ]]; then
        if [[ "${CERT_AMOUNT_CHANGED}" == "1" ]]; then
          log_f "Certificates successfully requested and renewed where required, sleeping one day"
        else
          log_f "Certificates were successfully renewed where required, sleeping for another day."
        fi
      else
        log_f "Certificates were successfully validated, no changes or renewals required, sleeping for another day."
      fi
      sleep ${ACME_CHECK_INTERVAL}
      ;;
    *) # non-zero
      log_f "Some errors occurred, retrying in 30 minutes..."
      ${REDIS_CMDLINE} SET ACME_FAIL_TIME "$(date +%s)"
      sleep 30m
      exec $(readlink -f "$0")
      ;;
  esac

done
