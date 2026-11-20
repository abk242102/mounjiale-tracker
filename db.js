/* 本機資料庫：IndexedDB。所有紀錄先寫入本機，無網路也可使用。 */
const TrackerDB = (() => {
  const DB_NAME = "mounjiale-tracker";
  const DB_VERSION = 1;
  const STORES = ["injections", "weights", "water", "purchases", "meta"];
  let dbPromise;

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        for (const name of STORES) {
          if (!db.objectStoreNames.contains(name)) {
            const store = db.createObjectStore(name, { keyPath: "id" });
            if (name !== "meta") store.createIndex("date", "date", { unique: false });
          }
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return dbPromise;
  }

  async function all(storeName) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, "readonly");
      const req = tx.objectStore(storeName).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  async function put(storeName, item) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, "readwrite");
      tx.objectStore(storeName).put(item);
      tx.oncomplete = () => resolve(item);
      tx.onerror = () => reject(tx.error);
    });
  }

  async function remove(storeName, id) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, "readwrite");
      tx.objectStore(storeName).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function getMeta(id) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const req = db.transaction("meta", "readonly").objectStore("meta").get(id);
      req.onsuccess = () => resolve(req.result?.value);
      req.onerror = () => reject(req.error);
    });
  }

  async function setMeta(id, value) { return put("meta", { id, value }); }

  async function snapshot() {
    const result = {};
    for (const name of STORES.filter(x => x !== "meta")) result[name] = await all(name);
    result.settings = (await getMeta("settings")) || { waterGoal: 2000 };
    result.updatedAt = new Date().toISOString();
    return result;
  }

  async function replaceAll(data) {
    const db = await open();
    const names = STORES.filter(x => x !== "meta");
    await new Promise((resolve, reject) => {
      const tx = db.transaction(names, "readwrite");
      for (const name of names) {
        const store = tx.objectStore(name);
        store.clear();
        for (const item of (data[name] || [])) store.put(item);
      }
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    await setMeta("settings", data.settings || { waterGoal: 2000 });
  }

  return { open, all, put, remove, getMeta, setMeta, snapshot, replaceAll };
})();