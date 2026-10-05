#!/bin/bash

# Ask the configured DNS provider's API whether it manages the zone a domain
# belongs to. Every acme.sh DNS API script resolves the zone of a name through
# the provider API in _get_root, which is exactly that question.
#
# Usage: dns-zone-check.sh example.com
# Exit code: 0 = the provider manages the zone, 1 = it does not
# A reason worth logging is printed, nothing is printed on a plain answer.
#
# acme.sh and the provider script are sourced in this process of their own, so
# their functions and variables stay out of the other ACME scripts.

DOMAIN="${1#\*.}"
if [[ -z ${DOMAIN} ]]; then
  echo "dns-zone-check.sh needs a domain"
  exit 1
fi

ACME_SH_BIN_PATH=${ACME_SH_BIN:-/opt/acme.sh/acme.sh}
ACME_SH_HOME_PATH=${ACME_SH_HOME:-/opt/acme.sh}
ACME_SH_WORK_HOME=${ACME_SH_CONFIG_HOME:-/var/lib/acme/acme-sh}

if [[ -z ${ACME_DNS_PROVIDER} ]] || [[ ${ACME_DNS_PROVIDER} == "dns_xxx" ]]; then
  echo "No ACME_DNS_PROVIDER configured - cannot ask a DNS API about ${DOMAIN}"
  exit 1
fi

DNS_API_SCRIPT="${ACME_SH_HOME_PATH}/dnsapi/${ACME_DNS_PROVIDER}.sh"
if [[ ! -f ${DNS_API_SCRIPT} ]]; then
  echo "acme.sh has no DNS API script for ${ACME_DNS_PROVIDER}"
  exit 1
fi

# The provider credentials live in /etc/acme/dns-01.conf and in the environment
source /srv/load-dns-config.sh > /dev/null 2>&1

export LE_WORKING_DIR="${ACME_SH_HOME_PATH}"
export LE_CONFIG_HOME="${ACME_SH_WORK_HOME}"

# Sourcing acme.sh without arguments only defines its functions - its main()
# prints the usage and returns
source "${ACME_SH_BIN_PATH}" > /dev/null 2>&1
source "${DNS_API_SCRIPT}" > /dev/null 2>&1

if ! declare -F _get_root > /dev/null; then
  echo "${ACME_DNS_PROVIDER} cannot be asked which zones it manages - assuming it manages ${DOMAIN}, set ACME_DNS_CHALLENGE=y or n to decide yourself"
  exit 0
fi

_initpath > /dev/null 2>&1
if _get_root "_acme-challenge.${DOMAIN}" > /dev/null 2>&1; then
  exit 0
fi
exit 1
