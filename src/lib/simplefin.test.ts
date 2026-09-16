import { describe, it, expect } from "vitest";
import {
  decodeSetupToken, parseAccessUrl, normalizeAccountSet, syncWindow, isSyncDue,
  encryptSecret, decryptSecret, SimpleFinError, MAX_WINDOW_DAYS,
} from "../../supabase/functions/_shared/simplefin";
// A real response from SimpleFIN's public demo account, trimmed.
import demo from "./simplefin.fixture.json";

const b64 = (s: string) => btoa(s);

describe("decodeSetupToken", () => {
  it("decodes SimpleFIN's own demo token", () => {
    const url = decodeSetupToken("aHR0cHM6Ly9icmlkZ2Uuc2ltcGxlZmluLm9yZy9zaW1wbGVmaW4vY2xhaW0vZGVtbw==");
    expect(url.hostname).toBe("bridge.simplefin.org");
    expect(url.pathname).toContain("/claim/");
  });

  it("refuses a token pointing anywhere but SimpleFIN", () => {
    // The token is user-pasted input; without this the server could be aimed at
    // an internal address (SSRF).
    for (const target of [
      "https://evil.example/simplefin/claim/x",
      "https://169.254.169.254/claim/latest",
      "http://bridge.simplefin.org/simplefin/claim/x",      // not https
      "https://bridge.simplefin.org:8443/simplefin/claim/x", // odd port
      "https://bridge.simplefin.org.evil.example/claim/x",   // lookalike host
    ]) {
      expect(() => decodeSetupToken(b64(target)), target).toThrow(SimpleFinError);
    }
  });

  it("rejects junk with a readable message", () => {
    expect(() => decodeSetupToken("")).toThrow(/paste/i);
    expect(() => decodeSetupToken("not base64 at all !!!!")).toThrow(SimpleFinError);
  });
});

describe("parseAccessUrl", () => {
  it("splits the embedded credentials into a Basic header and strips them from the URL", () => {
    const { base, authorization } = parseAccessUrl("https://demo:demo@beta-bridge.simplefin.org/simplefin");
    expect(base).toBe("https://beta-bridge.simplefin.org/simplefin");
    expect(base).not.toContain("demo@");
    expect(authorization).toBe(`Basic ${btoa("demo:demo")}`);
  });

  it("refuses an access URL for another host, or one without credentials", () => {
    expect(() => parseAccessUrl("https://u:p@evil.example/simplefin")).toThrow(SimpleFinError);
    expect(() => parseAccessUrl("https://bridge.simplefin.org/simplefin")).toThrow(/credentials/);
  });
});

describe("normalizeAccountSet", () => {
  it("reads the real demo payload", () => {
    const { accounts, errors } = normalizeAccountSet(demo);
    expect(errors).toEqual([]);
    expect(accounts.length).toBe(3);
    const a = accounts[0];
    expect(a.orgName).toBe("SimpleFIN Demo");
    expect(typeof a.balance).toBe("number");
    expect(a.transactions[0].posted).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // Money out is negative in SimpleFIN.
    expect(accounts.flatMap((x) => x.transactions).some((t) => t.amount < 0)).toBe(true);
  });

  it("accepts the newer shape: errlist and connections", () => {
    const { accounts, errors } = normalizeAccountSet({
      errlist: [{ code: "con.auth", msg: "Reconnect your bank" }],
      connections: [{ conn_id: "c1", name: "Credit Union" }],
      accounts: [{ id: "a1", name: "Checking", conn_id: "c1", currency: "USD", balance: "12.50", "balance-date": 1789603200,
        transactions: [{ id: "t1", posted: 1789603200, amount: "-4.25", description: "Coffee" }] }],
    });
    expect(errors).toEqual(["Reconnect your bank"]);
    expect(accounts[0]).toMatchObject({ orgName: "Credit Union", balance: 12.5 });
    expect(accounts[0].transactions[0]).toMatchObject({ amount: -4.25, description: "Coffee" });
  });

  it("skips pending and malformed transactions rather than guessing", () => {
    const { accounts } = normalizeAccountSet({
      accounts: [{ id: "a", name: "x", transactions: [
        { id: "p", posted: 1789603200, amount: "-1", pending: true },
        { id: "bad-amount", posted: 1789603200, amount: "abc" },
        { posted: 1789603200, amount: "-1" },
        { id: "ok", posted: 1789603200, amount: "-2", description: "fine" },
      ] }],
    });
    expect(accounts[0].transactions.map((t) => t.externalId)).toEqual(["ok"]);
  });

  it("survives garbage without throwing", () => {
    expect(normalizeAccountSet(null)).toEqual({ accounts: [], errors: [] });
    expect(normalizeAccountSet({ accounts: "nope" })).toEqual({ accounts: [], errors: [] });
  });
});

describe("syncWindow / isSyncDue", () => {
  const now = Date.parse("2026-09-16T12:00:00Z");

  it("overlaps the previous sync so late-posting charges aren't missed", () => {
    const { start } = syncWindow("2026-09-15T12:00:00Z", now);
    expect(now / 1000 - start).toBeCloseTo(6 * 86400, -2);
  });

  it("never asks for more than the bridge's 90-day limit", () => {
    const { start, end } = syncWindow("2020-01-01T00:00:00Z", now);
    expect((end - start) / 86400).toBeLessThanOrEqual(MAX_WINDOW_DAYS + 1);
  });

  it("paces syncs to stay well under 24 requests a day", () => {
    expect(isSyncDue(null, now)).toBe(true);
    expect(isSyncDue("2026-09-16T10:00:00Z", now)).toBe(false);
    expect(isSyncDue("2026-09-16T07:00:00Z", now)).toBe(true);
  });
});

describe("credential encryption", () => {
  const key = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));

  it("round-trips and never stores the plain URL", async () => {
    const secret = "https://user:pass@bridge.simplefin.org/simplefin";
    const blob = await encryptSecret(secret, key);
    expect(blob).not.toContain("pass");
    expect(blob.startsWith("v1.")).toBe(true);
    expect(await decryptSecret(blob, key)).toBe(secret);
  });

  it("uses a fresh IV each time", async () => {
    expect(await encryptSecret("same", key)).not.toBe(await encryptSecret("same", key));
  });

  it("fails loudly with the wrong key or a tampered blob", async () => {
    const blob = await encryptSecret("x", key);
    const other = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));
    await expect(decryptSecret(blob, other)).rejects.toThrow();
    const [v, iv, ct] = blob.split(".");
    const flipped = ct.slice(0, -2) + (ct.slice(-2) === "AA" ? "AB" : "AA");
    await expect(decryptSecret([v, iv, flipped].join("."), key)).rejects.toThrow();
  });
});
