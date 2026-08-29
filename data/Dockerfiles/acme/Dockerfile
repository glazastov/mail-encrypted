FROM alpine:3.23

LABEL maintainer = "The Infrastructure Company GmbH <info@servercow.de>"

RUN apk upgrade --no-cache \
  && apk add --update --no-cache \
  bash \
  curl \
  openssl \
  bind-tools \
  jq \
  mariadb-client \
  redis \
  tini \
  tzdata \
  python3 \
  acme-tiny \
  git \
  socat \
  && git clone --depth 1 https://github.com/acmesh-official/acme.sh.git /opt/acme.sh \
  && chmod +x /opt/acme.sh/acme.sh \
  && mkdir -p /var/lib/acme/acme-sh

ENV ACME_SH_BIN=/opt/acme.sh/acme.sh \
    ACME_SH_HOME=/opt/acme.sh \
    ACME_SH_CONFIG_HOME=/var/lib/acme/acme-sh

COPY patch-acme-tiny.py /srv/patch-acme-tiny.py
RUN python3 /srv/patch-acme-tiny.py \
      "$(python3 -c 'import acme_tiny, inspect; print(inspect.getsourcefile(acme_tiny))')" \
  && python3 -c 'import acme_tiny'

COPY acme.sh /srv/acme.sh
COPY functions.sh /srv/functions.sh
COPY obtain-certificate.sh /srv/obtain-certificate.sh
COPY obtain-certificate-dns.sh /srv/obtain-certificate-dns.sh
COPY load-dns-config.sh /srv/load-dns-config.sh
COPY reload-configurations.sh /srv/reload-configurations.sh
COPY expand6.sh /srv/expand6.sh

RUN chmod +x /srv/*.sh

CMD ["/sbin/tini", "-g", "--", "/srv/acme.sh"]
