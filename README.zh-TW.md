<div align="center">

<img src="icon.png" alt="DSH" width="120" height="120">

# DSH

**把一個網頁直接開在 VS Code 聊天面板裡的分頁。**
用一個文字檔指定網址，指向 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 或任何本機網頁應用。

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![VS Code](https://img.shields.io/badge/VS%20Code-%5E1.104-007ACC.svg)](https://code.visualstudio.com/)
[![Status: early preview](https://img.shields.io/badge/status-early%20preview-orange.svg)](#狀態)

[English](README.md) | **繁體中文**

</div>

> [!NOTE]
> DSH 是獨立的社群專案，與 DeepSeek 官方無隸屬關係，也未經其背書或發行。

<!--
展示圖：把截圖放到 docs/screenshots/sidebar.png，再把下面那行註解打開。
<p align="center"><img src="docs/screenshots/sidebar.png" alt="DSH 分頁與 VS Code 聊天面板並排" width="720"></p>
-->

## 為什麼要做這個

DeepSeek Harness 本身有瀏覽器介面（`dsh web`，通常跑在 `http://127.0.0.1:3080`）。DSH 把那個頁面——或任何其他網址——放到你本來就在工作的地方：VS Code **聊天面板**裡的一個分頁，和 Copilot Chat、Claude 並排。

網址放在一個純文字檔裡，換端點就是改一行字。不用同步設定、不用寫死連接埠、也不用另外開一個終端機視窗。

## 功能

- **聊天面板分頁。** 在 `secondarySidebar` 容器註冊 webview 檢視，另外嘗試掛進內建的聊天面板容器（`workbench.panel.chat`）。若當前的 VS Code 版本擋掉第三方檢視，側邊欄那個就是主要入口，嘗試失敗只會在 log 留一行 warning。
- **網址來自文字檔。** `dsh.urlFile` 指向一個文字檔，第一個 `http`/`https` 開頭的行即為網址。空行與 `#` 註解會略過，BOM 與外層的 `<`/`"`/`'` 會清掉。檔案一改動，分頁自動重新載入。
- **即時縮放。** `dsh.zoom`（0.25–4）縮放嵌入的頁面，用 `postMessage` 套用，不會重新載入。
- **各視窗獨立 storage。** 每個 VS Code 視窗用自己的代理 origin 載入 loopback 網址，頁面裡的 `localStorage` 不再互相蓋掉。
- **剪貼簿橋接。** 嵌入頁面裡的複製鈕，透過兩層 `postMessage` 橋接寫進真正的系統剪貼簿。需要 [`dsh-vscode-bridge`](https://github.com/rainfishs/dsh-vscode-bridge)，詳見[運作原理](#運作原理)。
- **壞掉也不會爛掉。** 代理起不來時，分頁自動退回直接載入原網址。所有判斷都記在 Output 的 **DSH** 頻道。

## 需求

| 需要什麼 | 為什麼 |
|---|---|
| VS Code 1.104.0 以上 | 這個擴充用到的 webview API。 |
| DeepSeek Harness | 分頁要嵌入的網頁介面。`npm install -g @deepseek-ai/dsh`，再跑 `dsh web`。 |
| [dsh-vscode-bridge](https://github.com/rainfishs/dsh-vscode-bridge) | DSH plugin。它會把 Web GUI 的登入 URL 寫成檔案給 `dsh.urlFile` 讀，並把網頁的剪貼簿寫入轉送給 VS Code——複製鈕才會動。 |
| Node.js 18 以上 | 只有從原始碼建置或跑測試時需要。 |

## 安裝

### 1. 先裝 DSH plugin

[`dsh-vscode-bridge`](https://github.com/rainfishs/dsh-vscode-bridge) 是 DSH 的 profile bundle，負責在 Web GUI 和 VS Code 之間搭橋：把 GUI 的登入 URL 寫成文字檔，並把網頁的剪貼簿寫入轉送給 extension host。

```powershell
dsh plugin --profile web add github:rainfishs/dsh-vscode-bridge
```

設定（`openFileIn`、URL 檔要放哪…）看它自己的 [README](https://github.com/rainfishs/dsh-vscode-bridge)。

### 2. 再裝這個擴充

#### 從 VS Code 商店

在擴充功能面板搜尋 **DSH**，或從終端機：

```powershell
code --install-extension rainfishs.dsh-on-vscode
```

> 商店頁面會隨第一個 `0.0.10` 發行版上線。

#### 從 VSIX 安裝

到 [Releases](https://github.com/rainfishs/dsh-vscode/releases) 下載最新的 `.vsix`，在 VS Code 用 **擴充功能 ▸ … ▸ 從 VSIX 安裝…**。

#### 從原始碼建置

```powershell
git clone https://github.com/rainfishs/dsh-vscode.git
cd dsh-vscode
pnpm install
pnpm package        # 產生 dsh-on-vscode-0.0.10.vsix
```

## 快速開始

1. 啟動 Web GUI（`dsh web`）。裝了 `dsh-vscode-bridge` 的話，登入 URL 會自動寫進 Web profile 目錄的 `web-url.txt`——`%DSH_HOME%\profiles\web\web-url.txt`，沒設 `DSH_HOME` 時是 `%USERPROFILE%\.dsh\profiles\web\web-url.txt`。任何放著一行網址的文字檔也一樣可以用：

   ```text
   # DSH 的網頁介面，或任何其他網址
   http://127.0.0.1:3080
   ```

2. 打開設定（`Ctrl+,`），搜尋 `dsh.urlFile`，填入那個檔案的路徑。絕對路徑、相對於工作區的路徑、`~/…` 都可以。
3. 打開聊天面板（`Ctrl+Shift+I`），選 **URL** 分頁；或從命令面板執行 **DSH: Open URL Tab**。

文字檔一有改動，分頁就會重新載入。

## 設定

| 設定 | 型別 | 預設 | 說明 |
|---|---|---|---|
| `dsh.urlFile` | `string` | `""` | 裝著網址的文字檔路徑。可填絕對路徑、相對於工作區的路徑，或 `~` 開頭。 |
| `dsh.zoom` | `number` | `1` | 嵌入頁面的縮放倍率，會被夾在 `0.25`–`4`。改動即時套用。 |
| `dsh.isolateStorage` | `boolean` | `true` | 讓 loopback 的 `http` 網址走各視窗專屬的代理 origin，把 `localStorage` 依視窗隔離。只有 `127.0.0.0/8`、`localhost`、`::1` 會被代理。 |

## 命令

| 命令 | 標題 |
|---|---|
| `dsh.open` | DSH: Open URL Tab |
| `dsh.reload` | DSH: Reload |
| `dsh.openSettings` | DSH: Open Settings (URL File) |

## 運作原理

**分頁怎麼來的。** 同一個 webview provider 註冊兩次：一次在 `secondarySidebar` 容器（一定有），一次在 `workbench.panel.chat`（內建聊天面板，新版 VS Code 可能拒絕第三方檢視）。頁面本身是一個 `<iframe>`，CSP 寫法照抄 VS Code 內建的 Simple Browser（`frame-src *`），外層再用 CSS 做縮放。

**剪貼簿橋接。** webview 沒辦法把剪貼簿權限往下轉授給第二層的跨來源 iframe，所以父層文件無法代它寫入剪貼簿。改走這條路：

1. 被嵌入的頁面（裝了 [`dsh-vscode-bridge`](https://github.com/rainfishs/dsh-vscode-bridge)）在 `navigator.clipboard.writeText` 掛鉤，主動 `postMessage` `{ type: "copy", text }` 給父層；
2. 中間層——產生出來的 webview HTML 裡的 `<script>`——用 `acquireVsCodeApi()` 轉發；
3. extension host 在 `webview.onDidReceiveMessage` 收到後呼叫 `vscode.env.clipboard.writeText`。

寫入發生在 extension host，不需要 iframe 的任何權限。背景：[microsoft/vscode#182642](https://github.com/microsoft/vscode/issues/182642)。

**各視窗獨立的 storage。** iframe 的 storage 只看 origin，而 VS Code 所有視窗共用同一個 Electron session——兩個視窗都載入 `http://127.0.0.1:3080` 就是共用同一份 `localStorage`。`src/proxy.ts` 為每個視窗開一個 loopback 反向代理，改從 `http://127.0.0.1:<該視窗的埠>` 載入。埠由工作區路徑（沒有資料夾時用 session id）的 hash 推導，所以重開同一個資料夾會落回同一個 origin，頁面狀態不會消失。

轉發時把 `Host`、`Origin`、`Referer` 改寫回上游 authority，因此目標自己的來源檢查（包含 DSH 的 `isTrustedApiRequest` fence 與 host-only 的 `dsh-auth-*` cookie）看不出差別；回應的 `Location` 會改寫回代理 origin；WebSocket 升級也帶著同樣的改寫轉發。代理只綁 `127.0.0.1`，而且只代理 `http` 的 loopback 目標。

## 疑難排解

先開 Output 的 **DSH** 頻道（檢視 ▸ 輸出 ▸ DSH），擴充的每個判斷都寫在那裡。

| 症狀 | 先檢查什麼 |
|---|---|
| 分頁顯示 “No URL configured” | `dsh.urlFile` 是空的。那個頁面上有按鈕可以直接打開設定。 |
| 分頁顯示 “Cannot read that file” | 路徑解析不到，或檔案讀不到。用絕對路徑最保險。 |
| 分頁顯示 “No usable URL in that file” | 沒有以 `http://` 或 `https://` 開頭的行。`#` 開頭的行會被忽略。 |
| 聊天面板裡沒有 **URL** 分頁 | 新版 VS Code 會拒絕第三方檢視掛進 `workbench.panel.chat`。請用次要側邊欄的 DSH 檢視（可能收在 **其他檢視** 底下）。 |
| 頁面正常但複製鈕沒反應 | DSH profile 裡沒裝 `dsh-vscode-bridge`，或它沒有送出 `{ type: "copy" }`。看輸出頻道有沒有 `[Clipboard]` 開頭的行。 |
| 兩個視窗會互相蓋掉狀態 | 確認 `dsh.isolateStorage` 是開的。輸出頻道會印出它選用的代理 origin，例如 `[Proxy] 127.0.0.1:3080 → http://127.0.0.1:43123`。 |
| 升到 0.0.10 之後狀態像被清空 | 這是預期行為，只會發生一次：頁面換到新的 origin，舊的 `http://127.0.0.1:3080` 底下那份 `localStorage` 就看不到了。 |

## 開發

```powershell
pnpm install
pnpm bundle     # esbuild → dist/extension.js
pnpm compile    # tsc --noEmit
pnpm lint       # eslint src
pnpm test       # 打包 src/proxy.ts 後跑 node --test
pnpm check      # compile + lint + test
pnpm package    # → .vsix
```

依賴由 esbuild 包進 `dist/extension.js`，所以打包帶 `--no-dependencies`，VSIX 也不需要 `node_modules`。

在 VS Code 按 `F5` 會開一個 Extension Development Host（`.vscode/launch.json` 會先打包）。

貢獻流程請看 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 狀態

早期預覽。這個擴充刻意保持小：嵌入一個網址，然後閉嘴。`0.0.x` 之間介面仍可能變動，版本紀錄見 [CHANGELOG.md](CHANGELOG.md)。

## 隱私

DSH 不收集任何遙測，也不會自己發出網路請求。它只讀你指定的那個檔案，載入裡面寫的網址。loopback 代理只監聽 `127.0.0.1`，也只轉發到你設定的 loopback 目標；`dsh.isolateStorage: false` 可以整個關掉。

## 授權

[MIT](LICENSE)。

## 致謝

- 剪貼簿橋接是因為 VS Code 不會把剪貼簿權限轉授到第二層跨來源 iframe（[microsoft/vscode#182642](https://github.com/microsoft/vscode/issues/182642)）。
