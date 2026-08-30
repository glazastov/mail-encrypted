# PGP decryption in SOGo

SOGo has no OpenPGP support: it handles S/MIME only, so the messages the storage
filter encrypts on delivery reach the webmail as an unreadable `encrypted.asc`
attachment. These scripts decrypt them **in the browser**, so the server keeps
holding nothing but the mailbox's public key.

## How it fits together

| File | Role |
|---|---|
| `openpgp.min.js` | OpenPGP.js 6.3.1, vendored (LGPL-3.0+). Defines the `openpgp` global. |
| `postal-mime.min.js` | postal-mime 3.0.0, bundled to IIFE (MIT-0). Defines `MailcowPostalMime`. |
| `mailcow-pgp-core.js` | Armor extraction, key unlocking, decryption and MIME parsing. No DOM access, so it is unit tested outside the browser. |
| `mailcow-pgp.js` | SOGo integration: key dialog, message detection and the reading overlay. |

They are registered in `data/conf/sogo/sogo.conf` under
`SOGoUIAdditionalJSFiles` and bind mounted into the container's
`WebServerResources/js/pgp/` by `docker-compose.yml`. Nothing in the SOGo source
tree is patched, so a SOGo upgrade does not have to be re-patched.

The reading path is:

1. The route in `window.location.hash` identifies the open message.
2. `<UserFolderURL>/Mail/<account>/<folder>/<uid>/viewsource` returns the raw
   RFC822 message. SOGo HTML-escapes that response, which the core reverses.
3. The `-----BEGIN PGP MESSAGE-----` block is decrypted with the key the user
   unlocked, and the resulting MIME is parsed for its body and attachments.
4. The body is rendered inside a `sandbox=""` iframe with a CSP that permits
   only inline styles and `data:` images, so remote trackers do not load and no
   script in a message can run.

## Where the private key lives

In the browser, never on the server. The unlocked key exists only in a variable
for the lifetime of the page. "Keep this key in this browser" additionally
writes the armored key to `localStorage` for that origin; this is off by
default, because anyone with access to the browser profile — or any XSS in the
webmail — can then read it. The passphrase is never stored.

## Updating the vendored libraries

```
cd helper-scripts/dev_tests/pgp-webmail
bun update openpgp postal-mime
cp node_modules/openpgp/dist/openpgp.min.js ../../../data/conf/sogo/pgp/openpgp.min.js
bun build ./vendor-entry.js --format=iife --minify \
  --outfile=../../../data/conf/sogo/pgp/postal-mime.min.js
bun test
```

Drop the trailing `//# sourceMappingURL=` line from `openpgp.min.js`: the map is
not shipped and the browser would request it for nothing.

## Tests

`helper-scripts/dev_tests/pgp-webmail` covers the core against messages built by
`data/conf/dovecot/sieve-pipe-bin/mailcow-pgp-storage-encrypt` itself, so the
tests fail if the stored format ever drifts from what the browser expects.

```
cd helper-scripts/dev_tests/pgp-webmail && bun install && bun test
```

The browser integration in `mailcow-pgp.js` is not covered by those tests; it
needs a running SOGo.
