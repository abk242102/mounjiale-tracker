/*
 * Google Drive 同步（瀏覽器 OAuth Token Model）。
 * 需在 Google Cloud 建立 OAuth 2.0 Web application Client ID，
 * 並將正式 GitHub Pages origin 加入 Authorized JavaScript origins。
 * 不需要、也不可在前端放置 Client Secret。
 */
const DriveSync = (() => {
  const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
  const FOLDER_NAME = "猛健樂紀錄";
  const DATA_FILE = "records.enc.json";
  let tokenClient = null;
  let accessToken = null;
  let folderId = null;
  let passphrase = "";
  let syncTimer = null;
  let syncing = false;
  let syncAgain = false;
  const config = () => JSON.parse(localStorage.getItem("mounjiale_sync_config") || "{}");

  const status = (text) => {
    const el = document.getElementById("syncStatus");
    if (el) el.textContent = text;
    const msg = document.getElementById("driveMessage");
    if (msg) msg.textContent = text;
  };
  const b64 = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes)));
  const unb64 = str => Uint8Array.from(atob(str), c => c.charCodeAt(0));
  async function deriveKey(secret, salt) {
    const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), "PBKDF2", false, ["deriveKey"]);
    return crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations: 250000, hash: "SHA-256" }, material, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  }
  async function encryptObject(obj, secret) {
    if (!secret || secret.length < 10) throw new Error("加密密語至少需要 10 個字元。");
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveKey(secret, salt);
    const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(JSON.stringify(obj)));
    return { version: 1, algorithm: "AES-GCM", kdf: "PBKDF2-SHA256", iterations: 250000, salt: b64(salt), iv: b64(iv), data: b64(cipher) };
  }
  async function decryptObject(payload, secret) {
    if (payload.version !== 1) throw new Error("不支援的雲端備份格式。");
    const key = await deriveKey(secret, unb64(payload.salt));
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(payload.iv) }, key, unb64(payload.data));
    return JSON.parse(new TextDecoder().decode(plain));
  }
  async function api(path, options = {}) {
    const response = await fetch("https://www.googleapis.com/drive/v3" + path, {
      ...options,
      headers: { Authorization: `Bearer ${accessToken}`, ...(options.headers || {}) }
    });
    if (!response.ok) throw new Error(`Google Drive API 錯誤 ${response.status}：${await response.text()}`);
    return response.status === 204 ? null : response.json();
  }
  async function findFolder() {
    const q = encodeURIComponent(`name='${FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
    const result = await api(`/files?q=${q}&fields=files(id,name)&spaces=drive`);
    if (result.files?.length) return result.files[0].id;
    const created = await api("/files?fields=id", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: FOLDER_NAME, mimeType: "application/vnd.google-apps.folder" })
    });
    return created.id;
  }
  async function findDataFile() {
    const q = encodeURIComponent(`name='${DATA_FILE}' and '${folderId}' in parents and trashed=false`);
    const result = await api(`/files?q=${q}&fields=files(id,name,modifiedTime)&spaces=drive`);
    return result.files?.[0] || null;
  }
  async function readFile(id) {
    const response = await fetch(`https://www.googleapis.com/drive/v3/files/${id}?alt=media`, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!response.ok) throw new Error(`讀取雲端資料失敗：${response.status}`);
    return response.json();
  }
  async function writeFile(id, encrypted) {
    const metadata = { name: DATA_FILE, mimeType: "application/json", ...(id ? {} : { parents: [folderId] }) };
    const boundary = "mounjiale_boundary";
    const body = `--${boundary}\r
Content-Type: application/json; charset=UTF-8\r
\r
${JSON.stringify(metadata)}\r
--${boundary}\r
Content-Type: application/json\r
\r
${JSON.stringify(encrypted)}\r
--${boundary}--`;
    const url = id
      ? `https://www.googleapis.com/upload/drive/v3/files/${id}?uploadType=multipart`
      : "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart";
    const response = await fetch(url, { method: id ? "PATCH" : "POST", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": `multipart/related; boundary=${boundary}` }, body });
    if (!response.ok) throw new Error(`寫入雲端資料失敗：${response.status}`);
    return response.json();
  }
  function merge(local, cloud) {
    const merged = {};
    for (const key of ["injections", "weights", "water", "purchases"]) {
      const map = new Map();
      for (const item of [...(cloud[key] || []), ...(local[key] || [])]) {
        const previous = map.get(item.id);
        if (!previous || (item.updatedAt || "") >= (previous.updatedAt || "")) map.set(item.id, item);
      }
      merged[key] = [...map.values()];
    }
    merged.settings = local.settings || cloud.settings || { waterGoal: 2000 };
    merged.updatedAt = new Date().toISOString();
    return merged;
  }
  async function connect(clientId, secret) {
    if (!clientId || !clientId.includes(".apps.googleusercontent.com")) throw new Error("請輸入正確的 Google OAuth Client ID。");
    if (!secret || secret.length < 10) throw new Error("請設定至少 10 個字元的加密密語。");
    if (!window.google?.accounts?.oauth2) throw new Error("Google 授權程式尚未載入，請確認網路後重整頁面。");
    passphrase = secret;
    return new Promise((resolve, reject) => {
      tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: clientId, scope: DRIVE_SCOPE,
        callback: async response => {
          if (response.error) { reject(new Error(response.error)); return; }
          accessToken = response.access_token;
          try {
            folderId = await findFolder();
            localStorage.setItem("mounjiale_google_client_id", clientId);
            const c=config(); c.configured=true; localStorage.setItem("mounjiale_sync_config",JSON.stringify(c));
            status("Google Drive 已連結");
            await sync();
            resolve();
          } catch (error) { reject(error); }
        },
        error_callback: error => reject(new Error(error.message || "Google 授權失敗"))
      });
      tokenClient.requestAccessToken({ prompt: "consent" });
    });
  }
  async function sync() {
    if (syncing) { syncAgain = true; return; }
    if (!navigator.onLine) { markPending("離線・待同步"); return; }
    if (!accessToken || !folderId || !passphrase) throw new Error("請重新授權 Google Drive 並輸入加密密語。");
    syncing = true;
    status("同步中…");
    try {
      const local = await TrackerDB.snapshot();
      const file = await findDataFile();
      if (!file) {
        await writeFile(null, await encryptObject(local, passphrase));
        markSuccess();
        return local;
      }
      const encryptedCloud = await readFile(file.id);
      let cloud;
      try { cloud = await decryptObject(encryptedCloud, passphrase); }
      catch { throw new Error("無法解密雲端資料。請確認加密密語；雲端與本機資料均未變更。"); }
      const merged = merge(local, cloud);
      await writeFile(file.id, await encryptObject(merged, passphrase));
      await TrackerDB.replaceAll(merged);
      markSuccess();
      return merged;
    } catch (error) {
      markPending("同步失敗・待重試");
      throw error;
    } finally {
      syncing = false;
      if (syncAgain) {
        syncAgain = false;
        clearTimeout(syncTimer);
        syncTimer = setTimeout(() => {
          if (accessToken && passphrase && navigator.onLine) sync().catch(() => markPending("同步失敗・待重試"));
        }, 300);
      }
    }
  }
  function markPending(message = "待同步") { const c=config(); c.pending=true; localStorage.setItem("mounjiale_sync_config",JSON.stringify(c)); status(message); }
  function markSuccess() { const c=config(); c.pending=false; c.lastSyncedAt=new Date().toISOString(); localStorage.setItem("mounjiale_sync_config",JSON.stringify(c)); status("已同步・"+new Date(c.lastSyncedAt).toLocaleString("zh-TW",{dateStyle:"short",timeStyle:"short"})); }
  function localChanged() {
    markPending(navigator.onLine ? "有未同步變更" : "離線・待同步");
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => {
      if (accessToken && passphrase && navigator.onLine) sync().catch(() => markPending("同步失敗・待重試"));
      else if (syncing) syncAgain = true;
    }, 1200);
  }
  function resumeSync() {
    if (accessToken && passphrase && navigator.onLine) {
      sync().catch(() => markPending("同步失敗・待重試"));
    } else if (config().configured) {
      status(config().pending ? "有待同步資料・請重新授權並輸入密語" : "同步已設定・請重新授權並輸入密語");
    }
  }
  function initialize() {
    const c = config();
    if (c.configured) {
      const last = c.lastSyncedAt ? new Date(c.lastSyncedAt).toLocaleString("zh-TW", {dateStyle:"short",timeStyle:"short"}) : "尚無";
      status((c.pending ? "有待同步資料" : "雲端同步已設定") + "・上次同步 " + last + "・重新開啟需授權");
    } else {
      status("尚未設定同步");
    }
    window.addEventListener("online", resumeSync);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") resumeSync();
    });
  }
  function disconnect() {
    if (accessToken && window.google?.accounts?.oauth2) google.accounts.oauth2.revoke(accessToken);
    accessToken = null; folderId = null; tokenClient = null; passphrase = "";
    status("尚未連結 Google Drive");
  }
  return { connect, sync, disconnect, status, localChanged, initialize };
})();