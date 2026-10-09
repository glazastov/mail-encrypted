#!/bin/bash

# Reading container IDs
# Wrapping as array to ensure trimmed content when calling $NGINX etc.
NGINX=($(curl --silent --insecure https://dockerapi.${COMPOSE_PROJECT_NAME}_mailcow-network/containers/json | jq -r ".[] | {name: .Config.Labels[\"com.docker.compose.service\"], project: .Config.Labels[\"com.docker.compose.project\"], id: .Id}" | jq -rc "select( .name | tostring | contains(\"nginx-mailcow\")) | select( .project | tostring | contains(\"${COMPOSE_PROJECT_NAME,,}\")) | .id" | tr "\n" " "))
DOVECOT=($(curl --silent --insecure https://dockerapi.${COMPOSE_PROJECT_NAME}_mailcow-network/containers/json | jq -r ".[] | {name: .Config.Labels[\"com.docker.compose.service\"], project: .Config.Labels[\"com.docker.compose.project\"], id: .Id}" | jq -rc "select( .name | tostring | contains(\"dovecot-mailcow\")) | select( .project | tostring | contains(\"${COMPOSE_PROJECT_NAME,,}\")) | .id" | tr "\n" " "))
POSTFIX=($(curl --silent --insecure https://dockerapi.${COMPOSE_PROJECT_NAME}_mailcow-network/containers/json | jq -r ".[] | {name: .Config.Labels[\"com.docker.compose.service\"], project: .Config.Labels[\"com.docker.compose.project\"], id: .Id}" | jq -rc "select( .name | tostring | contains(\"postfix-mailcow\")) | select( .project | tostring | contains(\"${COMPOSE_PROJECT_NAME,,}\")) | .id" | tr "\n" " "))

reload_nginx(){
  echo "Reloading Nginx..."
  NGINX_RELOAD_RET=$(curl -X POST --insecure https://dockerapi.${COMPOSE_PROJECT_NAME}_mailcow-network/containers/${NGINX}/exec -d '{"cmd":"reload", "task":"nginx"}' --silent -H 'Content-type: application/json' | jq -r .type)
  [[ ${NGINX_RELOAD_RET} != 'success' ]] && { echo "Could not reload Nginx, restarting container..."; restart_container ${NGINX} ; }
}

reload_dovecot(){
  echo "Reloading Dovecot..."
  DOVECOT_RELOAD_RET=$(curl -X POST --insecure https://dockerapi.${COMPOSE_PROJECT_NAME}_mailcow-network/containers/${DOVECOT}/exec -d '{"cmd":"reload", "task":"dovecot"}' --silent -H 'Content-type: application/json' | jq -r .type)
  [[ ${DOVECOT_RELOAD_RET} != 'success' ]] && { echo "Could not reload Dovecot, restarting container..."; restart_container ${DOVECOT} ; }
}

reload_postfix(){
  echo "Reloading Postfix..."
  POSTFIX_RELOAD_RET=$(curl -X POST --insecure https://dockerapi.${COMPOSE_PROJECT_NAME}_mailcow-network/containers/${POSTFIX}/exec -d '{"cmd":"reload", "task":"postfix"}' --silent -H 'Content-type: application/json' | jq -r .type)
  [[ ${POSTFIX_RELOAD_RET} != 'success' ]] && { echo "Could not reload Postfix, restarting container..."; restart_container ${POSTFIX} ; }
}

restart_container(){
  if [[ -z "$*" ]]; then
    # An empty id means the dockerapi lookup above came back empty, and the
    # loop below would quietly restart nothing at all
    echo "No container id to restart - dockerapi returned nothing for ${COMPOSE_PROJECT_NAME}" >&2
    return 1
  fi
  for container in $*; do
    echo "Restarting ${container}..."
    C_REST_OUT=$(curl -X POST --insecure https://dockerapi.${COMPOSE_PROJECT_NAME}_mailcow-network/containers/${container}/restart --silent | jq -r '.msg')
    echo "${C_REST_OUT}"
  done
}

# Which services to act on and how hard, so that a single name served from the
# wrong certificate does not cost a restart of the whole mail stack. The
# caller names the services that verify-served-certificates.sh found at fault
# and starts at the cheapest level that can fix them:
#
#   1  regenerate the SNI data and reload - both reload tasks rebuild
#      sni.map.db and sni.conf from the PEM files on disk first, which is what
#      puts a service back on the current certificate
#   2  restart the container, for when a reload leaves it on the old one
#
# Defaults reproduce the previous unconditional behaviour, so a renewal still
# restarts Postfix and Dovecot without the caller asking for anything.
REPAIR_TARGETS=${REPAIR_TARGETS:-nginx dovecot postfix}
REPAIR_LEVEL=${REPAIR_LEVEL:-2}

repair_service(){
  local SERVICE="${1}"
  case "${SERVICE}" in
    nginx)
      # Nginx never holds a snapshot of its own, a reload is always enough
      # unless the set of certificates changed
      if [[ "${CERT_AMOUNT_CHANGED}" == "1" ]] || [[ ${REPAIR_LEVEL} -ge 2 ]]; then
        restart_container ${NGINX}
      else
        reload_nginx
      fi
      ;;
    dovecot)
      if [[ ${REPAIR_LEVEL} -ge 2 ]]; then
        restart_container ${DOVECOT}
      else
        reload_dovecot
      fi
      ;;
    postfix)
      if [[ ${REPAIR_LEVEL} -ge 2 ]]; then
        restart_container ${POSTFIX}
      else
        reload_postfix
      fi
      ;;
    *)
      echo "Unknown service to repair: ${SERVICE}" >&2
      return 1
      ;;
  esac
}

RET=0
for SERVICE in ${REPAIR_TARGETS}; do
  repair_service "${SERVICE}" || RET=1
done
exit ${RET}
