(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.MailcowPGPVault = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var VERSION = 1;
  var KDF = "PBKDF2-SHA256";
  var CIPHER = "AES-GCM-256";
  var ITERATIONS = 600000;
  var SALT_BYTES = 16;
  var IV_BYTES = 12;
  var OVERWRITE_PASSES = 3;

  function fail(code, message, cause) {
    var error = new Error(message);
    error.code = code;
    if (cause) error.cause = cause;
    return error;
  }

  function toBase64(bytes) {
    var binary = "";
    var view = new Uint8Array(bytes);
    for (var index = 0; index < view.length; index++) {
      binary += String.fromCharCode(view[index]);
    }
    return btoa(binary);
  }

  function fromBase64(value) {
    var binary = atob(value);
    var bytes = new Uint8Array(binary.length);
    for (var index = 0; index < binary.length; index++) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  }

  function create(dependencies) {
    var crypto = (dependencies && dependencies.crypto) || globalThis.crypto;
    if (!crypto || !crypto.subtle) {
      throw fail("no-crypto", "WebCrypto is not available");
    }

    var encoder = new TextEncoder();
    var decoder = new TextDecoder();

    async function derive(password, salt, iterations) {
      var material = await crypto.subtle.importKey(
        "raw",
        encoder.encode(password),
        "PBKDF2",
        false,
        ["deriveKey"]
      );
      return crypto.subtle.deriveKey(
        { name: "PBKDF2", salt: salt, iterations: iterations, hash: "SHA-256" },
        material,
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt", "decrypt"]
      );
    }

    async function seal(secret, password) {
      if (typeof secret !== "string" || secret.trim() === "") {
        throw fail("no-secret", "nothing to seal");
      }
      if (typeof password !== "string" || password === "") {
        throw fail("no-password", "a password is required");
      }

      var salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
      var iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
      var key = await derive(password, salt, ITERATIONS);

      var data = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv: iv },
        key,
        encoder.encode(secret)
      );

      return JSON.stringify({
        v: VERSION,
        kdf: KDF,
        cipher: CIPHER,
        iterations: ITERATIONS,
        salt: toBase64(salt),
        iv: toBase64(iv),
        data: toBase64(data)
      });
    }

    async function open(sealed, password) {
      var envelope;
      try {
        envelope = JSON.parse(sealed);
      } catch (cause) {
        throw fail("bad-vault", "this is not a stored key", cause);
      }

      if (!envelope || typeof envelope !== "object") {
        throw fail("bad-vault", "this is not a stored key");
      }
      if (envelope.v !== VERSION || envelope.kdf !== KDF || envelope.cipher !== CIPHER) {
        throw fail("bad-vault", "unsupported stored key format");
      }
      if (typeof envelope.iterations !== "number" || envelope.iterations < ITERATIONS) {
        throw fail("bad-vault", "stored key uses weaker parameters than required");
      }
      if (!envelope.salt || !envelope.iv || !envelope.data) {
        throw fail("bad-vault", "stored key is incomplete");
      }
      if (typeof password !== "string" || password === "") {
        throw fail("no-password", "a password is required");
      }

      var salt;
      var iv;
      var data;
      try {
        salt = fromBase64(envelope.salt);
        iv = fromBase64(envelope.iv);
        data = fromBase64(envelope.data);
      } catch (cause) {
        throw fail("bad-vault", "stored key is damaged", cause);
      }

      var key = await derive(password, salt, envelope.iterations);

      var plaintext;
      try {
        plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: iv }, key, data);
      } catch (cause) {
        throw fail("bad-password", "wrong password, or the stored key was altered", cause);
      }

      return decoder.decode(plaintext);
    }

    function wipe(storage, names) {
      var cleared = 0;

      (names || []).forEach(function (name) {
        var existing;
        try {
          existing = storage.getItem(name);
        } catch (error) {
          existing = null;
        }
        if (existing === null || existing === undefined) return;

        var length = Math.max(String(existing).length, 64);
        for (var pass = 0; pass < OVERWRITE_PASSES; pass++) {
          try {
            storage.setItem(name, toBase64(crypto.getRandomValues(new Uint8Array(length))));
          } catch (error) {
            break;
          }
        }
        try {
          storage.removeItem(name);
          cleared++;
        } catch (error) {
          return;
        }
      });

      return cleared;
    }

    return { seal: seal, open: open, wipe: wipe, iterations: ITERATIONS };
  }

  return { create: create };
});
