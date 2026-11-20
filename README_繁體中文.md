# 猛健樂紀錄 PWA

此專案為 iPhone Safari 可使用的個人紀錄工具，包含注射、體重、喝水、購買紀錄。資料先儲存在瀏覽器 IndexedDB。

## 目前功能

- 注射日期時間、劑量（2.5、5、7.5、10、12.5、15 mg 或自訂）、腹部八區位置標籤、備註。
- 每日一筆體重，折線圖／列表切換，近 7／30／90 天或全部。
- 喝水 250／500 ml 快速新增、自訂容量、每日目標（預設 2000 ml）。
- 購買日期、金額、數量、單位平均金額及累計花費。
- IndexedDB 本機儲存、離線快取、JSON 匯出與還原。
- Google Drive 可見資料夾同步程式碼（需自行完成 Google Cloud OAuth 設定）。

## 重要限制與安全

1. GitHub Pages 的程式碼是公開的。不要把健康紀錄、OAuth Token、密碼或 Client Secret 放入 Repository。
2. Google Drive 同步需要你自己的 OAuth Client ID。此專案使用 Google Identity Services 的瀏覽器 Token Model，沒有把 Client Secret 放在前端。
3. Google Drive 同步目前以單一加密 JSON 檔保存資料。加密使用 Web Crypto AES-GCM + PBKDF2。加密密語不會上傳，遺失密語即無法解密雲端檔案。
4. 目前合併規則以每筆紀錄 `updatedAt` 較新者為準；刪除使用 tombstone。若兩台裝置離線時同時編輯同一筆，仍應先在一台完成同步，再於另一台同步。這不是具備伺服器交易鎖的即時協作系統。
5. Google access token 僅保存在頁面記憶體。重新載入或過期後需重新按「連結 Google Drive」授權。
6. 本工具只供個人紀錄，不提供診斷或用藥劑量建議。腹部八區是記錄標籤，不是醫療定位指示；實際注射請依藥品仿單及醫療人員指示。
7. 上線前請先用測試資料測試匯出、還原、離線和同步，不要只保留單一份重要資料。

## A. 建立 GitHub Pages

1. 登入 GitHub，打開 `https://github.com/abk242102/mounjiale-tracker`。
2. 將本 ZIP 解壓縮。
3. 在 Repository 頁面按 `Add file` → `Upload files`。
4. 上傳 `mounjiale-tracker` 資料夾內的所有檔案與 `icons` 資料夾內容（不要只上傳外層 ZIP）。
5. 按 `Commit changes`。
6. 進入 Repository 的 `Settings` → `Pages`。
7. 在 `Build and deployment` 選 `Deploy from a branch`。
8. Branch 選 `main`，資料夾選 `/(root)`，按 `Save`。
9. 等待部署完成，網址應為 `https://abk242102.github.io/mounjiale-tracker/`。

## B. iPhone 加入主畫面

1. 用 iPhone Safari 開啟 `https://abk242102.github.io/mounjiale-tracker/`。
2. 點分享按鈕。
3. 選「加入主畫面」。
4. 名稱使用「猛健樂紀錄」，按「加入」。
5. 之後從主畫面圖示開啟。

## C. Google Drive OAuth 設定

1. 開啟 Google Cloud Console：`https://console.cloud.google.com/`，用自己的 Google 帳號登入。
2. 建立一個新專案，例如 `mounjiale-tracker`。
3. 在「API 和服務」→「程式庫」搜尋並啟用 **Google Drive API**。
4. 設定 OAuth 同意畫面（Google Auth Platform）：填入 App 名稱、使用者支援電子郵件及開發人員聯絡信箱。
5. 若應用程式處於 Testing，將自己的 Google 帳號加入 Test users。
6. 建立 OAuth Client ID，應用程式類型選 **Web application**。
7. Authorized JavaScript origins 加入：`https://abk242102.github.io`
8. 不需要設定 redirect URI（此範例使用 Google Identity Services Token Model）。
9. 複製 Client ID（結尾為 `.apps.googleusercontent.com`），不要複製或建立 Client Secret 給前端使用。
10. 在 App「設定與備份」貼上 Client ID，輸入自行設定的加密密語（至少 10 字元，請妥善保管）。
11. 按「連結 Google Drive」，選擇自己的 Google 帳號並授權。
12. 首次同步會在 Google Drive 建立「猛健樂紀錄」資料夾及加密檔案 `records.enc.json`。

注意：Google OAuth 同意畫面、測試使用者及驗證要求會依 Google 帳戶與專案狀態而不同。若畫面要求額外驗證，依 Google Console 顯示處理。不要將 Client Secret 放入 GitHub。

## D. 建議測試順序

1. 新增一筆注射、體重、喝水及購買紀錄。
2. 重新整理頁面，確認資料仍存在。
3. 匯出 JSON，並測試在空白測試環境還原。
4. 完成 Google 授權後，按立即同步。
5. 用同一 Google 帳號在另一台裝置開啟 App，輸入相同加密密語並同步。
6. 離線新增一筆測試資料，恢復網路後同步。
7. 確認 Drive 資料夾中只有加密檔，不含明文健康紀錄。

## 檔案結構

```text
mounjiale-tracker/
├── index.html
├── styles.css
├── db.js
├── sync.js
├── app.js
├── manifest.json
├── service-worker.js
├── .nojekyll
├── README_繁體中文.md
└── icons/
    ├── icon-192.png
    └── icon-512.png
```
