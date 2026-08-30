(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.MailcowPGPCore = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var OBSCURED_SUBJECT = "[...]";
  var RENDERABLE = [
    "text/html",
    "application/xhtml+xml",
    "image/svg+xml",
    "application/xml",
    "text/xml",
    "text/javascript",
    "application/javascript",
    "application/ecmascript",
    "text/ecmascript"
  ];
  var ARMOR = /-----BEGIN PGP MESSAGE-----[\s\S]*?-----END PGP MESSAGE-----/;
  var STORAGE_MARKER = /^x-mailcow-pgp-storage:\s*encrypted/im;
  var PGP_MIME = /^content-type:\s*multipart\/encrypted[\s\S]{0,400}?application\/pgp-encrypted/im;

  function fromBase64(value) {
    var binary = atob(value);
    var bytes = new Uint8Array(binary.length);
    for (var index = 0; index < binary.length; index++) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  }

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

    function extractAddress(text) {
      var value = String(text === null || text === undefined ? "" : text);
      var angled = /<([^>]+)>/.exec(value);
      var candidate = (angled ? angled[1] : value).trim().toLowerCase();
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate) ? candidate : "";
    }

    function keysForRecipients(recipients, contacts) {
      var found = [];
      var missing = [];
      var seen = {};

      (recipients || []).forEach(function (recipient) {
        var address = extractAddress(recipient);
        if (!address) return;

        var match = (contacts || []).filter(function (contact) {
          return (contact.userIds || []).some(function (userId) {
            return extractAddress(userId) === address;
          });
        })[0];

        if (!match) {
          if (missing.indexOf(address) === -1) missing.push(address);
          return;
        }
        if (seen[match.fingerprint]) return;
        seen[match.fingerprint] = true;
        found.push(match);
      });

      return { found: found, missing: missing };
    }

    async function signText(text, privateKey) {
      if (!privateKey) throw fail("no-key", "no private key to sign with");
      return openpgp.sign({
        message: await openpgp.createCleartextMessage({ text: String(text) }),
        signingKeys: privateKey,
        format: "armored"
      });
    }

    async function encryptText(text, recipientKeys, signingKey) {
      if (!recipientKeys || !recipientKeys.length) {
        throw fail("no-recipient", "no recipient key to encrypt to");
      }
      return openpgp.encrypt({
        message: await openpgp.createMessage({ text: String(text) }),
        encryptionKeys: recipientKeys,
        signingKeys: signingKey || undefined,
        format: "armored"
      });
    }

    function isObscuredSubject(text) {
      var value = String(text === null || text === undefined ? "" : text).trim();
      return value === "" || value === OBSCURED_SUBJECT;
    }

    function soFolder(name) {
      var text = String(name || "");
      if (!text) return "";
      return text
        .split("/")
        .map(function (segment) {
          if (!segment) return segment;
          return segment.indexOf("folder") === 0 ? segment : "folder" + segment;
        })
        .join("/");
    }

    function createCache(limit) {
      var entries = new Map();
      var max = limit > 0 ? limit : 1;

      return {
        get: function (key) {
          if (!entries.has(key)) return undefined;
          var value = entries.get(key);
          entries.delete(key);
          entries.set(key, value);
          return value;
        },
        set: function (key, value) {
          if (entries.has(key)) entries.delete(key);
          entries.set(key, value);
          while (entries.size > max) {
            entries.delete(entries.keys().next().value);
          }
        },
        clear: function () {
          entries.clear();
        }
      };
    }

    function outerSender(rawSource) {
      var source = unescapeSource(rawSource);
      var separator = source.search(/\r?\n\r?\n/);
      var head = separator === -1 ? source : source.slice(0, separator);
      var lines = head.split(/\r?\n/);

      var value = null;
      for (var index = 0; index < lines.length; index++) {
        if (!/^from:/i.test(lines[index])) continue;
        value = lines[index].slice(lines[index].indexOf(":") + 1);
        while (index + 1 < lines.length && /^[ \t]/.test(lines[index + 1])) {
          value += " " + lines[index + 1].trim();
          index++;
        }
        break;
      }
      if (!value) return null;

      var address = extractAddress(value);
      if (!address) return null;

      return {
        name: value.replace(/<[^>]*>/, "").trim().replace(/^"|"$/g, ""),
        address: address
      };
    }

    function userIdMatches(userIds, address) {
      var wanted = String(address || "").trim().toLowerCase();
      if (!wanted) return null;
      return (userIds || []).filter(function (userId) {
        return extractAddress(userId) === wanted;
      })[0] || null;
    }

    function pickUserId(userIds, address) {
      return userIdMatches(userIds, address) || "";
    }

    function signatureMatchesSender(signature, from) {
      if (!signature || signature.status !== "valid") return false;
      if (!from || !from.address) return false;
      return Boolean(userIdMatches(signature.userIds, from.address));
    }

    function safeAttachmentType(type) {
      var value = String(type || "").split(";")[0].trim().toLowerCase();
      if (!/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/.test(value)) {
        return "application/octet-stream";
      }
      if (RENDERABLE.indexOf(value) !== -1) return "application/octet-stream";
      return value;
    }

    function shouldHandleMessage(token, state) {
      if (!token) return false;
      if (state.failed && state.failed[token]) return false;
      if (state.rendered && token === state.lastHandled) return false;
      return true;
    }

    function classifySource(text) {
      var source = unescapeSource(text);
      if (STORAGE_MARKER.test(source)) return "storage";
      if (PGP_MIME.test(source) || ARMOR.test(source)) return "end-to-end";
      return "none";
    }

    async function findSenderKeys(parsed) {
      var sender = parsed.from && parsed.from.address ? parsed.from.address : "";
      if (!sender) return [];

      var candidates = [];

      (parsed.attachments || []).forEach(function (attachment) {
        if (String(attachment.mimeType).toLowerCase() !== "application/pgp-keys") return;
        candidates.push({ armored: new TextDecoder().decode(attachment.content) });
      });

      (parsed.headers || []).forEach(function (header) {
        if (String(header.key).toLowerCase() !== "autocrypt") return;
        var match = /keydata=([A-Za-z0-9+/=\s]+)/i.exec(String(header.value));
        if (!match) return;
        candidates.push({ base64: match[1].replace(/\s+/g, "") });
      });

      var found = [];
      for (var index = 0; index < candidates.length; index++) {
        var candidate = candidates[index];
        try {
          var key;
          if (candidate.armored) {
            key = await openpgp.readKey({ armoredKey: candidate.armored });
          } else {
            key = await openpgp.readKey({ binaryKey: fromBase64(candidate.base64) });
          }
          var userIds = key.getUserIDs();
          if (!userIdMatches(userIds, sender)) continue;
          found.push({
            armored: key.toPublic().armor(),
            fingerprint: key.getFingerprint(),
            userIds: userIds
          });
        } catch (error) {
          continue;
        }
      }
      return found;
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
      // A message the sender encrypted usually carries no headers inside the
      // payload; the address the reader is shown lives on the outside.
      if (!parsed.from || !parsed.from.address) {
        parsed.from = outerSender(rawSource);
      }
      parsed.signature = await describeSignatures(decrypted.signatures, verificationKeys);
      parsed.encryption = classifySource(rawSource);
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
        from: parsed.from
          ? { name: parsed.from.name || "", address: parsed.from.address || "" }
          : null,
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
      classifySource: classifySource,
      pickUserId: pickUserId,
      outerSender: outerSender,
      signatureMatchesSender: signatureMatchesSender,
      safeAttachmentType: safeAttachmentType,
      soFolder: soFolder,
      isObscuredSubject: isObscuredSubject,
      extractAddress: extractAddress,
      keysForRecipients: keysForRecipients,
      signText: signText,
      encryptText: encryptText,
      createCache: createCache,
      shouldHandleMessage: shouldHandleMessage,
      findSenderKeys: findSenderKeys,
      readPublicKeys: readPublicKeys,
      inspectPrivateKey: inspectPrivateKey,
      unlockPrivateKey: unlockPrivateKey,
      decryptRawSource: decryptRawSource,
      parseMime: parseMime,
    };
  }

  return { create: create };
});
