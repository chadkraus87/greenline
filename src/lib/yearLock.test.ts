import { describe, it, expect } from "vitest";
import { isYearLocked, lockedYearAmong, lockedYears, toggleYearLock, yearOf, YearLockedError } from "./yearLock";

describe("yearOf", () => {
  it("reads the year from an ISO date", () => {
    expect(yearOf("2026-08-11")).toBe(2026);
  });
  it("rejects anything that isn't one", () => {
    expect(yearOf("")).toBeNull();
    expect(yearOf("08/11/2026")).toBeNull();
    expect(yearOf(undefined)).toBeNull();
  });
});

describe("lockedYears", () => {
  it("de-duplicates and sorts newest first", () => {
    expect(lockedYears({ lockedYears: [2024, 2026, 2024] })).toEqual([2026, 2024]);
  });
  it("treats missing as none locked", () => {
    expect(lockedYears({})).toEqual([]);
    expect(isYearLocked({}, 2026)).toBe(false);
  });
});

describe("lockedYearAmong", () => {
  const settings = { lockedYears: [2025] };

  it("catches a date inside a filed year", () => {
    expect(lockedYearAmong(settings, "2025-03-02")).toBe(2025);
  });

  it("catches moving a record OUT of a filed year", () => {
    // Old date locked, new date not — this still changes 2025's totals.
    expect(lockedYearAmong(settings, "2026-01-05", "2025-12-30")).toBe(2025);
  });

  it("allows edits entirely outside filed years", () => {
    expect(lockedYearAmong(settings, "2026-01-05", "2026-02-01")).toBeNull();
  });

  it("ignores undefined dates", () => {
    expect(lockedYearAmong(settings, undefined, "2026-01-05")).toBeNull();
  });
});

describe("toggleYearLock", () => {
  it("locks and unlocks", () => {
    expect(toggleYearLock({ lockedYears: [] }, 2025)).toEqual([2025]);
    expect(toggleYearLock({ lockedYears: [2025] }, 2025)).toEqual([]);
  });
});

describe("YearLockedError", () => {
  it("says which year and how to undo it", () => {
    const e = new YearLockedError(2025);
    expect(e.year).toBe(2025);
    expect(e.message).toContain("2025");
    expect(e.message).toContain("Settings");
  });
});
