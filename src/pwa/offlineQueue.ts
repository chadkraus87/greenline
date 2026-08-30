/**
 * Holds receipt photos taken with no usable connection.
 *
 * A contractor photographing receipts on a job site often has no signal, and
 * losing the photo means losing the deduction — the paper is usually gone by
 * the time they notice. Photos are parked in IndexedDB (localStorage can't
 * hold an image) and uploaded when the connection returns.
 *
 * They can't be *scanned* offline, so an upload lands them in the Receipts
 * vault as unfiled — where the existing "File" action turns one into an
 * expense.
 */

const DB_NAME = "greenline-offline";
const STORE = "receipts";
const DB_VERSION = 1;

export interface QueuedReceipt {
  id: string;
  /**
   * Who took the photo.
   *
   * The queue outlives a session, and the browser is shared: without this, a
   * receipt photographed offline by one person would upload into the storage
   * of whoever signed in next — handing them someone else's receipt.
   */
  userId: string;
  blob: Blob;
  name: string;
  queuedAt: string;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Private browsing and locked-down browsers can refuse IndexedDB outright. */
export const offlineQueueAvailable = (): boolean =>
  typeof indexedDB !== "undefined";

async function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const req = run(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

export async function queueReceipt(file: File, userId: string): Promise<void> {
  if (!userId) throw new Error("Not signed in");
  const item: QueuedReceipt = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    userId,
    blob: file,
    name: file.name || "receipt.jpg",
    queuedAt: new Date().toISOString(),
  };
  await tx("readwrite", (s) => s.add(item));
}

/** Only this user's queued photos — never anyone else's. */
export async function queuedReceipts(userId: string): Promise<QueuedReceipt[]> {
  if (!offlineQueueAvailable() || !userId) return [];
  try {
    const all = await tx<QueuedReceipt[]>("readonly", (s) => s.getAll() as IDBRequest<QueuedReceipt[]>);
    return all
      .filter((r) => r.userId === userId)
      .sort((a, b) => a.queuedAt.localeCompare(b.queuedAt));
  } catch {
    return [];
  }
}

export const queuedCount = async (userId: string): Promise<number> => (await queuedReceipts(userId)).length;

async function removeQueued(id: string): Promise<void> {
  await tx("readwrite", (s) => s.delete(id));
}

/**
 * Uploads everything queued, oldest first.
 *
 * A failure stops the run and leaves the rest queued — if the connection is
 * still bad, hammering it just burns battery, and nothing is ever dropped.
 */
export async function flushQueue(
  upload: (file: File) => Promise<unknown>,
  userId: string,
): Promise<{ uploaded: number; remaining: number }> {
  const items = await queuedReceipts(userId);
  let uploaded = 0;
  for (const item of items) {
    try {
      await upload(new File([item.blob], item.name, { type: item.blob.type || "image/jpeg" }));
      await removeQueued(item.id);
      uploaded++;
    } catch {
      break;
    }
  }
  return { uploaded, remaining: items.length - uploaded };
}
