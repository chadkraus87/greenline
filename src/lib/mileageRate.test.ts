import { describe, it, expect } from "vitest";
import { rateForYear, setRateForYear, ratedYears, hasOwnRate, DEFAULT_MILEAGE_RATE } from "./mileageRate";

const s = (mileageRates?: Record<string, number>, mileageRate = 0.7) => ({ mileageRates, mileageRate });

describe("rateForYear", () => {
  it("uses the rate set for that exact year", () => {
    expect(rateForYear(s({ "2025": 0.67, "2026": 0.7 }), 2025)).toBe(0.67);
    expect(rateForYear(s({ "2025": 0.67, "2026": 0.7 }), 2026)).toBe(0.7);
  });

  it("carries the most recent earlier rate forward", () => {
    // A rate stays in force until the IRS changes it, so 2027 inherits 2026.
    expect(rateForYear(s({ "2025": 0.67, "2026": 0.7 }), 2027)).toBe(0.7);
  });

  it("uses the earliest known rate for years before any were set", () => {
    expect(rateForYear(s({ "2025": 0.67 }), 2020)).toBe(0.67);
  });

  it("falls back to the legacy single rate, then a default", () => {
    expect(rateForYear(s(undefined, 0.655), 2026)).toBe(0.655);
    expect(rateForYear(s({}, 0), 2026)).toBe(DEFAULT_MILEAGE_RATE);
  });

  it("does not let a later year's rate revalue an earlier one", () => {
    // The bug this exists to prevent: updating the rate for a new year used to
    // silently change every prior year's deduction.
    const before = rateForYear(s({ "2026": 0.7 }), 2026);
    const after = rateForYear(s({ "2026": 0.7, "2027": 0.72 }), 2026);
    expect(after).toBe(before);
  });

  it("ignores junk keys rather than treating them as years", () => {
    expect(rateForYear(s({ notAYear: 9, "2026": 0.7 }), 2026)).toBe(0.7);
  });
});

describe("setRateForYear", () => {
  it("adds and replaces without mutating the original", () => {
    const original = { "2026": 0.7 };
    const next = setRateForYear(original, 2027, 0.72);
    expect(next).toEqual({ "2026": 0.7, "2027": 0.72 });
    expect(original).toEqual({ "2026": 0.7 });
  });

  it("clears a year when given zero or less", () => {
    expect(setRateForYear({ "2026": 0.7 }, 2026, 0)).toEqual({});
  });

  it("caps absurd values", () => {
    expect(setRateForYear({}, 2026, 999)["2026"]).toBe(10);
  });
});

describe("ratedYears / hasOwnRate", () => {
  it("lists explicit years newest first", () => {
    expect(ratedYears(s({ "2024": 0.67, "2026": 0.7, "2025": 0.67 }))).toEqual([2026, 2025, 2024]);
  });
  it("distinguishes an inherited rate from an explicit one", () => {
    expect(hasOwnRate(s({ "2026": 0.7 }), 2026)).toBe(true);
    expect(hasOwnRate(s({ "2026": 0.7 }), 2027)).toBe(false);
  });
});
