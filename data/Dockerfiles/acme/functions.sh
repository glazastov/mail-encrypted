#!/bin/bash

log_f() {
  if [[ ${2} == "no_nl" ]]; then
    echo -n "$(date) - ${1}"
  elif [[ ${2} == "no_date" ]]; then
    echo "${1}"
  elif [[ ${2} != "redis_only" ]]; then
    echo "$(date) - ${1}"
  fi
  if [[ ${3} == "b64" ]]; then
    ${REDIS_CMDLINE} LPUSH ACME_LOG "{\"time\":\"$(date +%s)\",\"message\":\"base64,$(printf '%s' "${MAILCOW_HOSTNAME} - ${1}")\"}" > /dev/null
  else
    # The dash has to come last: between '}' and '\r' tr reads it as a reverse
    # range, aborts, and every log line reaches Redis empty
    ${REDIS_CMDLINE} LPUSH ACME_LOG "{\"time\":\"$(date +%s)\",\"message\":\"$(printf '%s' "${MAILCOW_HOSTNAME} - ${1}" | \
      tr '%&;$"[]{}\r\n-' ' ')\"}" > /dev/null
  fi
}

# Resolve the requested ACME certificate profile and the renewal window it
# implies. Let's Encrypt's "shortlived" profile issues 6-day certificates, so
# the stock 30-day renewal threshold would mark every certificate as due on
# every single run and burn through the rate limits.
acme_profile_defaults(){
  ACME_PROFILE="${ACME_PROFILE//[[:space:]]/}"
  if [[ -n "${ACME_PROFILE}" ]] && [[ ! "${ACME_PROFILE}" =~ ^[a-zA-Z0-9_-]+$ ]]; then
    log_f "Ignoring invalid ACME_PROFILE '${ACME_PROFILE}' - using the CA default"
    ACME_PROFILE=
  fi

  if [[ "${ACME_PROFILE}" == "shortlived" ]]; then
    ACME_RENEW_BEFORE_DEFAULT=172800    # 2 days left of a 6 day certificate
    ACME_CHECK_INTERVAL_DEFAULT=8h
  else
    ACME_RENEW_BEFORE_DEFAULT=2592000   # 30 days
    ACME_CHECK_INTERVAL_DEFAULT=1d
  fi

  if [[ -z "${ACME_RENEW_BEFORE}" ]]; then
    ACME_RENEW_BEFORE=${ACME_RENEW_BEFORE_DEFAULT}
  elif [[ ! "${ACME_RENEW_BEFORE}" =~ ^[0-9]+$ ]] || [[ "${ACME_RENEW_BEFORE}" -lt 3600 ]]; then
    log_f "Invalid ACME_RENEW_BEFORE '${ACME_RENEW_BEFORE}' - using ${ACME_RENEW_BEFORE_DEFAULT}s"
    ACME_RENEW_BEFORE=${ACME_RENEW_BEFORE_DEFAULT}
  fi

  # A threshold at or above the certificate lifetime means "always due".
  if [[ "${ACME_PROFILE}" == "shortlived" ]] && [[ "${ACME_RENEW_BEFORE}" -ge 432000 ]]; then
    log_f "ACME_RENEW_BEFORE=${ACME_RENEW_BEFORE}s exceeds the 6 day shortlived lifetime - clamping to ${ACME_RENEW_BEFORE_DEFAULT}s"
    ACME_RENEW_BEFORE=${ACME_RENEW_BEFORE_DEFAULT}
  fi

  if [[ -z "${ACME_CHECK_INTERVAL}" ]]; then
    ACME_CHECK_INTERVAL=${ACME_CHECK_INTERVAL_DEFAULT}
  elif [[ ! "${ACME_CHECK_INTERVAL}" =~ ^[0-9]+[smhd]?$ ]]; then
    log_f "Invalid ACME_CHECK_INTERVAL '${ACME_CHECK_INTERVAL}' - using ${ACME_CHECK_INTERVAL_DEFAULT}"
    ACME_CHECK_INTERVAL=${ACME_CHECK_INTERVAL_DEFAULT}
  fi

  ACME_RENEW_DAYS=$((ACME_RENEW_BEFORE / 86400))
}

verify_email(){
  regex="^(([A-Za-z0-9]+((\.|\-|\_|\+)?[A-Za-z0-9]?)*[A-Za-z0-9]+)|[A-Za-z0-9]+)@(([A-Za-z0-9]+)+((\.|\-|\_)?([A-Za-z0-9]+)+)*)+\.([A-Za-z]{2,})+$"
  if [[ $1 =~ ${regex} ]]; then
    return 0
  else
    return 1
  fi
}

