# PGP decryption in SOGo

SOGo has no OpenPGP support: it handles S/MIME only, so the messages the storage
filter encrypts on delivery reach the webmail as an unreadable `encrypted.asc`
attachment. These scripts decrypt them **in the browser**, so the server keeps
holding nothing but the mailbox's public key.

## How it fits together

| File | Role |
|---|---|
| `mailcow-openpgp.min.js` | OpenPGP.js 6.3.1, vendored (LGPL-3.0+). Defines the `openpgp` global. |
| `mailcow-postal-mime.min.js` | postal-mime 3.0.0, bundled to IIFE (MIT-0). Defines `MailcowPostalMime`. |
| `mailcow-pgp-vault.js` | Seals the private key with AES-256-GCM under a PBKDF2-SHA256 key (600k iterations). |
| `mailcow-pgp-core.js` | Armor extraction, key unlocking, decryption and MIME parsing. No DOM access, so it is unit tested outside the browser. |
| `mailcow-pgp.js` | SOGo integration: the preferences panels, message detection and in-place rendering. |

They are registered in `data/conf/sogo/sogo.conf` under
`SOGoUIAdditionalJSFiles` and bind mounted into the container's
`WebServerResources/js/` by `docker-compose.yml`. Nothing in the SOGo source
tree is patched, so a SOGo upgrade does not have to be re-patched.

The reading path is:

1. The route in `window.location.hash` identifies the open message.
2. `<UserFolderURL>/Mail/<account>/<folder>/<uid>/viewsource` returns the raw
   RFC822 message. SOGo HTML-escapes that response, which the core reverses.
3. The `-----BEGIN PGP MESSAGE-----` block is decrypted with the key the user
   unlocked, and the resulting MIME is parsed for its body and attachments.
4. The body replaces SOGo's own `div.msg-body` content, inside a `sandbox=""`
   iframe with a CSP that permits only inline styles and `data:` images, so
   remote trackers do not load and no script in a message can run. A banner
   above it reports the signature.

## What the banner says

The storage filter stamps `X-Mailcow-PGP-Storage: encrypted` on the mail it
encrypts itself, and passes mail that arrived already encrypted through
untouched. That single header tells the two cases apart, and the banner says
which one it is: mail encrypted only at rest reached the server in the clear,
which is a materially weaker guarantee than mail the sender encrypted
end to end. Both are reported, never conflated.

When the mailbox has subject encryption on, the stored subject is the filter's
`[...]` marker and the real one travels inside the payload. Once decrypted it
is written back into SOGo's own message model, so the header - and the list row
sharing that model - show the real subject instead of the marker. A subject
that is not the marker is never overwritten.

## Signatures and contact keys

Contact public keys are added in the same preferences page and kept as plain
JSON in `localStorage` - they are public, so nothing is gained by sealing them,
and a pasted *private* key is refused outright rather than stored there.

When a signature carries a key id nobody in the contact list matches, the
message itself is searched for the sender's key - an `application/pgp-keys`
attachment or an `Autocrypt` header - and if one is found it is offered for
adding to contacts with one click.

The banner distinguishes four outcomes: a good signature from a known contact,
a signature that does not match, a signature with no matching contact key, and
a message that carries no signature at all. Only the first is shown as valid.

## Where the private key lives

In the browser, never on the server, and never in the clear. The key is pasted
or uploaded once in **SOGo preferences**, where it is sealed with AES-256-GCM
under a key derived from a vault password with PBKDF2-SHA256 over 600000
iterations; only that envelope reaches `localStorage`. Opening a message asks
for the vault password, and the unlocked key then lives in a page variable
until the tab is closed. The vault password itself is never stored.

An envelope that claims weaker parameters than the current minimum is refused
rather than opened, so a downgraded envelope cannot be forced through.

Logging out clears everything: the sealed key and the contact list are each
overwritten with random data of at least their own length, three times, before
being removed, and the unlocked key is dropped from memory. This overwrites the
stored *values*; it cannot promise anything about what the browser left on
disk underneath.

## Sending

Signing and encrypting outgoing mail are switched on in the same preferences
page, both on by default. `Message.prototype.$send` is wrapped, so the body is
transformed after the user hits send and before SOGo posts it.

Mail is encrypted only when **every** recipient has a contact key; one unknown
recipient falls back to signing alone, because encrypting to some recipients
and not others would silently drop the rest. The message is always also
encrypted to the sender's own key, so the copy in Sent stays readable.

This produces **inline OpenPGP**, not PGP/MIME: SOGo composes the MIME itself
on the server from a JSON payload, and the only field we can rewrite is the
body text. Two consequences are surfaced in a confirmation dialog rather than
hidden: an HTML body is converted to plain text, and attachments are **not**
encrypted, because SOGo adds them after the point we can reach.

## Updating the vendored libraries

```
cd helper-scripts/dev_tests/pgp-webmail
bun update openpgp postal-mime
cp node_modules/openpgp/dist/openpgp.min.js ../../../data/conf/sogo/pgp/mailcow-openpgp.min.js
bun build ./vendor-entry.js --format=iife --minify \
  --outfile=../../../data/conf/sogo/pgp/mailcow-postal-mime.min.js
bun test
```

Drop the trailing `//# sourceMappingURL=` line from `mailcow-openpgp.min.js`: the map is
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
