/** Binary asset storage in IndexedDB. Models never leave the browser. */
const DB = 'awaken-assets', STORE = 'blobs';

export interface AssetRecord { id: string; name: string; type: 'glb' | 'image'; data: ArrayBuffer; thumb?: string }

const open = (): Promise<IDBDatabase> => new Promise((res, rej) => {
  const r = indexedDB.open(DB, 1);
  r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'id' });
  r.onsuccess = () => res(r.result);
  r.onerror = () => rej(r.error);
});

const tx = async <T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> => {
  const db = await open();
  return new Promise((res, rej) => {
    const r = fn(db.transaction(STORE, mode).objectStore(STORE));
    r.onsuccess = () => { db.close(); res(r.result); };
    r.onerror = () => { db.close(); rej(r.error); };
  });
};

export const putAsset = (a: AssetRecord) => tx('readwrite', (s) => s.put(a));
export const getAsset = (id: string) => tx<AssetRecord | undefined>('readonly', (s) => s.get(id));
export const listAssets = () => tx<AssetRecord[]>('readonly', (s) => s.getAll());
export const deleteAsset = (id: string) => tx('readwrite', (s) => s.delete(id));
