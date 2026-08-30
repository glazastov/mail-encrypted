(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.MailcowPGPCore = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var ARMOR = /-----BEGIN PGP MESSAGE-----[\s\S]*?-----END PGP MESSAGE-----/;
  var STORAGE_MARKER = /^x-mailcow-pgp-storage:\s*encrypted/im;
  var PGP_MIME = /^content-type:\s*multipart\/encrypted[\s\S]{0,400}?application\/pgp-encrypted/im;

  function fail(code, message, cause) {
    var error = new Error(message);
    error.code = code;
    if (cause) error.cause = cause;
    return error;
  }

  function create(dependencies) {
    if (!dependencies || !dependencies.openpgp || !dependencies.PostalMime) {
      throw fail("missing-dependency", "openpgp and PostalMime are both required");
    }
    var openpgp = dependencies.openpgp;
    var PostalMime = dependencies.PostalMime;

    function unescapeSource(text) {
      return String(text)
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&amp;/g, "&");
    }

    function findArmoredMessage(text) {
      var match = ARMOR.exec(unescapeSource(text));
      return match ? match[0] : null;
    }

    function isEncryptedSource(text) {
      var source = unescapeSource(text);
      return (
        STORAGE_MARKER.test(source) || PGP_MIME.test(source) || ARMOR.test(source)
      );
    }

    async function readPublicKeys(armored) {
      var text = String(armored);
      if (/-----BEGIN PGP PRIVATE KEY BLOCK-----/.test(text)) {
        throw fail("not-a-public-key", "that is a private key, not a contact key");
      }

      var blocks = text.match(
        /-----BEGIN PGP PUBLIC KEY BLOCK-----[\s\S]*?-----END PGP PUBLIC KEY BLOCK-----/g
      ) || [text];

      var parsed = [];
      for (var index = 0; index < blocks.length; index++) {
        try {
          var batch = await openpgp.readKeys({ armoredKeys: blocks[index] });
          parsed = parsed.concat(batch);
        } catch (cause) {
          throw fail("bad-key", "not a usable OpenPGP public key", cause);
        }
      }
      if (!parsed.length) {
        throw fail("bad-key", "no key found");
      }

      return parsed.map(function (key) {
        return {
          armored: key.toPublic().armor(),
          fingerprint: key.getFingerprint(),
          userIds: key.getUserIDs()
        };
      });
    }

    async function inspectPrivateKey(armoredKey) {
      var key;
      try {
        key = await openpgp.readPrivateKey({ armoredKey: String(armoredKey) });
      } catch (cause) {
        throw fail("bad-key", "not a usable OpenPGP private key", cause);
      }

      return {
        needsPassphrase: !key.isDecrypted(),
        fingerprint: key.getFingerprint(),
        userIds: key.getUserIDs()
      };
    }

    async function unlockPrivateKey(armoredKey, passphrase) {
      var key;
      try {
        key = await openpgp.readPrivateKey({ armoredKey: String(armoredKey) });
      } catch (cause) {
        throw fail("bad-key", "not a usable OpenPGP private key", cause);
      }

      if (key.isDecrypted()) return key;

      try {
        return await openpgp.decryptKey({ privateKey: key, passphrase: passphrase });
      } catch (cause) {
        throw fail("bad-passphrase", "the passphrase does not unlock this key", cause);
      }
    }

    function hasMatchingKey(message, privateKeys) {
      var wanted = message.getEncryptionKeyIDs().map(function (id) {
        return id.toHex();
      });
      if (!wanted.length) return true;

      return privateKeys.some(function (privateKey) {
        return privateKey.getKeys().some(function (subkey) {
          var id = subkey.getKeyID().toHex();
          return wanted.indexOf(id) !== -1 || wanted.indexOf("0000000000000000") !== -1;
        });
      });
    }

    async function describeSignatures(signatures, verificationKeys) {
      if (!signatures || !signatures.length) {
        return { status: "none" };
      }

      var first = signatures[0];
      var keyId = first.keyID ? first.keyID.toHex() : "";
      var known = (verificationKeys || []).filter(function (key) {
        return key.getKeys().some(function (subkey) {
          return subkey.getKeyID().toHex() === keyId;
        });
      })[0];

      try {
        await first.verified;
      } catch (cause) {
        return { status: known ? "invalid" : "unknown-key", keyId: keyId };
      }

      return {
        status: "valid",
        keyId: keyId,
        fingerprint: known ? known.getFingerprint() : "",
        userIds: known ? known.getUserIDs() : []
      };
    }

    async function decryptRawSource(rawSource, privateKeys, verificationKeys) {
      if (!privateKeys || !privateKeys.length) {
        throw fail("no-key", "no private key is available in this browser");
      }

      var armored = findArmoredMessage(rawSource);
      if (!armored) {
        throw fail("not-encrypted", "this message carries no OpenPGP payload");
      }

      var message;
      try {
        message = await openpgp.readMessage({ armoredMessage: armored });
      } catch (cause) {
        throw fail("decrypt-failed", "the encrypted payload is damaged", cause);
      }

      if (!hasMatchingKey(message, privateKeys)) {
        throw fail("no-matching-key", "this message is not encrypted to any key you hold");
      }

      var decrypted;
      try {
        decrypted = await openpgp.decrypt({
          message: message,
          decryptionKeys: privateKeys,
          verificationKeys: (verificationKeys && verificationKeys.length) ? verificationKeys : undefined,
          expectSigned: false,
          format: "binary",
        });
      } catch (cause) {
        throw fail("decrypt-failed", "the message could not be decrypted", cause);
      }

      var parsed = await parseMime(decrypted.data);
      parsed.signature = await describeSignatures(decrypted.signatures, verificationKeys);
      return parsed;
    }

    async function parseMime(bytes) {
      var parsed;
      try {
        parsed = await new PostalMime().parse(bytes);
      } catch (cause) {
        throw fail("parse-failed", "the decrypted content is not a readable message", cause);
      }

      return {
        subject: parsed.subject || "",
        text: parsed.text || "",
        html: parsed.html || "",
        attachments: (parsed.attachments || []).map(function (attachment) {
          return {
            filename: attachment.filename || "attachment",
            mimeType: attachment.mimeType || "application/octet-stream",
            disposition: attachment.disposition || "attachment",
            contentId: attachment.contentId || "",
            content: attachment.content,
          };
        }),
        headers: parsed.headers || [],
      };
    }

    return {
      unescapeSource: unescapeSource,
      findArmoredMessage: findArmoredMessage,
      isEncryptedSource: isEncryptedSource,
      readPublicKeys: readPublicKeys,
      inspectPrivateKey: inspectPrivateKey,
      unlockPrivateKey: unlockPrivateKey,
      decryptRawSource: decryptRawSource,
      parseMime: parseMime,
    };
  }

  return { create: create };
});
