import { describe, expect, test, beforeAll } from "bun:test";
import * as openpgp from "openpgp";
import PostalMime from "postal-mime";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import MailcowPGPCore from "../../../data/conf/sogo/pgp/mailcow-pgp-core.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE_BUILDER = join(HERE, "make_fixture.py");
const PASSPHRASE = "correct horse battery staple";

let core;
let keys;
let workdir;

function buildWithFilter(command, args) {
  const result = spawnSync("python3", [FIXTURE_BUILDER, command, ...args], {
    encoding: "buffer",
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(
      command + " failed: " + (result.stderr ? result.stderr.toString() : "no output")
    );
  }
  return result.stdout;
}

async function storedMessage(plaintext, { hideSubject = false, key = null } = {}) {
  const suffix = Math.random().toString(36).slice(2);
  const plainPath = join(workdir, "plain-" + suffix + ".eml");
  writeFileSync(plainPath, plaintext);

  const protectedPayload = buildWithFilter("protect", [plainPath]);

  const armored = await openpgp.encrypt({
    message: await openpgp.createMessage({ binary: new Uint8Array(protectedPayload) }),
    encryptionKeys: key || keys.publicKey,
    format: "armored",
  });

  const armorPath = join(workdir, "armor-" + suffix + ".asc");
  writeFileSync(armorPath, armored);

  const wrapArgs = [plainPath, armorPath];
  if (hideSubject) wrapArgs.push("--hide");
  return buildWithFilter("wrap", wrapArgs).toString("utf8");
}

function asViewSource(raw) {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

beforeAll(async () => {
  workdir = mkdtempSync(join(tmpdir(), "mailcow-pgp-test-"));
  core = MailcowPGPCore.create({ openpgp, PostalMime });

  const generated = await openpgp.generateKey({
    userIDs: [{ name: "Test", email: "test@example.org" }],
    passphrase: PASSPHRASE,
    format: "armored",
  });
  keys = {
    armoredPrivateKey: generated.privateKey,
    publicKey: await openpgp.readKey({ armoredKey: generated.publicKey }),
  };
});

describe("source handling", () => {
  test("reverses the escaping SOGo applies to viewsource", () => {
    expect(core.unescapeSource("a &amp; b &lt;c&gt; &quot;d&quot;")).toBe('a & b <c> "d"');
  });

  test("recognises a stored encrypted message", async () => {
    const raw = await storedMessage("From: a@b.c\nSubject: Hi\n\nbody\n");
    expect(core.isEncryptedSource(raw)).toBe(true);
  });

  test("does not claim a plain message is encrypted", () => {
    expect(core.isEncryptedSource("From: a@b.c\nSubject: Hi\n\nbody\n")).toBe(false);
  });

  test("finds the armor even through viewsource escaping", async () => {
    const raw = await storedMessage("From: a@b.c\nSubject: Hi\n\nbody\n");
    const armor = core.findArmoredMessage(core.unescapeSource(asViewSource(raw)));
    expect(armor).toStartWith("-----BEGIN PGP MESSAGE-----");
    expect(armor).toInclude("-----END PGP MESSAGE-----");
  });
});

describe("decryption", () => {
  test("recovers the body of a stored message", async () => {
    const raw = await storedMessage(
      'From: a@b.c\nTo: d@e.f\nSubject: Visible\nContent-Type: text/plain; charset="utf-8"\n\nSegredo em texto\n'
    );
    const key = await core.unlockPrivateKey(keys.armoredPrivateKey, PASSPHRASE);
    const result = await core.decryptRawSource(raw, [key]);
    expect(result.text.trim()).toBe("Segredo em texto");
  });

  test("recovers the real subject when the stored one is obscured", async () => {
    const raw = await storedMessage(
      'From: a@b.c\nTo: d@e.f\nSubject: Assunto verdadeiro\nContent-Type: text/plain; charset="utf-8"\n\ncorpo\n',
      { hideSubject: true }
    );
    expect(raw).toInclude("[...]");

    const key = await core.unlockPrivateKey(keys.armoredPrivateKey, PASSPHRASE);
    const result = await core.decryptRawSource(raw, [key]);
    expect(result.subject).toBe("Assunto verdadeiro");
  });

  test("keeps attachments intact", async () => {
    const payload = Buffer.from("binary payload".repeat(64)).toString("base64");
    const raw = await storedMessage(
      "From: a@b.c\nSubject: With file\nMIME-Version: 1.0\n" +
        'Content-Type: multipart/mixed; boundary="X"\n\n--X\n' +
        'Content-Type: text/plain; charset="utf-8"\n\nver anexo\n\n--X\n' +
        'Content-Type: application/octet-stream; name="doc.bin"\n' +
        'Content-Disposition: attachment; filename="doc.bin"\n' +
        "Content-Transfer-Encoding: base64\n\n" +
        payload +
        "\n--X--\n"
    );
    const key = await core.unlockPrivateKey(keys.armoredPrivateKey, PASSPHRASE);
    const result = await core.decryptRawSource(raw, [key]);

    expect(result.attachments).toHaveLength(1);
    expect(result.attachments[0].filename).toBe("doc.bin");
    expect(Buffer.from(result.attachments[0].content).toString("base64").replace(/\s/g, "")).toBe(
      payload.replace(/\s/g, "")
    );
  });

  test("exposes an html body when the message has one", async () => {
    const raw = await storedMessage(
      'From: a@b.c\nSubject: Html\nContent-Type: text/html; charset="utf-8"\n\n<p>ola <b>mundo</b></p>\n'
    );
    const key = await core.unlockPrivateKey(keys.armoredPrivateKey, PASSPHRASE);
    const result = await core.decryptRawSource(raw, [key]);
    expect(result.html).toInclude("<b>mundo</b>");
  });
});

describe("failure modes", () => {
  test("rejects a wrong passphrase without leaking the key", async () => {
    await expect(core.unlockPrivateKey(keys.armoredPrivateKey, "wrong")).rejects.toMatchObject({
      code: "bad-passphrase",
    });
  });

  test("rejects an armored blob that is not a key", async () => {
    await expect(core.unlockPrivateKey("not a key at all", PASSPHRASE)).rejects.toMatchObject({
      code: "bad-key",
    });
  });

  test("reports a plain message as not encrypted", async () => {
    const key = await core.unlockPrivateKey(keys.armoredPrivateKey, PASSPHRASE);
    await expect(core.decryptRawSource("From: a@b.c\n\nplain\n", [key])).rejects.toMatchObject({
      code: "not-encrypted",
    });
  });

  test("reports a message encrypted to somebody else", async () => {
    const other = await openpgp.generateKey({
      userIDs: [{ email: "other@example.org" }],
      format: "armored",
    });
    const raw = await storedMessage("From: a@b.c\nSubject: Hi\n\nbody\n", {
      key: await openpgp.readKey({ armoredKey: other.publicKey }),
    });
    const key = await core.unlockPrivateKey(keys.armoredPrivateKey, PASSPHRASE);
    await expect(core.decryptRawSource(raw, [key])).rejects.toMatchObject({
      code: "no-matching-key",
    });
  });

  test("reports corrupted armor instead of rendering garbage", async () => {
    const raw = await storedMessage("From: a@b.c\nSubject: Hi\n\nbody\n");
    const lines = raw.split("\n");
    const body = lines
      .map((line, index) => ({ line, index }))
      .filter(({ line }) => /^[A-Za-z0-9+/]{40,}={0,2}\r?$/.test(line));
    expect(body.length).toBeGreaterThan(2);
    const target = body[Math.floor(body.length * 0.7)];
    lines[target.index] = "A".repeat(target.line.replace(/\r$/, "").length) +
      (target.line.endsWith("\r") ? "\r" : "");
    const broken = lines.join("\n");
    const key = await core.unlockPrivateKey(keys.armoredPrivateKey, PASSPHRASE);
    await expect(core.decryptRawSource(broken, [key])).rejects.toMatchObject({
      code: "decrypt-failed",
    });
  });

  test("refuses to decrypt with no key at all", async () => {
    const raw = await storedMessage("From: a@b.c\nSubject: Hi\n\nbody\n");
    await expect(core.decryptRawSource(raw, [])).rejects.toMatchObject({ code: "no-key" });
  });
});

describe("inspecting a key before it is stored", () => {
  test("reports that a protected key needs its passphrase", async () => {
    const report = await core.inspectPrivateKey(keys.armoredPrivateKey);
    expect(report.needsPassphrase).toBe(true);
    expect(report.fingerprint).toMatch(/^[0-9a-f]{40}$/);
    expect(report.userIds).toContain("Test <test@example.org>");
  });

  test("reports that an unprotected key needs none", async () => {
    const bare = await openpgp.generateKey({
      userIDs: [{ email: "bare@example.org" }],
      format: "armored",
    });
    const report = await core.inspectPrivateKey(bare.privateKey);
    expect(report.needsPassphrase).toBe(false);
  });

  test("refuses a public key", async () => {
    const generated = await openpgp.generateKey({
      userIDs: [{ email: "pub@example.org" }],
      format: "armored",
    });
    await expect(core.inspectPrivateKey(generated.publicKey)).rejects.toMatchObject({
      code: "bad-key",
    });
  });

  test("refuses something that is not a key", async () => {
    await expect(core.inspectPrivateKey("hello")).rejects.toMatchObject({ code: "bad-key" });
  });
});

describe("contact public keys", () => {
  test("reads one armored public key", async () => {
    const generated = await openpgp.generateKey({
      userIDs: [{ name: "Ana", email: "ana@example.org" }],
      format: "armored",
    });
    const read = await core.readPublicKeys(generated.publicKey);
    expect(read).toHaveLength(1);
    expect(read[0].userIds).toContain("Ana <ana@example.org>");
    expect(read[0].fingerprint).toMatch(/^[0-9a-f]{40}$/);
    expect(read[0].armored).toStartWith("-----BEGIN PGP PUBLIC KEY BLOCK-----");
  });

  test("reads several keys pasted together", async () => {
    const one = await openpgp.generateKey({ userIDs: [{ email: "a@x.org" }], format: "armored" });
    const two = await openpgp.generateKey({ userIDs: [{ email: "b@x.org" }], format: "armored" });
    const read = await core.readPublicKeys(one.publicKey + "\n" + two.publicKey);
    expect(read).toHaveLength(2);
  });

  test("refuses a private key so it is never stored unprotected", async () => {
    await expect(core.readPublicKeys(keys.armoredPrivateKey)).rejects.toMatchObject({
      code: "not-a-public-key",
    });
  });

  test("refuses something that is not a key", async () => {
    await expect(core.readPublicKeys("hello")).rejects.toMatchObject({ code: "bad-key" });
  });
});

describe("signature verification", () => {
  async function signedMessage(signingKey) {
    const plainPath = join(workdir, `signed-${Math.random().toString(36).slice(2)}.eml`);
    writeFileSync(plainPath, "From: a@b.c\nSubject: Signed\n\nassinado\n");
    const protectedPayload = buildWithFilter("protect", [plainPath]);
    const armored = await openpgp.encrypt({
      message: await openpgp.createMessage({ binary: new Uint8Array(protectedPayload) }),
      encryptionKeys: keys.publicKey,
      signingKeys: signingKey,
      format: "armored",
    });
    const armorPath = join(workdir, `signed-${Math.random().toString(36).slice(2)}.asc`);
    writeFileSync(armorPath, armored);
    return buildWithFilter("wrap", [plainPath, armorPath]).toString("utf8");
  }

  test("reports a good signature from a known contact", async () => {
    const signer = await openpgp.generateKey({
      userIDs: [{ name: "Bo", email: "bo@example.org" }],
      format: "object",
    });
    const raw = await signedMessage(signer.privateKey);
    const key = await core.unlockPrivateKey(keys.armoredPrivateKey, PASSPHRASE);
    const result = await core.decryptRawSource(raw, [key], [signer.publicKey]);

    expect(result.signature.status).toBe("valid");
    expect(result.signature.userIds).toContain("Bo <bo@example.org>");
  });

  test("reports a signature it cannot check without the contact key", async () => {
    const signer = await openpgp.generateKey({
      userIDs: [{ email: "nobody@example.org" }],
      format: "object",
    });
    const raw = await signedMessage(signer.privateKey);
    const key = await core.unlockPrivateKey(keys.armoredPrivateKey, PASSPHRASE);
    const result = await core.decryptRawSource(raw, [key], []);

    expect(result.signature.status).toBe("unknown-key");
    expect(result.signature.keyId).toMatch(/^[0-9a-f]{16}$/);
  });

  test("does not claim a signature when the mail carries none", async () => {
    const raw = await storedMessage("From: a@b.c\nSubject: Plain\n\nsem assinatura\n");
    const key = await core.unlockPrivateKey(keys.armoredPrivateKey, PASSPHRASE);
    const result = await core.decryptRawSource(raw, [key], []);
    expect(result.signature.status).toBe("none");
  });

  test("keeps working when no verification keys are given at all", async () => {
    const raw = await storedMessage("From: a@b.c\nSubject: Plain\n\ncorpo\n");
    const key = await core.unlockPrivateKey(keys.armoredPrivateKey, PASSPHRASE);
    const result = await core.decryptRawSource(raw, [key]);
    expect(result.text.trim()).toBe("corpo");
    expect(result.signature.status).toBe("none");
  });
});
