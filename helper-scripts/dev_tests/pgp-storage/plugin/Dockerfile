# Built from the repository root by run.sh, so the plugin source is in context.
FROM alpine:3.21
RUN apk add --no-cache dovecot dovecot-dev dovecot-lmtpd gcc musl-dev openssl python3 \
 && addgroup -g 5000 vmail && adduser -D -u 5000 -G vmail vmail \
 && mkdir -p /var/vmail && chown vmail:vmail /var/vmail \
 && openssl ecparam -name prime256v1 -genkey | openssl pkey -out /etc/dovecot/ecprivkey.pem \
 && openssl pkey -in /etc/dovecot/ecprivkey.pem -pubout -out /etc/dovecot/ecpubkey.pem
COPY data/Dockerfiles/dovecot/pgp-storage-plugin/mail-pgp-storage-plugin.c /tmp/plugin.c
# the same flags as data/Dockerfiles/dovecot/Dockerfile
RUN gcc -std=gnu11 -fPIC -shared -Wall -Wextra -Werror -O2 \
     -I/usr/include/dovecot -DHAVE_CONFIG_H \
     -o /usr/lib/dovecot/lib96_mail_pgp_storage_plugin.so /tmp/plugin.c
COPY helper-scripts/dev_tests/pgp-storage/plugin/dovecot.conf /etc/dovecot/dovecot.conf
COPY helper-scripts/dev_tests/pgp-storage/plugin/users /etc/dovecot/users
COPY --chmod=755 helper-scripts/dev_tests/pgp-storage/plugin/fake-encrypt /usr/local/bin/fake-encrypt
COPY helper-scripts/dev_tests/pgp-storage/plugin/test_append.py /test_append.py
CMD ["sh", "-c", "dovecot && sleep 1 && python3 /test_append.py; rc=$?; grep -i 'fatal\\|panic' /var/log/dovecot.log && rc=1; exit $rc"]