verify_hash_match(){
  CERT_HASH=$(openssl x509 -in "${1}" -noout -pubkey | openssl md5)
  KEY_HASH=$(openssl pkey -in "${2}" -pubout | openssl md5)
  if [[ ${CERT_HASH} != ${KEY_HASH} ]]; then
    log_f "Certificate and key hashes do not match!"
    return 1
  else
    log_f "Verified hashes."
    return 0
  fi
}

get_ipv4(){
  local IPV4=
  local IPV4_SRCS=
  local TRY=
  IPV4_SRCS[0]="ip4.mailcow.email"
  IPV4_SRCS[1]="ip4.nevondo.com"
  until [[ ! -z ${IPV4} ]] || [[ ${TRY} -ge 10 ]]; do
    IPV4=$(curl --connect-timeout 3 -m 10 -L4s ${IPV4_SRCS[$RANDOM % ${#IPV4_SRCS[@]} ]} | grep -E "^((25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$")
    [[ ! -z ${TRY} ]] && sleep 1
    TRY=$((TRY+1))
  done
  echo ${IPV4}
}

get_ipv6(){
  local IPV6=
  local IPV6_SRCS=
  local TRY=
  IPV6_SRCS[0]="ip6.mailcow.email"
  IPV6_SRCS[1]="ip6.nevondo.com"
  until [[ ! -z ${IPV6} ]] || [[ ${TRY} -ge 10 ]]; do
    IPV6=$(curl --connect-timeout 3 -m 10 -L6s ${IPV6_SRCS[$RANDOM % ${#IPV6_SRCS[@]} ]} | grep "^\([0-9a-fA-F]\{0,4\}:\)\{1,7\}[0-9a-fA-F]\{0,4\}$")
    [[ ! -z ${TRY} ]] && sleep 1
    TRY=$((TRY+1))
  done
  echo ${IPV6}
}

# Cache of the DNS provider answers, one line per domain, reset by the ACME
# client on every loop so that a zone added at the provider is picked up.
ACME_DNS_MANAGED_CACHE=${ACME_DNS_MANAGED_CACHE:-/tmp/acme-dns-managed.cache}
ACME_DNS_ZONE_CHECK=${ACME_DNS_ZONE_CHECK:-/srv/dns-zone-check.sh}

# Ask the configured DNS provider's API whether it manages the zone a domain
# belongs to - the deciding question for ACME_DNS_CHALLENGE=auto.
# Usage: dns_zone_managed sub.example.com
# Returns: 0 when the provider manages the zone, 1 when it does not
dns_zone_managed(){
  # a wildcard is validated in the zone of its parent
  local DOMAIN="${1#\*.}"
  local CACHED REASON RETURN

  if [[ -z ${ACME_DNS_PROVIDER} ]] || [[ ${ACME_DNS_PROVIDER} == "dns_xxx" ]]; then
    return 1
  fi

  CACHED=$(awk -F= -v d="${DOMAIN}" '$1 == d { v = $2 } END { print v }' "${ACME_DNS_MANAGED_CACHE}" 2>/dev/null)
  if [[ ${CACHED} == "1" ]]; then
    return 0
  elif [[ ${CACHED} == "0" ]]; then
    return 1
  fi

  REASON=$("${ACME_DNS_ZONE_CHECK}" "${DOMAIN}" 2>&1)
  RETURN=$?
  [[ -n ${REASON} ]] && log_f "${REASON}"
  if [[ ${RETURN} -eq 0 ]]; then
    log_f "${ACME_DNS_PROVIDER} manages the zone of ${DOMAIN} - using the DNS-01 challenge"
    echo "${DOMAIN}=1" >> "${ACME_DNS_MANAGED_CACHE}"
    return 0
  fi
  log_f "${ACME_DNS_PROVIDER} does not manage the zone of ${DOMAIN} - using the HTTP-01 challenge"
  echo "${DOMAIN}=0" >> "${ACME_DNS_MANAGED_CACHE}"
  return 1
}

# The challenge type used for a single domain: dns or http
# Usage: domain_challenge_type sub.example.com
domain_challenge_type(){
  case "${ACME_DNS_CHALLENGE}" in
    y)
      echo dns
      ;;
    auto)
      # the log of the first, uncached lookup must not end up in the answer
      if dns_zone_managed "${1}" 1>&2; then
        echo dns
      else
        echo http
      fi
      ;;
    *)
      echo http
      ;;
  esac
}

# acme.sh writes HTTP-01 tokens to <webroot>/.well-known/acme-challenge, while
# nginx serves that path from /var/www/acme, where acme-tiny writes them. The
# symlink lets both clients share the one challenge directory.
acme_prepare_webroot(){
  ACME_WEBROOT=${ACME_WEBROOT:-/var/www/acme-webroot}
  if [[ ! -d ${ACME_WEBROOT}/.well-known/acme-challenge ]]; then
    mkdir -p ${ACME_WEBROOT}/.well-known
    ln -sfn /var/www/acme ${ACME_WEBROOT}/.well-known/acme-challenge
  fi
}

check_domain(){
    DOMAIN=$1
    # log_reason remembers why a domain is dropped, so that the certificates
    # page can tell "no certificate" apart from "no certificate, because ..."
    ACME_SKIP_REASON=
    A_DOMAIN=$(dig A ${DOMAIN} +short | tail -n 1)
    AAAA_DOMAIN=$(dig AAAA ${DOMAIN} +short | tail -n 1)
    # Hard-fail on CAA errors for MAILCOW_HOSTNAME
    PARENT_DOMAIN=$(echo ${DOMAIN} | cut -d. -f2-)
    CAAS=( $(dig CAA ${PARENT_DOMAIN} +short | sed -n 's/\d issue "\(.*\)"/\1/p') )
    if [[ ! -z ${CAAS} ]]; then
      if [[ ${CAAS[@]} =~ "letsencrypt.org" ]]; then
        log_f "Validated CAA for parent domain ${PARENT_DOMAIN}"
      else
        log_reason "Lets Encrypt disallowed for ${PARENT_DOMAIN} by CAA record"
        acme_status_skip "${DOMAIN}" "${ACME_SKIP_REASON}"
        return 1
      fi
    fi

    if [[ ${ACME_DNS_CHALLENGE} == "y" ]]; then
      log_f "ACME_DNS_CHALLENGE=y - skipping IP and HTTP validation for ${DOMAIN}"
      return 0
    fi
    if [[ ${ACME_DNS_CHALLENGE} == "auto" ]]; then
      if dns_zone_managed "${DOMAIN}"; then
        log_f "${DOMAIN} is validated over DNS-01 - skipping IP and HTTP validation"
        return 0
      fi
      # A wildcard cannot be validated over HTTP-01, so without its zone at the
      # DNS provider there is nothing left to try
      if [[ ${DOMAIN} == \*.* ]]; then
        log_reason "Skipping wildcard ${DOMAIN}: it requires the DNS-01 challenge, but ${ACME_DNS_PROVIDER} does not manage its zone"
        acme_status_skip "${DOMAIN}" "${ACME_SKIP_REASON}"
        return 1
      fi
    fi
    # Check if CNAME without v6 enabled target
    if [[ ! -z ${AAAA_DOMAIN} ]] && [[ -z $(echo ${AAAA_DOMAIN} | grep "^\([0-9a-fA-F]\{0,4\}:\)\{1,7\}[0-9a-fA-F]\{0,4\}$") ]]; then
      AAAA_DOMAIN=
    fi
    if [[ ! -z ${AAAA_DOMAIN} ]]; then
      log_f "Found AAAA record for ${DOMAIN}: ${AAAA_DOMAIN} - skipping A record check"
      if [[ $(expand ${IPV6:-"0000:0000:0000:0000:0000:0000:0000:0000"}) == $(expand ${AAAA_DOMAIN}) ]] || [[ ${SKIP_IP_CHECK} == "y" ]] || [[ ${SNAT6_TO_SOURCE} != "n" ]]; then
        if verify_challenge_path "${DOMAIN}" 6; then
          log_f "Confirmed AAAA record with IP $(expand ${AAAA_DOMAIN})"
          return 0
        else
          log_reason "Confirmed AAAA record with IP $(expand ${AAAA_DOMAIN}), but HTTP validation failed"
        fi
      else
        log_reason "Cannot match your IP $(expand ${IPV6:-"0000:0000:0000:0000:0000:0000:0000:0000"}) against hostname ${DOMAIN} (DNS returned $(expand ${AAAA_DOMAIN}))"
      fi
    elif [[ ! -z ${A_DOMAIN} ]]; then
      log_f "Found A record for ${DOMAIN}: ${A_DOMAIN}"
      if [[ ${IPV4:-ERR} == ${A_DOMAIN} ]] || [[ ${SKIP_IP_CHECK} == "y" ]] || [[ ${SNAT_TO_SOURCE} != "n" ]]; then
        if verify_challenge_path "${DOMAIN}" 4; then
          log_f "Confirmed A record ${A_DOMAIN}"
          return 0
        else
          log_reason "Confirmed A record with IP ${A_DOMAIN}, but HTTP validation failed"
        fi
      else
        log_reason "Cannot match your IP ${IPV4} against hostname ${DOMAIN} (DNS returned ${A_DOMAIN})"
      fi
    else
      log_reason "No A or AAAA record found for hostname ${DOMAIN}"
    fi
    acme_status_skip "${DOMAIN}" "${ACME_SKIP_REASON}"
    return 1
}

verify_challenge_path(){
  if [[ ${SKIP_HTTP_VERIFICATION} == "y" ]]; then
    echo '(skipping check, returning 0)'
    return 0
  fi
  # verify_challenge_path URL 4|6
  RANDOM_N=${RANDOM}${RANDOM}${RANDOM}
  echo ${RANDOM_N} > /var/www/acme/${RANDOM_N}
  if [[ "$(curl --insecure -${2} -L http://${1}/.well-known/acme-challenge/${RANDOM_N} --silent)" == "${RANDOM_N}"  ]]; then
    rm /var/www/acme/${RANDOM_N}
    return 0
  else
    rm /var/www/acme/${RANDOM_N}
    return 1
  fi
}

# Check if a domain is covered by a wildcard (*.example.com) in ADDITIONAL_SAN
# Usage: is_covered_by_wildcard "subdomain.example.com"
# Returns: 0 if covered, 1 if not covered
# Note: Only returns 0 (covered) when DNS-01 challenge is enabled,
#       as wildcards cannot be validated with HTTP-01 challenge
is_covered_by_wildcard() {
  local DOMAIN=$1

  # Only skip if DNS challenge is enabled (wildcards require DNS-01)
  if [[ ${ACME_DNS_CHALLENGE} != "y" ]] && [[ ${ACME_DNS_CHALLENGE} != "auto" ]]; then
    return 1
  fi

  # Return early if no ADDITIONAL_SAN is set
  if [[ -z ${ADDITIONAL_SAN} ]]; then
    return 1
  fi

  # ADDITIONAL_SAN wildcards live in the mail server certificate, which is
  # not issued with ACME_MAIL_CERTS=n, so they cover nothing
  if [[ ${ACME_MAIL_CERTS} == "n" ]]; then
    return 1
  fi

  # Extract parent domain (e.g., mail.example.com -> example.com)
  local PARENT_DOMAIN=$(echo ${DOMAIN} | cut -d. -f2-)

  # Check if ADDITIONAL_SAN contains a wildcard for this parent domain
  if [[ "${ADDITIONAL_SAN}" == *"*.${PARENT_DOMAIN}"* ]]; then
    # In auto mode the wildcard only covers the domain when its zone is at the
    # DNS provider - otherwise the wildcard itself is dropped and the subdomain
    # needs its own HTTP-01 validated certificate
    if [[ ${ACME_DNS_CHALLENGE} == "auto" ]] && ! dns_zone_managed "${PARENT_DOMAIN}"; then
      return 1
    fi
    return 0  # Covered by wildcard
  fi

  return 1  # Not covered
}

# Failure notifications go to ACME_ACCOUNT_EMAIL through the internal Postfix,
# which relays for the mailcow network. A certificate that keeps failing is
# reported at most once per ACME_NOTIFY_THROTTLE seconds - acme.sh retries
# every 30 minutes - and once more when it renews again.
ACME_NOTIFY_THROTTLE=86400

acme_notify_enabled(){
  [[ ${ACME_NOTIFY_FAILURES} == "y" ]] || return 1
  [[ -n ${ACME_ACCOUNT_EMAIL} ]] && [[ ${ACME_ACCOUNT_EMAIL} != *@example.com ]]
}

acme_send_mail(){
  local SUBJECT="${1}"
  local BODY="${2}"
  local MSG
  MSG=$(mktemp /tmp/acme-notify.XXXXXX)
  {
    printf 'From: mailcow ACME <acme@%s>\n' "${MAILCOW_HOSTNAME}"
    printf 'To: <%s>\n' "${ACME_ACCOUNT_EMAIL}"
    printf 'Subject: %s\n' "${SUBJECT}"
    printf 'Date: %s\n' "$(date -R)"
    printf 'Message-ID: <acme.%s.%s@%s>\n' "$(date +%s)" "${RANDOM}${RANDOM}" "${MAILCOW_HOSTNAME}"
    printf 'MIME-Version: 1.0\n'
    printf 'Content-Type: text/plain; charset=UTF-8\n'
    printf 'Content-Transfer-Encoding: 8bit\n'
    printf 'Auto-Submitted: auto-generated\n'
    printf '\n%s\n' "${BODY}"
  } > "${MSG}"
  # --crlf turns the LF line endings into the CRLF that SMTP requires
  curl --silent --show-error --max-time 30 --crlf \
    --url "smtp://postfix:25/${MAILCOW_HOSTNAME}" \
    --mail-from "acme@${MAILCOW_HOSTNAME}" \
    --mail-rcpt "${ACME_ACCOUNT_EMAIL}" \
    --upload-file "${MSG}"
  local RC=$?
  rm -f "${MSG}"
  if [[ ${RC} -eq 0 ]]; then
    log_f "Sent notification to ${ACME_ACCOUNT_EMAIL}: ${SUBJECT}"
  else
    log_f "Could not send notification to ${ACME_ACCOUNT_EMAIL} (curl exit code ${RC})"
  fi
  return ${RC}
}

# Report the outcome of one obtain-certificate run.
# Usage: acme_notify_result CERT_NAME RETURN "DOMAINS"
# RETURN is the exit code of obtain-certificate.sh; its error output, if any,
# is read from /tmp/acme-error-CERT_NAME.
acme_notify_result(){
  local CERT_NAME="${1}"
  local RETURN="${2}"
  local DOMAINS="${3}"
  local ERROR_FILE="/tmp/acme-error-${CERT_NAME}"
  local FAILING_KEY="ACME_NOTIFY_FAILING_${CERT_NAME}"
  local THROTTLE_KEY="ACME_NOTIFY_THROTTLE_${CERT_NAME}"

  if ! acme_notify_enabled; then
    rm -f "${ERROR_FILE}"
    return 0
  fi

  case "${RETURN}" in
    0|1) # created or renewed
      if [[ "$(${REDIS_CMDLINE} DEL "${FAILING_KEY}")" == "1" ]]; then
        ${REDIS_CMDLINE} DEL "${THROTTLE_KEY}" > /dev/null
        acme_send_mail "[${MAILCOW_HOSTNAME}] Certificate ${CERT_NAME} renewed" \
"The certificate ${CERT_NAME} on ${MAILCOW_HOSTNAME} was renewed successfully after earlier failures.

Domains: ${DOMAINS}
Valid until: $(openssl x509 -enddate -noout -in "${ACME_BASE}/${CERT_NAME}/cert.pem" 2>/dev/null | cut -d= -f2)"
      fi
      ;;
    2) # not due for renewal
      ;;
    *)
      ${REDIS_CMDLINE} SET "${FAILING_KEY}" "$(date +%s)" NX > /dev/null
      if [[ "$(${REDIS_CMDLINE} SET "${THROTTLE_KEY}" 1 NX EX ${ACME_NOTIFY_THROTTLE})" == "OK" ]]; then
        local SINCE EXPIRY DETAIL OUTPUT
        SINCE=$(${REDIS_CMDLINE} GET "${FAILING_KEY}")
        EXPIRY=$(openssl x509 -enddate -noout -in "${ACME_BASE}/${CERT_NAME}/cert.pem" 2>/dev/null | cut -d= -f2)
        # acme-tiny prints the CA's reason as 'detail': '...'
        DETAIL=$(grep -o "'detail': '[^']*'" "${ERROR_FILE}" 2>/dev/null | head -n 1 | cut -d"'" -f4)
        OUTPUT=$(grep -v '^[[:space:]]*$' "${ERROR_FILE}" 2>/dev/null | tail -n 20)
        [[ -z ${DETAIL} ]] && DETAIL=$(printf '%s\n' "${OUTPUT}" | tail -n 1)
        if ! acme_send_mail "[${MAILCOW_HOSTNAME}] Certificate ${CERT_NAME} could not be renewed" \
"acme-mailcow on ${MAILCOW_HOSTNAME} could not obtain the certificate ${CERT_NAME}.

Domains: ${DOMAINS}
Current certificate expires: ${EXPIRY:-no certificate issued yet}
Failing since: $(date -d "@${SINCE:-$(date +%s)}")
Error: ${DETAIL:-unknown, see the acme-mailcow logs (exit code ${RETURN})}

acme-mailcow keeps retrying every 30 minutes. While it keeps failing, this
notice is repeated at most once every $((ACME_NOTIFY_THROTTLE / 3600)) hours, and you get another
e-mail once the certificate renews.

Last output of the ACME client:
${OUTPUT:-(none)}"; then
          # let the next attempt retry the notification
          ${REDIS_CMDLINE} DEL "${THROTTLE_KEY}" > /dev/null
        fi
      fi
      ;;
  esac
  rm -f "${ERROR_FILE}"
}

# ---------------------------------------------------------------------------
# Status record for the certificates page of the admin UI
#
# The page can read a certificate off the disk, but not why a domain was
# dropped before a request, nor which domain of a multi-domain certificate
# failed its challenge - only the client sees that. So every loop builds a
# record in ACME_STATUS_FILE and publishes the whole document to the Redis
# key ACME_STATUS, which is what the page reads.
# ---------------------------------------------------------------------------
ACME_STATUS_FILE=${ACME_STATUS_FILE:-/tmp/acme-status.json}

# Apply a jq filter to the record in place. A broken filter leaves the record
# untouched: a panel showing stale data beats one showing none.
acme_status_edit(){
  local TMP
  [[ -f ${ACME_STATUS_FILE} ]] || return 0
  TMP=$(mktemp /tmp/acme-status.XXXXXX)
  if jq "$@" "${ACME_STATUS_FILE}" > "${TMP}" 2>/dev/null; then
    mv -f "${TMP}" "${ACME_STATUS_FILE}"
  else
    rm -f "${TMP}"
    return 1
  fi
}

acme_status_reset(){
  jq -n --argjson started "$(date +%s)" \
    '{started: $started, finished: null, errors: null, config: {}, certificates: [], skipped: []}' \
    > "${ACME_STATUS_FILE}" 2>/dev/null
}

# The configuration the loop is running with, so that the page can explain a
# result instead of only reporting it
acme_status_config(){
  acme_status_edit \
    --arg hostname "${MAILCOW_HOSTNAME}" \
    --arg challenge "${ACME_DNS_CHALLENGE}" \
    --arg dns_provider "${ACME_DNS_PROVIDER}" \
    --arg profile "${ACME_PROFILE}" \
    --arg check_interval "${ACME_CHECK_INTERVAL}" \
    --arg additional_san "${ADDITIONAL_SAN}" \
    --arg mail_certs "${ACME_MAIL_CERTS}" \
    --arg autodiscover_san "${AUTODISCOVER_SAN:-n}" \
    --arg sni "${ENABLE_SSL_SNI:-n}" \
    --arg only_hostname "${ONLY_MAILCOW_HOSTNAME:-n}" \
    --arg staging "${LE_STAGING:-n}" \
    --arg directory_url "${DIRECTORY_URL}" \
    --arg skip_ip_check "${SKIP_IP_CHECK:-n}" \
    --arg skip_http_verification "${SKIP_HTTP_VERIFICATION:-n}" \
    --argjson renew_before "${ACME_RENEW_BEFORE:-0}" \
    '.config = {hostname: $hostname, challenge: $challenge, dns_provider: $dns_provider,
      profile: $profile, renew_before: $renew_before, check_interval: $check_interval,
      additional_san: $additional_san, mail_certs: $mail_certs,
      autodiscover_san: $autodiscover_san, sni: $sni, only_hostname: $only_hostname,
      staging: $staging, directory_url: $directory_url, skip_ip_check: $skip_ip_check,
      skip_http_verification: $skip_http_verification}'
}

# A domain that never made it into a certificate request, with the reason
# check_domain rejected it
acme_status_skip(){
  local DOMAIN="${1}"
  local REASON="${2}"
  [[ -z ${DOMAIN} ]] && return 0
  acme_status_edit --arg domain "${DOMAIN}" --arg reason "${REASON:-unknown}" \
    --argjson time "$(date +%s)" \
    '.skipped |= (map(select(.domain != $domain)) + [{domain: $domain, reason: $reason, time: $time}])'
}

# log_f, and remember the message as the reason a domain was skipped
log_reason(){
  ACME_SKIP_REASON="${1}"
  log_f "${1}"
}

# Per-domain failures, read out of the output of whichever client ran.
# Usage: acme_domain_errors <output file>
# Prints one "domain<TAB>reason" line per domain the CA or the DNS provider
# rejected. Neither client reports this in a machine readable form, so the
# strings each of them prints are matched here.
acme_domain_errors(){
  local FILE="${1}"
  [[ -f ${FILE} ]] || return 0
  awk '
    BEGIN { q = sprintf("%c", 39) }
    function emit(domain, reason) {
      sub(/^\*\./, "", domain)
      gsub(/^[ \t]+|[ \t]+$/, "", reason)
      gsub(/\t/, " ", reason)
      if (domain == "" || reason == "" || (domain in seen)) return
      seen[domain] = 1
      print domain "\t" reason
    }
    # The domain that follows an _acme-challenge. label on this line
    function challenge_domain(line) {
      if (!match(line, /_acme-challenge\.[A-Za-z0-9._-]+/)) return ""
      domain = substr(line, RSTART, RLENGTH)
      sub(/^_acme-challenge\./, "", domain)
      return domain
    }
    # acme.sh, one line per failed authorization:
    #   [date] example.com:Verify error:DNS problem: NXDOMAIN looking up TXT ...
    /:Verify error:/ {
      line = $0
      sub(/^\[[^]]*\][ \t]*/, "", line)
      split(line, part, ":Verify error:")
      if (part[1] != "" && part[1] !~ /[ \t]/) {
        emit(part[1], part[2])
        next
      }
    }
    # acme.sh, the DNS provider refused the challenge record
    /Error add txt for domain/ {
      emit(challenge_domain($0), "The DNS provider could not add the _acme-challenge TXT record for this domain")
      next
    }
    # acme.sh could not work out the zone of a domain at the provider
    /domain token entry/ {
      emit(challenge_domain($0), "The DNS provider does not hold the zone of this domain, so the challenge record cannot be written")
      next
    }
    # acme-tiny raises: Challenge did not pass for example.com: {... detail ...}
    /Challenge did not pass for/ {
      line = $0
      if (match(line, /Challenge did not pass for [A-Za-z0-9*._-]+/)) {
        domain = substr(line, RSTART, RLENGTH)
        sub(/^Challenge did not pass for[ \t]+/, "", domain)
        detail = ""
        if (match(line, "[" q "\"]detail[" q "\"]: *[" q "\"][^" q "\"]*")) {
          detail = substr(line, RSTART, RLENGTH)
          sub("^.*detail[" q "\"]: *[" q "\"]", "", detail)
        }
        emit(domain, detail != "" ? detail : "The CA did not accept the challenge")
        next
      }
    }
    # The CA names the rejected domain in the order error
    /Cannot issue for/ {
      line = $0
      if (match(line, "Cannot issue for \\\\?[" q "\"][A-Za-z0-9*._-]+")) {
        matched = substr(line, RSTART, RLENGTH)
        domain = matched
        sub("^Cannot issue for \\\\?[" q "\"]", "", domain)
        detail = line
        sub(/^.*Cannot issue for/, "Cannot issue for", detail)
        sub(/","status.*$/, "", detail)
        emit(domain, detail)
        next
      }
    }
  ' "${FILE}"
}

