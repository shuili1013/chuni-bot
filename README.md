# CHUNI Bot

把 CHUNITHM-NET 國際版的成績用 bookmarklet 抓下來、同步到 Discord bot，再用 `/rs` 一指挑歌生成圖卡。

```
[CHUNITHM-NET] → bookmarklet 抓資料 → 你的 Bot server → Discord
```

## 兩種用法

### 1. Discord bot（推薦）

1. 把 bot 邀請到你的 Discord server。
2. 打 `/bind` → bot 給你一個 `https://shuili1013.github.io/chuni-bot/bind/?u=...` 連結。
3. 開連結 → 把按鈕拖到書籤列。
4. 登入 chunithm-net-eng.com → 點書籤 → 看到「✓ 同步完成」。
5. 回 Discord 用 `/rs` 挑歌，bot 直接回成績圖卡。

**指令清單**
- `/bind [rotate]` — 取得綁定書籤；`rotate:true` 重新發 token，舊書籤失效
- `/rs [limit]` — 從歷史挑一首，產圖卡（1056×594 PNG）
- `/profile` — 顯示玩家資料卡
- `/unbind` — 解除綁定並刪資料

### 2. 純 bookmarklet（不用 bot）

`https://shuili1013.github.io/chuni-bot/` 上有「CHUNI Plate (Local)」按鈕，拖到書籤列，會在頁面 overlay 顯示最近 3 場合併圖卡可下載。

---

## 檔案結構

```
chuni-bot/
├── index.html              # 落地頁（local 模式書籤）
├── bind/index.html         # 綁定頁（從 /bind?u=token 載入）
├── plate-generator.js      # 主腳本（local 與 sync 模式合一）
├── server/                 # Discord bot + sync API（部署在 Fly.io）
│   ├── src/
│   │   ├── index.js
│   │   ├── db.js
│   │   ├── sync.js
│   │   ├── render.js
│   │   ├── theme.js
│   │   └── commands/
│   │       ├── bind.js
│   │       ├── rs.js
│   │       ├── profile.js
│   │       └── unbind.js
│   ├── deploy-commands.js  # 註冊 slash commands
│   ├── package.json
│   ├── Dockerfile
│   ├── fly.toml
│   └── .env.example
└── README.md
```

---

## 部署 Bot Server

### 步驟 1：建立 Discord Application

1. 開 https://discord.com/developers/applications → **New Application**。
2. 左側 **Bot** → **Reset Token** → 複製 Bot Token（之後 `.env` 用）。
3. **General Information** 抓 Application ID。
4. 左側 **OAuth2** → **URL Generator**：
   - Scopes 勾 `bot` + `applications.commands`
   - Bot Permissions 勾 `Send Messages` + `Embed Links` + `Attach Files`
   - 複製產出的 URL，用瀏覽器開、選你要邀請的 server。

### 步驟 2：本機準備

```powershell
cd server
copy .env.example .env
# 編輯 .env：填入 DISCORD_TOKEN, DISCORD_CLIENT_ID, PUBLIC_BASE_URL
npm install
node deploy-commands.js   # 註冊全域 slash commands（最多等 1 小時生效）
# 想立即生效就在 .env 加 DISCORD_GUILD_ID=你的測試 server id，再跑一次
```

### 步驟 3：Fly.io 部署

```powershell
# 先安裝 flyctl: https://fly.io/docs/hands-on/install-flyctl/
fly auth login
cd server
fly launch --no-deploy   # 第一次：建立 app，注意把 fly.toml 內 app name 改成 fly 給你的名字
fly volumes create chuni_data --size 1 --region nrt
fly secrets set DISCORD_TOKEN=xxx DISCORD_CLIENT_ID=yyy PUBLIC_BASE_URL=https://shuili1013.github.io/chuni-bot
fly deploy
```

部署成功後，你會拿到 `https://你的-app.fly.dev`，把這個網址設給 `bind.js` 裡的綁定連結（透過 `/bind` 指令發出來的網址會帶 `b=` 參數指到這裡）。實作上：你需要修改 `commands/bind.js` 把 base 參數放進連結。

> **注意**：Fly.io 免費額度 256MB ×3 應該夠用；SQLite 寫在 mounted volume `/data` 確保重啟不掉資料。

### 步驟 4：本機跑 dev（不用 Fly.io）

```powershell
cd server
npm run dev
# 另外開 cloudflared / ngrok 把 8080 暴露出去，bookmarklet 才連得到
```

---

## 開發

主要程式：
- 抓 SEGA 資料：[plate-generator.js](plate-generator.js)
- 圖卡渲染：[server/src/render.js](server/src/render.js)
- DB schema：[server/src/db.js](server/src/db.js)
- Slash commands：[server/src/commands/](server/src/commands/)

## 已知限制

- 僅支援國際版 `chunithm-net-eng.com`。
- 一次只能抓 SEGA playlog 上限 20 場；多場 sync 會累積到 DB 但首次 bind 只能拿到當下 20 場。
- 譜面常數（譜面 Lv）SEGA 不顯示，arcade-songs CORS 擋住，所以圖卡裡沒譜面難度數字。
- Free-tier Fly.io 機器跑久可能進入 sleep；首次互動可能慢 2 秒。

## License

MIT。非 SEGA / CHUNITHM 官方產品。
