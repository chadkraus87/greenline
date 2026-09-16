import { describe, it, expect } from "vitest";

/**
 * Demo mode renders the app on fake data with a fake signed-in admin. It must
 * never exist in a production build.
 *
 * Checking an imported `DEMO` constant is not enough: the bundler doesn't always
 * fold an imported constant inside an expression, and demo fixtures once shipped
 * that way. `import.meta.env.DEV` is replaced by a literal `false` at build time,
 * which the minifier always removes — so every check must include it.
 */
const sources = import.meta.glob(["../**/*.ts", "../**/*.tsx", "!../**/*.test.*", "!../dev/demo.ts"],
  { query: "?raw", import: "default", eager: true }) as Record<string, string>;

describe("demo mode gate", () => {
  it("found the source files", () => {
    expect(Object.keys(sources).length).toBeGreaterThan(20);
  });

  it("never checks DEMO without the build-time DEV flag", () => {
    const offenders: string[] = [];
    for (const [file, src] of Object.entries(sources)) {
      src.split("\n").forEach((line, i) => {
        if (line.trimStart().startsWith("import ")) return;
        const bare = line.replace(/import\.meta\.env\.DEV && DEMO/g, "");
        if (/(?<![\w.])DEMO(?!\w)/.test(bare)) offenders.push(`${file}:${i + 1}`);
      });
    }
    expect(offenders).toEqual([]);
  });
});