# What is wrong with a domain of a failed certificate that the client did not
# name. Checks the things that break an ACME challenge, in the order they
# break it, and prints the first problem found.
acme_diagnose_domain(){
  local DOMAIN="${1#\*.}"
  local WILDCARD="${1}"
  local PARENT CAAS TXT A_REC AAAA_REC
  local CHALLENGE
  CHALLENGE=$(domain_challenge_type "${1}" 2>/dev/null)

  PARENT=$(echo "${DOMAIN}" | cut -d. -f2-)
  CAAS=( $(dig CAA "${PARENT}" +short @unbound 2>/dev/null | sed -n 's/\d issue "\(.*\)"/\1/p') )
  if [[ ! -z ${CAAS} ]] && [[ ! ${CAAS[@]} =~ "letsencrypt.org" ]]; then
    echo "The CAA record of ${PARENT} does not allow Let's Encrypt to issue for this domain"
    return 0
  fi

  if [[ ${CHALLENGE} == "dns" ]]; then
    if ! dns_zone_managed "${DOMAIN}" 2>/dev/null; then
      echo "${ACME_DNS_PROVIDER} does not manage the zone of this domain, so no _acme-challenge TXT record can be written for it"
      return 0
    fi
    TXT=$(dig TXT "_acme-challenge.${DOMAIN}" +short @unbound 2>/dev/null)
    if [[ -z ${TXT} ]]; then
      echo "No _acme-challenge.${DOMAIN} TXT record is visible - the record was not written, or the zone is delegated elsewhere than the configured provider"
    else
      echo "A _acme-challenge.${DOMAIN} TXT record is visible (${TXT//$'\n'/ }) but the CA did not accept it - check for a stale record or a slow zone propagation"
    fi
    return 0
  fi

  if [[ ${WILDCARD} == \*.* ]]; then
    echo "A wildcard can only be validated over DNS-01, which this domain is not using"
    return 0
  fi
  A_REC=$(dig A "${DOMAIN}" +short @unbound 2>/dev/null | tail -n 1)
  AAAA_REC=$(dig AAAA "${DOMAIN}" +short @unbound 2>/dev/null | tail -n 1)
  if [[ -z ${A_REC} && -z ${AAAA_REC} ]]; then
    echo "No A or AAAA record, so the CA cannot reach this host for the HTTP-01 challenge"
    return 0
  fi
  if ! verify_challenge_path "${DOMAIN}" 4 > /dev/null 2>&1; then
    echo "http://${DOMAIN}/.well-known/acme-challenge/ does not serve what this server writes there - check the DNS record (${A_REC:-${AAAA_REC}}) and any proxy in front of port 80"
    return 0
  fi
  echo "The challenge path is reachable, so the failure is on the CA side - see the client output"
}

