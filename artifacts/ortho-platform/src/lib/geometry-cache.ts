const DB_NAME = "orthovision-geometry-cache";
const DB_VERSION = 1;
const STORE_NAME = "geometries";
const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

interface CachedGeometry {
  key: string;
  positions: Float32Array;
  normals?: Float32Array;
  indices?: Uint32Array;
  timestamp: number;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME, { keyPath: "key" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function cacheGeometry(
  key: string,
  positions: Float32Array,
  normals?: Float32Array,
  indices?: Uint32Array
): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    const entry: CachedGeometry = { key, positions, normals, indices, timestamp: Date.now() };
    tx.objectStore(STORE_NAME).put(entry);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // Silently fail — caching is optional
  }
}

export async function getCachedGeometry(
  key: string
): Promise<{ positions: Float32Array; normals?: Float32Array; indices?: Uint32Array } | null> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readonly");
    const result = await new Promise<CachedGeometry | undefined>((resolve, reject) => {
      const req = tx.objectStore(STORE_NAME).get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    db.close();
    if (!result) return null;
    if (Date.now() - result.timestamp > TTL_MS) {
      await evictCacheEntry(key);
      return null;
    }
    return { positions: result.positions, normals: result.normals, indices: result.indices };
  } catch {
    return null;
  }
}

export async function evictCacheEntry(key: string): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(key);
    db.close();
  } catch {
    // ignore
  }
}

export async function clearGeometryCache(): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).clear();
    db.close();
  } catch {
    // ignore
  }
}

export async function getGeometryCacheStats(): Promise<{ count: number; oldestMs: number }> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readonly");
    const entries = await new Promise<CachedGeometry[]>((resolve, reject) => {
      const req = tx.objectStore(STORE_NAME).getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    db.close();
    const oldest = entries.reduce((min, e) => Math.min(min, e.timestamp), Date.now());
    return { count: entries.length, oldestMs: Date.now() - oldest };
  } catch {
    return { count: 0, oldestMs: 0 };
  }
}
