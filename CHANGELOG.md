# Changelog

All notable changes to this extension are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.0.10] - 2026-09-14

First public release.

### Features

- A webview tab inside the VS Code chat panel. It is registered in the `secondarySidebar` container, and additionally attempted in the built-in chat panel container where the running VS Code build allows third-party views.
- The embedded URL is read from a text file set through `dsh.urlFile` (absolute, workspace-relative, or `~`-prefixed) and the tab reloads whenever that file changes.
- `dsh.zoom` scales the embedded page from 0.25× to 4× and is applied without reloading the tab.
- `dsh.isolateStorage` (default: on) loads loopback `http` targets through a per-window reverse-proxy origin, so `localStorage` no longer collides between VS Code windows.
- Copy buttons inside the embedded page reach the system clipboard through a `postMessage` bridge, relayed by the [`dsh-vscode-bridge`](https://github.com/rainfishs/dsh-vscode-bridge) DSH plugin.
- A missing setting, an unreadable file or a file without a usable URL renders an explanatory page with a button to the relevant setting, and is reported in the **DSH** output channel.
