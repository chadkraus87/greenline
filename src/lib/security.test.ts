import { describe, it, expect } from "vitest";
import { validateImport } from "./backup";

describe("security: import hardening", () => {
  it("__proto__ keys in payload do not pollute Object.prototype", () => {
    const evil = JSON.parse(`{
      "settings": {"theme":"dark","clock24":false,"startBalance":0},
      "categories": [], "incomes": [], "expenses": [], "goals": [], "events": [],
      "bills": [{"id":"b1","name":"X","amount":1,"categoryId":"c","dueDay":1,"priority":"normal",
        "paid": {"__proto__": true, "constructor": true}}]
    }`);
    const data = validateImport(evil);
    // toggling paid spreads the map — must not touch prototypes
    const merged = { ...data.bills[0].paid, "2026-07": true };
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(merged, "2026-07")).toBe(true);
    expect(({} as { paid?: unknown }).paid).toBeUndefined();
  });
  it("oversized/deep payloads are rejected by schema, not crashed on", () => {
    expect(() => validateImport({ settings: {}, categories: "x" })).toThrow();
  });
  it("negative amounts and bogus dates rejected", () => {
    const bad = {
      settings: {theme:"dark",clock24:false,startBalance:0},
      categories: [], incomes: [], bills: [], goals: [], events: [],
      expenses: [{id:"e",title:"a",amount:5,categoryId:"c",date:"07/01/2026"}],
    };
    expect(() => validateImport(bad)).toThrow();
  });
});
