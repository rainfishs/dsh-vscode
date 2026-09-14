<div align="center">

<img src="icon.png" alt="DSH on VS Code" width="100" height="100">

# DSH on VS Code

### Seamless, low-overhead DeepSeek Harness (DSH) integration for VS Code

[![Visual Studio Marketplace Version](https://img.shields.io/visual-studio-marketplace/v/rainfishs.dsh-on-vscode?style=flat-square&label=Marketplace&logo=visualstudiocode&logoColor=007ACC)](https://marketplace.visualstudio.com/items?itemName=rainfishs.dsh-on-vscode)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](LICENSE)
[![VS Code Engine](https://img.shields.io/badge/VS%20Code-%5E1.104.0-007ACC.svg?style=flat-square&logo=visualstudiocode)](https://code.visualstudio.com/)
[![Built for DSH](https://img.shields.io/badge/Integration-DeepSeek%20Harness-4D6BFE?style=flat-square)](https://github.com/deepseek-ai/deepseek-harness)

**English** | [繁體中文](README.zh-TW.md)

</div>

---

<p align="center">
  <img src="docs/screenshots/sidebar.jpg" alt="DSH running in the VS Code Secondary Sidebar" width="100%">
</p>

---

**DSH on VS Code** brings the [DeepSeek Harness (DSH)](https://github.com/deepseek-ai/deepseek-harness) web interface directly into your editor's chat panel.

Built with a **lightweight, decoupled architecture**, it avoids process locking and fragile stdout scraping, providing a clean bidirectional bridge between DSH and your VS Code workspace.

---

## ⚡ Architecture Overview

Instead of rigid sub-process binding or fragile stdout scraping, DSH on VS Code uses a **Rendezvous File Pattern** with a high-performance **Two-Hop IPC Bridge**:

```text
┌─────────────────────────────────────────────────────────────┐
│                        VS Code Host                         │
│  ┌───────────────────────┐       ┌───────────────────────┐  │
│  │   Secondary Sidebar   │       │  Loopback Proxy Core  │  │
│  │  (Webview Container)  │       │ (Per-Window Isolation)│  │
│  └───────────▲───────────┘       └───────────▲───────────┘  │
│              │ (postMessage IPC)             │              │
└──────────────┼───────────────────────────────┼──────────────┘
               │                               │
       [ Two-Hop Bridge ]            [ HTTP / WebSocket ]
       • System Clipboard Sync                 │
       • Native File Jump (Range)              │
               │                               ▼
┌──────────────▼──────────────────────────────────────────────┐
│                    DSH Runtime & Web GUI                    │
│    (Atomic Rendezvous URL File + SameSite Cookie Widening)   │
└─────────────────────────────────────────────────────────────┘
```

---

## ✨ Key Features

* 🚀 **Zero-Lag Native Workspace**: Mounts directly into the Secondary Sidebar or alongside the Chat Panel without breaking your layout.
* 📁 **Native Editor Hand-off**: Clicking files or stack traces inside DSH opens the exact file and line in your active VS Code editor instantly.
* 📋 **Two-Hop Clipboard Bridge**: Overcomes Chromium iframe permission sandboxing to give DSH full, reliable access to the OS clipboard.
* 🛡️ **Per-Window Storage Isolation**: Dedicated per-window loopback proxy origin prevents `localStorage` and session collisions across multi-root workspaces.
* 🔄 **Rendezvous Auto-Reload**: Watches the authenticated URL handshake file; starts and reconnects automatically without manual configuration.
* 🔍 **Live Zoom Scaling**: Hardware-accelerated CSS viewport scaling (0.25x – 4.0x) without reloading the iframe state or dropping active WebSockets.

---

## 📦 Prerequisites

| Component | Required Version | Role |
| :--- | :--- | :--- |
| **VS Code** | `^1.104.0` | Host Editor |
| **DeepSeek Harness** | `latest` (`@deepseek-ai/dsh`) | AI Harness Core |
| **[dsh-vscode-bridge](https://github.com/rainfishs/dsh-vscode-bridge)** | `latest` | DSH Cordis Runtime Bundle |

---

## 🚀 Quick Start

### 1. Install the DSH Runtime Bundle
Add the bridge bundle to your DSH web profile:
```bash
dsh plugin --profile web add github:rainfishs/dsh-vscode-bridge
```

### 2. Install the VS Code Extension
Install directly from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=rainfishs.dsh-on-vscode) or via command line:
```bash
code --install-extension rainfishs.dsh-on-vscode
```

### 3. Launch & Connect
1. Start DeepSeek Harness:
   ```bash
   dsh web
   ```
   *(The bridge automatically writes the authenticated session URL to `%USERPROFILE%\.dsh\profiles\web\web-url.txt`)*
2. Open the panel — either route works:

   - **UI:** `Ctrl+Alt+B` (macOS: `Cmd+Option+B`) → click the **DSH** icon in the Secondary Side Bar
   - **Command Palette:** `Ctrl+Shift+P` (macOS: `Cmd+Shift+P`) → run **DSH: Open URL Tab**

---

## ⚙️ Configuration

Customize the integration via `Settings` (`Ctrl+,`) under the `dsh` namespace:

| Setting | Type | Default | Description |
| :--- | :---: | :---: | :--- |
| `dsh.urlFile` | `string` | `""` | Path to the rendezvous URL file. Supports absolute paths, workspace-relative paths, and `~` home expansions. Empty means the file DSH itself writes: `%DSH_HOME%\profiles\web\web-url.txt`, or `%USERPROFILE%\.dsh\profiles\web\web-url.txt` when `DSH_HOME` is unset. |
| `dsh.zoom` | `number` | `1.0` | Real-time viewport zoom factor (`0.25` to `4.0`). Applied without reloading. |
| `dsh.isolateStorage` | `boolean` | `true` | Enables per-window loopback proxy to isolate `localStorage` between multiple VS Code windows. |

---

## 🔧 Under the Hood

### 1. Two-Hop Bidirectional IPC
VS Code Webviews impose strict cross-origin iframe security boundaries. 
* **Clipboard Relay**: `dsh-vscode-bridge` hooks `navigator.clipboard.writeText` within the iframe and bubbles payloads upwards via `postMessage`. The extension host relays and writes them using native `vscode.env.clipboard.writeText`.
* **File Navigation**: File links (`dsh-resource://file/...`) are intercepted and sent directly to the extension host, opening the target file in `vscode.window.showTextDocument` with the exact line in focus.

### 2. Deterministic Port Proxy & Storage Isolation
Chromium shares `localStorage` across all windows accessing the same origin (`http://127.0.0.1:3080`). DSH on VS Code runs a lightweight in-memory reverse proxy per window. The port is deterministically hashed from the active workspace path, ensuring independent storage scopes while preserving session persistence across reloads.

---

## 🛠️ Diagnostics & Troubleshooting

All runtime decisions, proxy lifecycle events, and IPC relays are logged to the **DSH Output Channel**:
1. Open **View ▸ Output** (`Ctrl+K Ctrl+H`).
2. Select **DSH** from the dropdown.

| Symptom | Cause | Solution |
| :--- | :--- | :--- |
| `No URL configured` | The default DSH URL file is not there yet | Start `dsh web` with the bridge bundle, or set `dsh.urlFile` in Settings |
| `Cannot read that file` | File path invalid or permission denied | Verify file permissions and path syntax |
| Copy button has no effect | `dsh-vscode-bridge` missing in DSH | Run `dsh plugin --profile web add github:rainfishs/dsh-vscode-bridge` |
| Multiple windows share session | `dsh.isolateStorage` disabled | Ensure `dsh.isolateStorage: true` in settings |

---

## 🔒 Security & Privacy

* **100% Localhost Bound**: The reverse proxy and all rendezvous mechanisms bind strictly to `127.0.0.1`.
* **Zero Telemetry**: No tracking, metrics, or third-party network requests.
* **Origin Defense**: Upstream `Origin`, `Host`, and `Referer` headers are sanitized to respect DSH's internal security fences.

---

## 📄 License

Distributed under the **MIT License**. See [LICENSE](LICENSE) for details.

---

<div align="center">
<sub>Built with precision by <a href="https://github.com/rainfishs">rainfishs</a>. Not officially affiliated with DeepSeek.</sub>
</div>