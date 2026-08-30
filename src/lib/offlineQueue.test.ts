import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * The queue outlives a session on a shared browser, so the thing worth pinning
 * is that it never hands one person's receipt to another.
 */

// Minimal in-memory stand-in for the one IndexedDB store the queue uses.
type Item = { id: string; userId: string; blob: Blob; name: string; queuedAt: string };
let store: Item[] = [];

vi.mock("../pwa/offlineQueue", async () => {
  const actual = await vi.importActual<typeof import("../pwa/offlineQueue")>("../pwa/offlineQueue");
  return actual;
});

beforeEach(() => {
  store = [];
  const idb = {
    open: () => {
      const req: Record<string, unknown> = {};
      setTimeout(() => {
        req.result = {
          objectStoreNames: { contains: () => true },
          createObjectStore: () => {},
          close: () => {},
          transaction: () => ({
            objectStore: () => ({
              add: (item: Item) => { const r: Record<string, unknown> = {}; store.push(item); setTimeout(() => (r.onsuccess as () => void)?.(), 0); return r; },
              getAll: () => { const r: Record<string, unknown> = {}; setTimeout(() => { r.result = [...store]; (r.onsuccess as () => void)?.(); }, 0); return r; },
              delete: (id: string) => { const r: Record<string, unknown> = {}; store = store.filter((i) => i.id !== id); setTimeout(() => (r.onsuccess as () => void)?.(), 0); return r; },
            }),
          }),
        };
        (req.onsuccess as () => void)?.();
      }, 0);
      return req;
    },
  };
  vi.stubGlobal("indexedDB", idb);
});

const file = (name: string) => new File([new Uint8Array([1, 2, 3])], name, { type: "image/jpeg" });

describe("offline receipt queue", () => {
  it("keeps each user's photos to themselves", async () => {
    const { queueReceipt, queuedReceipts } = await import("../pwa/offlineQueue");
    await queueReceipt(file("a.jpg"), "user-a");
    await queueReceipt(file("b.jpg"), "user-b");

    expect((await queuedReceipts("user-a")).map((r) => r.name)).toEqual(["a.jpg"]);
    expect((await queuedReceipts("user-b")).map((r) => r.name)).toEqual(["b.jpg"]);
  });

  it("never uploads another user's queued receipt", async () => {
    // The shared-device case: A queues offline, signs out, B signs in.
    const { queueReceipt, flushQueue } = await import("../pwa/offlineQueue");
    await queueReceipt(file("private-a.jpg"), "user-a");

    const uploaded: string[] = [];
    const result = await flushQueue(async (f) => { uploaded.push(f.name); }, "user-b");

    expect(uploaded).toEqual([]);
    expect(result.uploaded).toBe(0);
  });

  it("uploads and clears only the owner's items", async () => {
    const { queueReceipt, flushQueue, queuedReceipts } = await import("../pwa/offlineQueue");
    await queueReceipt(file("a.jpg"), "user-a");
    await queueReceipt(file("b.jpg"), "user-b");

    const uploaded: string[] = [];
    await flushQueue(async (f) => { uploaded.push(f.name); }, "user-a");

    expect(uploaded).toEqual(["a.jpg"]);
    expect((await queuedReceipts("user-b")).map((r) => r.name)).toEqual(["b.jpg"]);
    expect(await queuedReceipts("user-a")).toEqual([]);
  });

  it("stops on the first failure and keeps the rest queued", async () => {
    const { queueReceipt, flushQueue, queuedReceipts } = await import("../pwa/offlineQueue");
    await queueReceipt(file("1.jpg"), "u");
    await queueReceipt(file("2.jpg"), "u");

    const result = await flushQueue(async () => { throw new Error("offline"); }, "u");
    expect(result.uploaded).toBe(0);
    expect((await queuedReceipts("u")).length).toBe(2);
  });

  it("refuses to queue without a signed-in user", async () => {
    const { queueReceipt } = await import("../pwa/offlineQueue");
    await expect(queueReceipt(file("x.jpg"), "")).rejects.toThrow(/signed in/i);
  });
});
