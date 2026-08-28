#!/usr/bin/env bash

set -euo pipefail

MAILCOW_DIR="/opt/mailcow-dockerized"
DNS_CONF="${MAILCOW_DIR}/data/conf/acme/dns-01.conf"

CERT_FILE="${MAILCOW_DIR}/data/assets/ssl/cert.pem"
KEY_FILE="${MAILCOW_DIR}/data/assets/ssl/key.pem"

SNI_DIR="${MAILCOW_DIR}/data/assets/ssl/srv01.abdalamail.com"
SNI_CERT_FILE="${SNI_DIR}/cert.pem"
SNI_KEY_FILE="${SNI_DIR}/key.pem"

RENEW_BEFORE_DAYS=3
RENEW_BEFORE_SECONDS=$((RENEW_BEFORE_DAYS * 86400))

if [[ "${EUID}" -ne 0 ]]; then
	echo "Este script precisa ser executado como root."
	exit 1
fi

if [[ ! -d "${MAILCOW_DIR}" ]]; then
	echo "Diretorio do Mailcow nao encontrado: ${MAILCOW_DIR}"
	exit 1
fi

if [[ ! -f "${DNS_CONF}" ]]; then
	echo "Arquivo de credenciais nao encontrado: ${DNS_CONF}"
	exit 1
fi

set -a
source "${DNS_CONF}"
set +a

if [[ -z "${CF_Token:-}" ]]; then
	echo "CF_Token nao encontrado em ${DNS_CONF}"
	exit 1
fi

if [[ -z "${CF_Account_ID:-}" ]]; then
	echo "CF_Account_ID nao encontrado em ${DNS_CONF}"
	exit 1
fi

cd "${MAILCOW_DIR}"

if ! docker compose ps --status running acme-mailcow --format '{{.Service}}' | grep -qx 'acme-mailcow'; then
	echo "O container acme-mailcow nao esta em execucao."
	exit 1
fi

OLD_CERT_HASH=""

if [[ -f "${CERT_FILE}" ]]; then
	OLD_CERT_HASH="$(sha256sum "${CERT_FILE}" | awk '{print $1}')"
fi

docker compose exec \
	-T \
	-e CF_Token="${CF_Token}" \
	-e CF_Account_ID="${CF_Account_ID}" \
	acme-mailcow \
	sh -s <<EOF
set -eu

ACME_HOME="/var/lib/acme/server-dns-acme-shortlived"
DOMAIN="abdalamail.com"
CERT_STATE="\${ACME_HOME}/\${DOMAIN}_ecc/\${DOMAIN}.cer"
RENEW_BEFORE_SECONDS="${RENEW_BEFORE_SECONDS}"

mkdir -p "\${ACME_HOME}"

NEED_RENEW=1

if [ -f "\${CERT_STATE}" ]; then
	if openssl x509 -checkend "\${RENEW_BEFORE_SECONDS}" -noout -in "\${CERT_STATE}" >/dev/null 2>&1; then
		NEED_RENEW=0
	fi
fi

if [ "\${NEED_RENEW}" -eq 1 ]; then
	echo "Emitindo certificado short-lived DNS-01 para abdalamail.com e abdala.io..."

	/opt/acme.sh/acme.sh \
		--home "\${ACME_HOME}" \
		--config-home "\${ACME_HOME}" \
		--cert-home "\${ACME_HOME}" \
		--server letsencrypt \
		--issue \
		--dns dns_cf \
		--certificate-profile shortlived \
		--days 3 \
		--keylength ec-256 \
		--force \
		-d "abdalamail.com" \
		-d "*.abdalamail.com" \
		-d "abdala.io" \
		-d "*.abdala.io"

	/opt/acme.sh/acme.sh \
		--home "\${ACME_HOME}" \
		--config-home "\${ACME_HOME}" \
		--cert-home "\${ACME_HOME}" \
		--install-cert \
		--ecc \
		-d "abdalamail.com" \
		--key-file "/var/lib/acme/key.pem" \
		--fullchain-file "/var/lib/acme/cert.pem"

	chmod 600 /var/lib/acme/key.pem
	chmod 644 /var/lib/acme/cert.pem
else
	echo "Certificado short-lived ainda e valido por mais de ${RENEW_BEFORE_DAYS} dias."
fi
EOF

NEW_CERT_HASH=""

if [[ -f "${CERT_FILE}" ]]; then
	NEW_CERT_HASH="$(sha256sum "${CERT_FILE}" | awk '{print $1}')"
fi

if [[ -z "${NEW_CERT_HASH}" ]]; then
	echo "Erro: certificado final nao encontrado em ${CERT_FILE}"
	exit 1
fi

