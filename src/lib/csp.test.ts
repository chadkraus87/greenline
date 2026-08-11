import { describe, it, expect } from "vitest";
// Raw imports rather than fs, so this stays a browser-typed project with no @types/node.
import indexHtml from "../../index.html?raw";
import vercelJson from "../../vercel.json?raw";
import staticHeaders from "../../public/_headers?raw";

/**
 * The Content-Security-Policy is written in three places — the <meta> tag, the
 * Vercel header config, and the static _headers file. They drifted once and
 * silently broke receipt previews in production (the <img> onError fallback
 * swallowed the block into "can't be previewed here"), so they're pinned here.
 */

/** Pull the policy out of whichever file format it's declared in. */
function policies() {
  const meta = /content="(default-src[^"]+)"/.exec(indexHtml)?.[1];
  const vercel = (JSON.parse(vercelJson) as { headers: { headers: { key: string; value: string }[] }[] })
    .headers[0].headers.find((h) => h.key === "Content-Security-Policy")?.value;
  const headers = /^\s*Content-Security-Policy:\s*(.+)$/m.exec(staticHeaders)?.[1].trim();
  return { meta, vercel, headers };
}

/** "a 'self'; b 'none'" → { a: "'self'", b: "'none'" } */
const directives = (csp: string) =>
  Object.fromEntries(csp.split(";").map((d) => {
    const [name, ...rest] = d.trim().split(/\s+/);
    return [name, rest.join(" ")];
  }));

describe("Content-Security-Policy", () => {
  const { meta, vercel, headers } = policies();

  it("is declared in all three places", () => {
    expect(meta).toBeTruthy();
    expect(vercel).toBeTruthy();
    expect(headers).toBeTruthy();
  });

  it("is byte-identical between the two header files", () => {
    expect(headers).toBe(vercel);
  });

  it("matches the meta tag, which can only omit frame-ancestors", () => {
    // frame-ancestors is ignored in a <meta> CSP by spec, so it lives in the
    // headers only — X-Frame-Options: DENY is what covers the meta case.
    expect(meta).toBe(vercel!.replace("; frame-ancestors 'none'", ""));
  });

  it("lets receipt previews load from Supabase storage", () => {
    // Receipts render as <img src={signedUrl}> against the project's storage
    // origin. Without this, every preview is blocked.
    for (const csp of [meta!, vercel!]) {
      expect(directives(csp)["img-src"]).toContain("https://*.supabase.co");
    }
  });

  it("still allows the API and realtime connections", () => {
    const d = directives(vercel!);
    expect(d["connect-src"]).toContain("https://*.supabase.co");
    expect(d["connect-src"]).toContain("wss://*.supabase.co");
  });

  it("keeps the restrictive directives that make the policy worth having", () => {
    const d = directives(vercel!);
    expect(d["default-src"]).toBe("'self'");
    expect(d["script-src"]).toBe("'self'");   // no 'unsafe-inline' / 'unsafe-eval'
    expect(d["object-src"]).toBe("'none'");
    expect(d["base-uri"]).toBe("'self'");
    expect(d["form-action"]).toBe("'self'");
    expect(d["frame-ancestors"]).toBe("'none'");
  });

  it("never widens img-src or connect-src to a bare wildcard", () => {
    for (const key of ["img-src", "connect-src"]) {
      const value = directives(vercel!)[key];
      expect(value).not.toMatch(/(^|\s)\*(\s|$)/);
      expect(value).not.toContain("http://");
    }
  });
});