# Record the outcome of one obtain-certificate run.
# Usage: acme_status_cert CERT_NAME RETURN "DOMAINS"
# The child process leaves its output in /tmp/acme-output-CERT_NAME and the
# challenge it picked per domain in /tmp/acme-challenge-CERT_NAME.
acme_status_cert(){
  local CERT_NAME="${1}"
  local RETURN="${2}"
  local DOMAINS="${3}"
  local OUTPUT_FILE="/tmp/acme-output-${CERT_NAME}"
  local CHALLENGE_FILE="/tmp/acme-challenge-${CERT_NAME}"
  local SINCE_KEY="ACME_FAILING_SINCE_${CERT_NAME}"
  local STATE FAILING_SINCE OUTPUT DETAIL DOMAIN_ERRORS DOMAINS_JSON

  case "${RETURN}" in
    0) STATE=created ;;
    1) STATE=renewed ;;
    2) STATE=unchanged ;;
    *) STATE=failed ;;
  esac

  if [[ ${STATE} == "failed" ]]; then
    ${REDIS_CMDLINE} SET "${SINCE_KEY}" "$(date +%s)" NX > /dev/null
    FAILING_SINCE=$(${REDIS_CMDLINE} GET "${SINCE_KEY}")
  else
    ${REDIS_CMDLINE} DEL "${SINCE_KEY}" > /dev/null
  fi

  # A certificate that was not due never ran a client, so whatever output is
  # left in /tmp belongs to an earlier run and says nothing about this one
  if [[ ${STATE} != "unchanged" ]]; then
    # The last 200 lines are enough to explain a failure and keep the record small
    OUTPUT=$(grep -v '^[[:space:]]*$' "${OUTPUT_FILE}" 2>/dev/null | tail -n 200)
    # acme-tiny prints the reason of the CA as 'detail': '...'
    DETAIL=$(grep -o "'detail': '[^']*'" "${OUTPUT_FILE}" 2>/dev/null | head -n 1 | cut -d"'" -f4)
    [[ -z ${DETAIL} ]] && DETAIL=$(grep -o '"detail": *"[^"]*"' "${OUTPUT_FILE}" 2>/dev/null | head -n 1 | cut -d'"' -f4)
    DOMAIN_ERRORS=$(acme_domain_errors "${OUTPUT_FILE}")
    # A failure the CA did not put in a detail field: the first domain that
    # failed explains it better than the last line of the output
    if [[ -z ${DETAIL} ]] && [[ ${STATE} == "failed" ]]; then
      DETAIL=$(printf '%s\n' "${DOMAIN_ERRORS}" | awk -F'\t' 'NF > 1 { print $1 ": " $2; exit }')
      [[ -z ${DETAIL} ]] && DETAIL=$(printf '%s\n' "${OUTPUT}" | tail -n 1)
    fi
  fi

  # Build the per-domain rows: the challenge used, the error the client
  # reported for it and, where it reported none, what is wrong with the domain
  DOMAINS_JSON=$(
    for DOMAIN in ${DOMAINS}; do
      local CHALLENGE ERROR DIAGNOSIS
      CHALLENGE=$(awk -F= -v d="${DOMAIN}" '$1 == d { print $2 }' "${CHALLENGE_FILE}" 2>/dev/null | tail -n 1)
      ERROR=$(printf '%s\n' "${DOMAIN_ERRORS}" | awk -F'\t' -v d="${DOMAIN}" '$1 == d { print $2 }' | head -n 1)
      DIAGNOSIS=
      if [[ ${STATE} == "failed" ]] && [[ -z ${ERROR} ]]; then
        DIAGNOSIS=$(acme_diagnose_domain "${DOMAIN}" 2>/dev/null)
      fi
      jq -n --arg domain "${DOMAIN}" --arg challenge "${CHALLENGE}" \
        --arg error "${ERROR}" --arg diagnosis "${DIAGNOSIS}" \
        '{domain: $domain, challenge: (if $challenge == "" then null else $challenge end),
          error: (if $error == "" then null else $error end),
          diagnosis: (if $diagnosis == "" then null else $diagnosis end)}'
    done | jq -s '.'
  )
  [[ -z ${DOMAINS_JSON} ]] && DOMAINS_JSON='[]'

  if [[ ${STATE} == "failed" ]]; then
    log_f "Certificate ${CERT_NAME} failed; per-domain reasons recorded for the certificates page"
    printf '%s\n' "${DOMAIN_ERRORS}" | while IFS=$'\t' read -r D R; do
      [[ -n ${D} ]] && log_f "  ${D}: ${R}"
    done
  fi

  acme_status_edit \
    --arg name "${CERT_NAME}" \
    --arg state "${STATE}" \
    --arg error "${DETAIL}" \
    --arg output "${OUTPUT}" \
    --argjson return "${RETURN:-0}" \
    --argjson time "$(date +%s)" \
    --argjson failing_since "${FAILING_SINCE:-null}" \
    --argjson domains "${DOMAINS_JSON}" \
    '.certificates |= (map(select(.name != $name)) + [{name: $name, state: $state,
      return: $return, time: $time, failing_since: $failing_since,
      error: (if $error == "" then null else $error end),
      output: (if $output == "" then null else $output end),
      domains: $domains}])'
}

# Close the record of this loop and publish it for the certificates page
acme_status_publish(){
  acme_status_edit --argjson finished "$(date +%s)" --argjson errors "${1:-0}" \
    '.finished = $finished | .errors = $errors'
  ${REDIS_CMDLINE} SET ACME_STATUS "$(cat "${ACME_STATUS_FILE}" 2>/dev/null)" > /dev/null
}

# A renewal the admin asked for on the certificates page. The page sets the
# key and restarts this container, which lands here on the next start.
acme_check_force_renew(){
  if [[ "$(${REDIS_CMDLINE} GET ACME_FORCE_RENEW)" == "1" ]]; then
    log_f "A renewal of every certificate was requested from the certificates page"
    touch "${ACME_BASE}/force_renew"
    ${REDIS_CMDLINE} DEL ACME_FORCE_RENEW > /dev/null
  fi
}
