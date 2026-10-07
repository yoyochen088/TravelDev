# 專案規則

## Service Worker 版本號

每次修改 `index.html`、`app.js`、`style.css` 或 `manifest.json` 任何一個檔案時，必須同時將 `sw.js` 中的 `CACHE_NAME` 版本號 +1。

例如：`'travel-helper-v3'` → `'travel-helper-v4'`

這是為了讓 PWA 使用者在下次開啟 APP 時自動取得最新版本。

## 更新記錄

每次對專案進行修改後，必須在 `CHANGELOG.md` 頂部新增一筆記錄，格式如下：

```
## vXX — YYYY/MM/DD

- 新增/修正/調整：簡短描述改了什麼
```

版本號對應 `sw.js` 的 `CACHE_NAME` 版本號。
