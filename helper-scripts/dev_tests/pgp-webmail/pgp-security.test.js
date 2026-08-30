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
let mine;
let workdir;

function buildWithFilter(command, args) {
  const result = spawnSync("python3", [FIXTURE_BUILDER, command, ...args], {
    encoding: "buffer",
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(command + " failed: " + (result.stderr || "").toString());
  }
  return result.stdout;
}

async function storedMessage(plaintext, signingKey) {
  const suffix = Math.random().toString(36).slice(2);
  const plainPath = join(workdir, "plain-" + suffix + ".eml");
  writeFileSync(plainPath, plaintext);

  const armored = await openpgp.encrypt({
    message: await openpgp.createMessage({
      binary: new Uint8Array(buildWithFilter("protect", [plainPath])),
    }),
    encryptionKeys: mine.publicKey,
    signingKeys: signingKey || undefined,
    format: "armored",
  });

  const armorPath = join(workdir, "armor-" + suffix + ".asc");
  writeFileSync(armorPath, armored);
  return buildWithFilter("wrap", [plainPath, armorPath]).toString("utf8");
}

beforeAll(async () => {
  workdir = mkdtempSync(join(tmpdir(), "mailcow-pgp-sec-"));
  core = MailcowPGPCore.create({ openpgp, PostalMime });

  const generated = await openpgp.generateKey({
    userIDs: [{ name: "Eu", email: "eu@example.org" }],
    passphrase: PASSPHRASE,
    format: "armored",
  });
  mine = {
    armoredPrivateKey: generated.privateKey,
    publicKey: await openpgp.readKey({ armoredKey: generated.publicKey }),
  };
});

describe("a valid signature must not vouch for a sender it does not name", () => {
  test("a message from one address signed by another key is flagged, not trusted", async () => {
    const ana = await openpgp.generateKey({
      userIDs: [{ name: "Ana", email: "ana@example.org" }],
      format: "object",
    });

    const raw = await storedMessage(
      'From: Atacante <atacante@evil.example>\nTo: eu@example.org\nSubject: Urgente\n' +
        'Content-Type: text/plain; charset="utf-8"\n\ntransfere o dinheiro\n',
      ana.privateKey
    );

    const key = await core.unlockPrivateKey(mine.armoredPrivateKey, PASSPHRASE);
    const result = await core.decryptRawSource(raw, [key], [ana.publicKey]);

    expect(result.from.address).toBe("atacante@evil.example");
    expect(result.signature.status).toBe("valid");
    expect(core.signatureMatchesSender(result.signature, result.from)).toBe(false);
  });

  test("a signature whose key names the sender does match", async () => {
    const ana = await openpgp.generateKey({
      userIDs: [{ name: "Ana", email: "ana@example.org" }],
      format: "object",
    });

    const raw = await storedMessage(
      'From: Ana <ana@example.org>\nTo: eu@example.org\nSubject: Ola\n' +
        'Content-Type: text/plain; charset="utf-8"\n\ncorpo\n',
      ana.privateKey
    );

    const key = await core.unlockPrivateKey(mine.armoredPrivateKey, PASSPHRASE);
    const result = await core.decryptRawSource(raw, [key], [ana.publicKey]);

    expect(core.signatureMatchesSender(result.signature, result.from)).toBe(true);
  });

  test("an unsigned message never counts as matching", () => {
    expect(core.signatureMatchesSender({ status: "none" }, { address: "a@b.c" })).toBe(false);
  });

  test("a signature with no sender to compare against never counts as matching", () => {
    expect(
      core.signatureMatchesSender(
        { status: "valid", userIds: ["Ana <ana@example.org>"] },
        null
      )
    ).toBe(false);
  });
});

describe("a key offered by a message must name that sender", () => {
  test("refuses a key whose identities do not include the sender", async () => {
    const impostor = await openpgp.generateKey({
      userIDs: [{ name: "Ana", email: "ana@example.org" }],
      format: "armored",
    });

    const offered = await core.findSenderKeys({
      headers: [],
      attachments: [
        {
          filename: "key.asc",
          mimeType: "application/pgp-keys",
          content: new TextEncoder().encode(impostor.publicKey).buffer,
        },
      ],
      from: { address: "atacante@evil.example" },
    });

    expect(offered).toHaveLength(0);
  });

  test("accepts a key that names the sender", async () => {
    const ana = await openpgp.generateKey({
      userIDs: [{ name: "Ana", email: "ana@example.org" }],
      format: "armored",
    });

    const offered = await core.findSenderKeys({
      headers: [],
      attachments: [
        {
          filename: "key.asc",
          mimeType: "application/pgp-keys",
          content: new TextEncoder().encode(ana.publicKey).buffer,
        },
      ],
      from: { address: "ana@example.org" },
    });

    expect(offered).toHaveLength(1);
    expect(offered[0].userIds).toContain("Ana <ana@example.org>");
  });

  test("refuses an Autocrypt key that names somebody else", async () => {
    const impostor = await openpgp.generateKey({
      userIDs: [{ name: "Ana", email: "ana@example.org" }],
      format: "object",
    });
    const keydata = Buffer.from(impostor.publicKey.toPacketList().write()).toString("base64");

    const offered = await core.findSenderKeys({
      headers: [{ key: "autocrypt", value: `addr=ana@example.org; keydata=${keydata}` }],
      attachments: [],
      from: { address: "atacante@evil.example" },
    });

    expect(offered).toHaveLength(0);
  });
});

describe("attachments must not become script in the webmail origin", () => {
  test("an html attachment is handed over as an inert type", () => {
    expect(core.safeAttachmentType("text/html")).toBe("application/octet-stream");
    expect(core.safeAttachmentType("image/svg+xml")).toBe("application/octet-stream");
    expect(core.safeAttachmentType("application/xhtml+xml")).toBe("application/octet-stream");
    expect(core.safeAttachmentType("text/html; charset=utf-8")).toBe("application/octet-stream");
    expect(core.safeAttachmentType("TEXT/HTML")).toBe("application/octet-stream");
  });

  test("an ordinary attachment keeps its type", () => {
    expect(core.safeAttachmentType("image/png")).toBe("image/png");
    expect(core.safeAttachmentType("application/pdf")).toBe("application/pdf");
  });

  test("a missing or odd type falls back to something inert", () => {
    expect(core.safeAttachmentType("")).toBe("application/octet-stream");
    expect(core.safeAttachmentType(null)).toBe("application/octet-stream");
    expect(core.safeAttachmentType("javascript:alert(1)")).toBe("application/octet-stream");
  });
});

describe("identity display must not borrow an unrelated identity", () => {
  test("does not present a non matching identity as the signer", () => {
    const ids = ["Ana <ana@example.org>", "Ana <ana@other.org>"];
    expect(core.pickUserId(ids, "atacante@evil.example")).toBe("");
  });

  test("still picks the matching identity when there is one", () => {
    const ids = ["Ana <ana@example.org>", "Ana <ana@other.org>"];
    expect(core.pickUserId(ids, "ana@other.org")).toBe("Ana <ana@other.org>");
  });

  test("with no sender to compare it names nobody", () => {
    expect(core.pickUserId(["Ana <ana@example.org>"], null)).toBe("");
  });
});