if [[ "${OLD_CERT_HASH}" != "${NEW_CERT_HASH}" ]]; then
	echo "Certificado alterado. Atualizando certificado SNI de srv01.abdalamail.com..."

	mkdir -p "${SNI_DIR}"

	cp -f "${CERT_FILE}" "${SNI_CERT_FILE}"
	cp -f "${KEY_FILE}" "${SNI_KEY_FILE}"

	chmod 644 "${SNI_CERT_FILE}"
	chmod 600 "${SNI_KEY_FILE}"

	echo "Reiniciando servicos do Mailcow..."

	docker compose restart postfix-mailcow dovecot-mailcow nginx-mailcow

	echo "Novo certificado principal instalado:"

	openssl x509 \
		-in "${CERT_FILE}" \
		-noout \
		-subject \
		-issuer \
		-startdate \
		-enddate

	echo "SANs do certificado principal:"

	openssl x509 \
		-in "${CERT_FILE}" \
		-noout \
		-ext subjectAltName

	echo "Certificado SNI de srv01.abdalamail.com:"

	openssl x509 \
		-in "${SNI_CERT_FILE}" \
		-noout \
		-subject \
		-issuer \
		-startdate \
		-enddate \
		-ext subjectAltName

	echo "Verificando certificado servido pelo SMTP..."

	SMTP_TMP="$(mktemp)"

	cleanup_smtp_tmp() {
		rm -f "${SMTP_TMP}"
	}

	trap cleanup_smtp_tmp EXIT

	SMTP_READY=0

	for attempt in $(seq 1 30); do
		: >"${SMTP_TMP}"

		if timeout 10 openssl s_client \
			-starttls smtp \
			-connect 127.0.0.1:587 \
			-servername srv01.abdalamail.com \
			-showcerts \
			</dev/null \
			>"${SMTP_TMP}" 2>&1; then

			if grep -q '-----BEGIN CERTIFICATE-----' "${SMTP_TMP}"; then
				SMTP_READY=1
				break
			fi
		fi

		echo "Postfix ainda nao apresentou certificado TLS. Tentativa ${attempt}/30..."
		sleep 1
	done

	if [[ "${SMTP_READY}" -ne 1 ]]; then
		echo "Erro: Postfix nao apresentou certificado TLS apos o restart."
		cat "${SMTP_TMP}"
		exit 1
	fi

	SMTP_CERT_TMP="$(mktemp)"

	cleanup_smtp_files() {
		rm -f "${SMTP_TMP}" "${SMTP_CERT_TMP}"
	}

	trap cleanup_smtp_files EXIT

	awk '
	/-----BEGIN CERTIFICATE-----/ {
		cert = 1
	}
	cert {
		print
	}
	/-----END CERTIFICATE-----/ {
		exit
	}
	' "${SMTP_TMP}" >"${SMTP_CERT_TMP}"

	if ! openssl x509 \
		-in "${SMTP_CERT_TMP}" \
		-noout \
		-subject \
		-issuer \
		-startdate \
		-enddate \
		-ext subjectAltName; then
		echo "Erro: certificado apresentado pelo Postfix nao pode ser validado."
		cat "${SMTP_TMP}"
		exit 1
	fi

	LOCAL_CERT_FINGERPRINT="$(
		openssl x509 \
			-in "${CERT_FILE}" \
			-noout \
			-fingerprint \
			-sha256 |
		cut -d= -f2
	)"

	SMTP_CERT_FINGERPRINT="$(
		openssl x509 \
			-in "${SMTP_CERT_TMP}" \
			-noout \
			-fingerprint \
			-sha256 |
		cut -d= -f2
	)"

	if [[ "${LOCAL_CERT_FINGERPRINT}" != "${SMTP_CERT_FINGERPRINT}" ]]; then
		echo "Erro: o certificado apresentado pelo Postfix e diferente do certificado instalado."
		echo "Fingerprint instalado: ${LOCAL_CERT_FINGERPRINT}"
		echo "Fingerprint apresentado: ${SMTP_CERT_FINGERPRINT}"
		exit 1
	fi

	echo "Certificado apresentado pelo SMTP corresponde ao certificado instalado."

	rm -f "${SMTP_TMP}" "${SMTP_CERT_TMP}"
	trap - EXIT

	echo "Renovacao concluida."
else
	echo "Certificado nao foi alterado."

	if [[ ! -f "${SNI_CERT_FILE}" ]] || [[ ! -f "${SNI_KEY_FILE}" ]]; then
		echo "Certificado SNI ausente. Sincronizando..."

		mkdir -p "${SNI_DIR}"

		cp -f "${CERT_FILE}" "${SNI_CERT_FILE}"
		cp -f "${KEY_FILE}" "${SNI_KEY_FILE}"

		chmod 644 "${SNI_CERT_FILE}"
		chmod 600 "${SNI_KEY_FILE}"

		docker compose restart postfix-mailcow dovecot-mailcow nginx-mailcow
	else
		MAIN_HASH="$(sha256sum "${CERT_FILE}" | awk '{print $1}')"
		SNI_HASH="$(sha256sum "${SNI_CERT_FILE}" | awk '{print $1}')"

		if [[ "${MAIN_HASH}" != "${SNI_HASH}" ]]; then
			echo "Certificado SNI esta diferente do principal. Sincronizando..."

			cp -f "${CERT_FILE}" "${SNI_CERT_FILE}"
			cp -f "${KEY_FILE}" "${SNI_KEY_FILE}"

			chmod 644 "${SNI_CERT_FILE}"
			chmod 600 "${SNI_KEY_FILE}"

			docker compose restart postfix-mailcow dovecot-mailcow nginx-mailcow
		else
			echo "Certificado principal e SNI ja estao sincronizados."
		fi
	fi
fi