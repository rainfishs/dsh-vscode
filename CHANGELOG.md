# Changelog

All notable changes to this extension are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.0.14] - 2026-09-15

### Features

- A link clicked inside the embedded page opens through VS Code's own confirmation. The [`dsh-vscode-bridge`](https://github.com/rainfishs/dsh-vscode-bridge) browser half posts the clicked address to the page that embeds the GUI, the panel relays it to the extension, and `vscode.env.openExternal` raises VS Code's "Do you want Code to open the external website?" dialog before the system browser takes the address. A domain on VS Code's own trusted list (`*.github.com`, `*.microsoft.com`, loopback and the rest of `linkProtectionTrustedDomains`) opens without that dialog, exactly as it does elsewhere in the editor; a page standing alone keeps its own handling.

### Compatibility

- Pairs with [`dsh-vscode-bridge`](https://github.com/rainfishs/dsh-vscode-bridge) **0.2.4** or newer: that release is the browser half which posts a clicked external link. An older bundle leaves the file open and clipboard bridges exactly as they were, and external links keep whatever the page did with them before.

## [0.0.13] - 2026-09-15

### Documentation

- The Quick Start now opens the panel by shortcut first — `Ctrl+Alt+B` (`Cmd+Option+B` on macOS) shows the Secondary Side Bar, whose **DSH** icon opens the panel — with the `DSH: Open URL Tab` command palette route listed alongside it, so no command name has to be typed.
- A screenshot of the panel in the Secondary Side Bar is embedded at the top of both READMEs. `docs/**` stays out of the package, so the extension page resolves the image from the GitHub repository.

## [0.0.12] - 2026-09-15

### Features

- `dsh.urlFile` may be left empty: the tab then reads the file DSH itself writes, `%DSH_HOME%\profiles\web\web-url.txt` (`%USERPROFILE%\.dsh\profiles\web\web-url.txt` when `DSH_HOME` is unset), so a plain `dsh web` needs no path typed in. The panel keeps watching that file, so the tab connects by itself once DSH writes it. The `No URL configured` page now names the missing file instead of only pointing at the setting.

### Documentation

- The READMEs were rewritten around the DSH runtime bundle, the two-hop IPC bridge and the per-window proxy; the Traditional Chinese one mirrors the English one.

## [0.0.11] - 2026-09-15

### Features

- A file clicked inside the embedded page opens in the editor, on the line the click carried, instead of in the page's own preview. The [`dsh-vscode-bridge`](https://github.com/rainfishs/dsh-vscode-bridge) plugin resolves the path and posts `{ type: "open-file", path, line? }` to the page that embeds the GUI; the panel relays it to the extension, which opens `vscode.Uri.file(path)` and reveals the line. Only the embedded page itself may ask — a frame nested inside it is ignored — and how the open lands is left to VS Code's own settings.

## [0.0.10] - 2026-09-14

First public release.

### Features

- A webview tab inside the VS Code chat panel. It is registered in the `secondarySidebar` container, and additionally attempted in the built-in chat panel container where the running VS Code build allows third-party views.
- The embedded URL is read from a text file set through `dsh.urlFile` (absolute, workspace-relative, or `~`-prefixed) and the tab reloads whenever that file changes.
- `dsh.zoom` scales the embedded page from 0.25× to 4× and is applied without reloading the tab.
- `dsh.isolateStorage` (default: on) loads loopback `http` targets through a per-window reverse-proxy origin, so `localStorage` no longer collides between VS Code windows.
- Copy buttons inside the embedded page reach the system clipboard through a `postMessage` bridge, relayed by the [`dsh-vscode-bridge`](https://github.com/rainfishs/dsh-vscode-bridge) DSH plugin.
- A missing setting, an unreadable file or a file without a usable URL renders an explanatory page with a button to the relevant setting, and is reported in the **DSH** output channel.
