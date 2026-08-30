import { describe, expect, test, beforeAll } from "bun:test";
import MailcowPGPVault from "../../../data/conf/sogo/pgp/mailcow-pgp-vault.js";

const PASSWORD = "a long enough vault password";
const SECRET =
  "-----BEGIN PGP PRIVATE KEY BLOCK-----\nlIYEZxxxSECRETMATERIALxxx\n-----END PGP PRIVATE KEY BLOCK-----\n";

let vault;

beforeAll(() => {
  vault = MailcowPGPVault.create({ crypto: globalThis.crypto });
});

describe("sealing", () => {
  test("returns the original secret to the right password", async () => {
    const sealed = await vault.seal(SECRET, PASSWORD);
    expect(await vault.open(sealed, PASSWORD)).toBe(SECRET);
  });

  test("never writes the secret in the clear", async () => {
    const sealed = await vault.seal(SECRET, PASSWORD);
    expect(sealed).not.toInclude("SECRETMATERIAL");
    expect(sealed).not.toInclude("BEGIN PGP PRIVATE KEY BLOCK");
    expect(sealed).not.toInclude(PASSWORD);
  });

  test("uses a fresh salt and nonce every time", async () => {
    const first = JSON.parse(await vault.seal(SECRET, PASSWORD));
    const second = JSON.parse(await vault.seal(SECRET, PASSWORD));
    expect(first.salt).not.toBe(second.salt);
    expect(first.iv).not.toBe(second.iv);
    expect(first.data).not.toBe(second.data);
  });

  test("records parameters strong enough to be worth trusting", async () => {
    const sealed = JSON.parse(await vault.seal(SECRET, PASSWORD));
    expect(sealed.kdf).toBe("PBKDF2-SHA256");
    expect(sealed.cipher).toBe("AES-GCM-256");
    expect(sealed.iterations).toBeGreaterThanOrEqual(600000);
    expect(atob(sealed.salt).length).toBeGreaterThanOrEqual(16);
    expect(atob(sealed.iv).length).toBe(12);
  });

  test("refuses an empty password", async () => {
    await expect(vault.seal(SECRET, "")).rejects.toMatchObject({ code: "no-password" });
  });

  test("refuses an empty secret", async () => {
    await expect(vault.seal("", PASSWORD)).rejects.toMatchObject({ code: "no-secret" });
  });
});

describe("opening", () => {
  test("rejects the wrong password", async () => {
    const sealed = await vault.seal(SECRET, PASSWORD);
    await expect(vault.open(sealed, "not the password")).rejects.toMatchObject({
      code: "bad-password",
    });
  });

  test("rejects tampered ciphertext", async () => {
    const sealed = JSON.parse(await vault.seal(SECRET, PASSWORD));
    const bytes = Uint8Array.from(atob(sealed.data), (c) => c.charCodeAt(0));
    bytes[Math.floor(bytes.length / 2)] ^= 0xff;
    sealed.data = btoa(String.fromCharCode(...bytes));
    await expect(vault.open(JSON.stringify(sealed), PASSWORD)).rejects.toMatchObject({
      code: "bad-password",
    });
  });

  test("rejects a tampered iteration count", async () => {
    const sealed = JSON.parse(await vault.seal(SECRET, PASSWORD));
    sealed.iterations = 700000;
    await expect(vault.open(JSON.stringify(sealed), PASSWORD)).rejects.toMatchObject({
      code: "bad-password",
    });
  });

  test("rejects something that is not a vault", async () => {
    await expect(vault.open("not json", PASSWORD)).rejects.toMatchObject({ code: "bad-vault" });
    await expect(vault.open("{}", PASSWORD)).rejects.toMatchObject({ code: "bad-vault" });
  });

  test("rejects a format it does not know", async () => {
    const sealed = JSON.parse(await vault.seal(SECRET, PASSWORD));
    sealed.v = 99;
    await expect(vault.open(JSON.stringify(sealed), PASSWORD)).rejects.toMatchObject({
      code: "bad-vault",
    });
  });

  test("rejects a weakened iteration count outright", async () => {
    const sealed = JSON.parse(await vault.seal(SECRET, PASSWORD));
    sealed.iterations = 1000;
    await expect(vault.open(JSON.stringify(sealed), PASSWORD)).rejects.toMatchObject({
      code: "bad-vault",
    });
  });
});
