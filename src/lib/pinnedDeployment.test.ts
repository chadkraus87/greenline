import { describe, it, expect } from "vitest";
import { isPinnedDeployment } from "../components/StaleDeploymentBanner";

const CANONICAL = "greenline-chadwick-kraus-projects.vercel.app";

describe("isPinnedDeployment", () => {
  it("flags a per-deployment URL, which never updates", () => {
    // The one that cost an afternoon: reloading it can't help, it's a
    // different pinned copy of the app rather than a stale cache.
    expect(isPinnedDeployment("greenline-pq2yekcrg-chadwick-kraus-projects.vercel.app", CANONICAL)).toBe(true);
  });

  it("leaves the live alias alone", () => {
    expect(isPinnedDeployment(CANONICAL, CANONICAL)).toBe(false);
  });

  it("says nothing about localhost or a custom domain", () => {
    // Only Vercel hands out pinned deployment hosts; judging other hosts
    // would nag during local development and on a real domain.
    expect(isPinnedDeployment("localhost:5173", CANONICAL)).toBe(false);
    expect(isPinnedDeployment("budget.example.com", CANONICAL)).toBe(false);
  });
});
