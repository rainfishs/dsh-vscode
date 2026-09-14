<div align="center">

<img src="icon.png" alt="DSH" width="120" height="120">

# DSH

**A live URL tab inside the VS Code chat panel.**
Point it at [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) — or any local web app — with a single text file.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![VS Code](https://img.shields.io/badge/VS%20Code-%5E1.104-007ACC.svg)](https://code.visualstudio.com/)
[![Status: early preview](https://img.shields.io/badge/status-early%20preview-orange.svg)](#status)

**English** | [繁體中文](README.zh-TW.md)

</div>

> [!NOTE]
> DSH is an independent community project. It is not affiliated with, endorsed by, or published by DeepSeek.

<!--
Demo image: drop a screenshot at docs/screenshots/sidebar.png and uncomment the line below.
<p align="center"><img src="docs/screenshots/sidebar.png" alt="The DSH tab next to the VS Code chat panel" width="720"></p>
-->

## Why

DeepSeek Harness ships a browser UI (`dsh web`, normally on `http://127.0.0.1:3080`). DSH puts that page — or any other URL — where you are already working: in a tab of the VS Code **chat panel**, next to Copilot Chat and Claude.

The URL lives in a plain text file. Switching endpoints is editing one line — no settings sync, no hardcoded port, no side-by-side terminal.

## Features

- **Chat-panel tab.** Registers a webview view in the `secondarySidebar` container, and additionally attempts the built-in chat panel container (`workbench.panel.chat`). Where the running VS Code build blocks third-party views in that container, the sidebar view is the primary surface and the attempt is logged as a warning only.
- **URL from a file.** `dsh.urlFile` points at a text file; the first line starting with `http`/`https` wins. Blank lines and `#` comments are skipped, BOM and surrounding `<`/`"`/`'` are stripped. Edit the file and the tab reloads on its own.
- **Live zoom.** `dsh.zoom` (0.25–4) rescales the embedded page. It is applied through `postMessage`, so the page does not reload.
- **Per-window storage isolation.** Each VS Code window loads loopback URLs through its own proxy origin, so `localStorage` inside the page no longer collides between windows.
- **Clipboard bridge.** Copy buttons inside the embedded page reach the real system clipboard through a two-hop `postMessage` bridge. Requires [`dsh-vscode-bridge`](https://github.com/rainfishs/dsh-vscode-bridge) — see [How it works](#how-it-works).
- **Fails soft.** If the proxy cannot start, the tab quietly falls back to loading the original URL. Everything is reported in the **DSH** output channel.

## Requirements

| Requirement | Why you need it |
|---|---|
| VS Code 1.104.0+ | The extension and the webview APIs it uses. |
| DeepSeek Harness | The web UI this tab embeds. Install with `npm install -g @deepseek-ai/dsh`, then run `dsh web`. |
| [dsh-vscode-bridge](https://github.com/rainfishs/dsh-vscode-bridge) | A DSH plugin. It writes the Web GUI's authenticated URL to a file for `dsh.urlFile` to read, and relays clipboard writes from the page to VS Code — which is what makes the copy buttons work. |
| Node.js 18+ | Only to build from source or run the tests. |

## Install

### 1. Install the DSH plugin

[`dsh-vscode-bridge`](https://github.com/rainfishs/dsh-vscode-bridge) is a DSH profile bundle that bridges the Web GUI and VS Code: it writes the GUI's authenticated login URL to a text file, and relays clipboard writes from the page to the extension host.

```powershell
dsh plugin --profile web add github:rainfishs/dsh-vscode-bridge
```

Its own [README](https://github.com/rainfishs/dsh-vscode-bridge) covers the configuration (`openFileIn`, where the URL file goes, and so on).

### 2. Install this extension

#### From the VS Code Marketplace

Search for **DSH** in the Extensions view, or from a terminal:

```powershell
code --install-extension rainfishs.dsh-on-vscode
```

> The listing goes live with the first Marketplace release of `0.0.10`.

#### From a VSIX

Download the newest `.vsix` from [Releases](https://github.com/rainfishs/dsh-vscode/releases), then use **Extensions ▸ … ▸ Install from VSIX…** in VS Code.

#### From source

```powershell
git clone https://github.com/rainfishs/dsh-vscode.git
cd dsh-vscode
pnpm install
pnpm package        # produces dsh-on-vscode-0.0.10.vsix
```

## Quick start

1. Start the Web GUI (`dsh web`). With `dsh-vscode-bridge` installed, the authenticated URL is written for you to `web-url.txt` in the Web profile directory — `%DSH_HOME%\profiles\web\web-url.txt`, or `%USERPROFILE%\.dsh\profiles\web\web-url.txt` when `DSH_HOME` is unset. Any other text file holding a single URL works just as well:

   ```text
   # the DSH web UI, or anything else
   http://127.0.0.1:3080
   ```

2. Open Settings (`Ctrl+,`), search for `dsh.urlFile`, and fill in the path to that file. Absolute paths, workspace-relative paths and `~/…` all work.
3. Open the chat panel (`Ctrl+Shift+I`) and select the **URL** tab — or run **DSH: Open URL Tab** from the Command Palette.

The tab reloads whenever the text file changes.

## Settings

| Setting | Type | Default | Description |
|---|---|---|---|
| `dsh.urlFile` | `string` | `""` | Path to the text file holding the URL. Absolute, workspace-relative, or `~`-prefixed. |
| `dsh.zoom` | `number` | `1` | Scale factor for the embedded page, clamped to `0.25`–`4`. Applied live. |
| `dsh.isolateStorage` | `boolean` | `true` | Load loopback `http` URLs through a per-window proxy origin so `localStorage` is isolated per window. Only `127.0.0.0/8`, `localhost` and `::1` are proxied. |

## Commands

| Command | Title |
|---|---|
| `dsh.open` | DSH: Open URL Tab |
| `dsh.reload` | DSH: Reload |
| `dsh.openSettings` | DSH: Open Settings (URL File) |

## How it works

**The tab.** The extension registers the same webview view provider twice: once in the `secondarySidebar` container (always available) and once in `workbench.panel.chat` (the built-in chat panel, which newer VS Code builds may refuse for third-party views). The page itself is an `<iframe>` with the CSP used by VS Code's own Simple Browser (`frame-src *`), nested in a CSS zoom wrapper.

**The clipboard bridge.** A webview cannot hand clipboard permissions down to a nested cross-origin iframe, so the parent document cannot write to the clipboard on the page's behalf. Instead:

1. the embedded page (with [`dsh-vscode-bridge`](https://github.com/rainfishs/dsh-vscode-bridge) installed) hooks `navigator.clipboard.writeText` and `postMessage`s `{ type: "copy", text }` to its parent frame;
2. the middle layer — the `<script>` in the generated webview HTML — forwards it through `acquireVsCodeApi()`;
3. the extension host receives it in `webview.onDidReceiveMessage` and calls `vscode.env.clipboard.writeText`.

The write happens in the extension host, so no iframe permission is involved. Background: [microsoft/vscode#182642](https://github.com/microsoft/vscode/issues/182642).

**Per-window storage isolation.** An iframe's storage is scoped to its origin, and every VS Code window shares one Electron session — so two windows loading `http://127.0.0.1:3080` share one `localStorage`. `src/proxy.ts` starts a loopback reverse proxy per window and loads the page from `http://127.0.0.1:<per-window port>` instead. The port is derived from a hash of the workspace folder (or the session id), so reopening the same folder lands on the same origin and the page keeps its state.

Requests are forwarded with `Host`, `Origin` and `Referer` rewritten back to the upstream authority, so the target's own origin checks (including DSH's `isTrustedApiRequest` fence and its host-only `dsh-auth-*` cookie) see no difference. `Location` headers are rewritten back to the proxy origin, and WebSocket upgrades are forwarded with the same header rewrite. The proxy binds `127.0.0.1` only, and only `http` loopback targets are proxied.

## Troubleshooting

Open the **DSH** output channel (View ▸ Output ▸ DSH) first — every decision the extension makes is logged there.

| Symptom | What to check |
|---|---|
| Tab says "No URL configured" | `dsh.urlFile` is empty. The tab renders a button that opens the setting directly. |
| Tab says "Cannot read that file" | The path does not resolve, or the file is unreadable. Absolute paths are safest. |
| Tab says "No usable URL in that file" | No line starts with `http://` or `https://`. `#` comment lines are ignored. |
| No **URL** tab in the chat panel | Newer VS Code builds reject third-party views in `workbench.panel.chat`. Use the DSH view in the secondary sidebar (it may be under **Other Views**). |
| Page renders but copy buttons do nothing | `dsh-vscode-bridge` is not installed in the DSH profile, or it does not emit the `{ type: "copy" }` message. Check the output channel for `[Clipboard]` lines. |
| Two windows overwrite each other's state | Confirm `dsh.isolateStorage` is on. The output channel prints the proxy origin it picked, e.g. `[Proxy] 127.0.0.1:3080 → http://127.0.0.1:43123`. |
| State looks reset after upgrading to 0.0.10 | Expected once: the page moved to a new origin, so the old `localStorage` under `http://127.0.0.1:3080` is not visible any more. |

## Development

```powershell
pnpm install
pnpm bundle     # esbuild → dist/extension.js
pnpm compile    # tsc --noEmit
pnpm lint       # eslint src
pnpm test       # bundles src/proxy.ts and runs node --test
pnpm check      # compile + lint + test
pnpm package    # → .vsix
```

Dependencies are bundled into `dist/extension.js` by esbuild, which is why packaging uses `--no-dependencies` and the VSIX needs no `node_modules`.

Press `F5` in VS Code to start an Extension Development Host (`.vscode/launch.json` bundles first).

See [CONTRIBUTING.md](CONTRIBUTING.md) for the contribution workflow.

## Status

Early preview. The extension is small on purpose: it embeds one URL and stays out of the way. Interfaces may still change between `0.0.x` releases; see [CHANGELOG.md](CHANGELOG.md).

## Privacy

DSH does not collect telemetry and makes no network requests of its own. It reads the file you point it at and loads the URL found there. The loopback proxy listens on `127.0.0.1` only and forwards to the loopback target you configured; it can be switched off with `dsh.isolateStorage: false`.

## License

[MIT](LICENSE).

## Acknowledgements

- The clipboard bridge exists because VS Code does not forward clipboard permissions into nested cross-origin iframes ([microsoft/vscode#182642](https://github.com/microsoft/vscode/issues/182642)).
