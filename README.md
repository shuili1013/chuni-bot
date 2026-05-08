# CHUNITHM Plate Generator

一個 bookmarklet 工具，登入 CHUNITHM-NET 國際版後一鍵產生「最近三首遊玩紀錄」的成績圖卡 PNG。

全程 client-side、無後端、無資料外傳。

## 檔案

- `plate-generator.js` — 主腳本（IIFE，由 bookmarklet 動態載入）
- `index.html` — 落地頁，提供 bookmarklet 拖曳安裝
- `README.md` — 本文件

## 用法

1. 部署本 repo 到 GitHub Pages（見下方 Deploy）。
2. 開啟 `https://shuili1013.github.io/chuni-bot/`，把按鈕拖到書籤列。
3. 登入 https://chunithm-net-eng.com/ 後，點書籤列上的書籤。
4. 等幾秒，圖卡會顯示在畫面中央，按「下載 PNG」存檔。

## Deploy

### GitHub Pages

1. 把這個目錄推到 `https://github.com/shuili1013/chuni-bot`。
2. Settings → Pages → Source 選 `Deploy from branch`，branch 選 `main` / root。
3. 等 GitHub 部署完成（通常 1–2 分鐘），網址會是 `https://shuili1013.github.io/chuni-bot/`。

### Bookmarklet 模板

`index.html` 內已內建。手動寫的話：

```javascript
javascript:(function(d,s){
  s=d.createElement('script');
  s.src='https://shuili1013.github.io/chuni-bot/plate-generator.js?t='+Math.floor(Date.now()/60000);
  d.body.append(s);
})(document);
```

`?t=` 是 cache buster（每分鐘變一次），更新後使用者不用重新加書籤。

### 自訂網域（選用）

repo 根目錄放 `CNAME` 檔案 + DNS 加 CNAME 指向 `{帳號}.github.io`，記得把 `index.html` 內的網域字串也改掉。

## 開發

直接在這個 repo 改 `plate-generator.js`，commit + push 就好。沒有 build step。

本機測試：
```powershell
# 起一個簡單的靜態 server
python -m http.server 8000
# 然後手動把 bookmarklet 改成 http://localhost:8000/plate-generator.js 拖到書籤列
```

## Debug

腳本會在 console 印 `[Plate] ...` 開頭的 log。回報問題時，請：

1. 開 DevTools Console（F12）。
2. 在 CHUNITHM-NET 已登入頁面點書籤。
3. 把 console 內所有 `[Plate]` 訊息貼上來。

## 已知限制

- 僅支援國際版 `chunithm-net-eng.com`，日版未支援。
- 依賴 SEGA 頁面 HTML 結構，改版可能導致欄位顯示為空或 0。selector 全部有 fallback，但極端情況可能整個欄位抓不到。
- arcade-songs 若無回應或無 CORS 標頭，會 fallback 到 SEGA 自帶封面。
- html2canvas 對 CSS 支援不完整，已避用 `gap`、CSS 變數。

## License

MIT 或自訂；非 SEGA / CHUNITHM 官方產品。
