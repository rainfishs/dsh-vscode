# Security Policy

## Supported versions

Only the newest published version of DSH receives fixes. This is a small, single-maintainer extension; there are no backport branches.

| Version | Supported |
|---|---|
| 0.0.10 (latest) | ✅ |
| older | ❌ |

## Reporting a vulnerability

Please **do not** open a public issue for anything security related.

Use GitHub's [private vulnerability reporting](https://github.com/rainfishs/dsh-vscode/security/advisories/new) on this repository. If that is unavailable to you, open a minimal public issue that says only "I would like to report a security issue" and wait for a reply before posting details.

Please include: affected version, VS Code version, reproduction steps, and what you expected versus what happened. Expect an initial response within about a week.

## Trust model — what this extension actually does

DSH is deliberately small, but it does a few things that deserve to be stated plainly.

1. **It reads a file you configure.** `dsh.urlFile` is resolved (absolute, workspace-relative, or `~`-prefixed) and read from disk. Only the first `http`/`https` line is used. Anything else in the file is ignored.
2. **It embeds that URL in an iframe with scripts enabled.** The embedded page runs with its own origin's privileges inside the webview. Only point `dsh.urlFile` at something you trust — a compromised page inside the panel is still a page running in your editor.
3. **The embedded page can write to your clipboard.** The clipboard bridge accepts `{ type: "copy", text }` messages from the page and writes them through `vscode.env.clipboard`. This is intentional (it is the feature), but it means the embedded page can replace your clipboard content at will. Do not point DSH at pages you do not trust.
4. **The extension host runs a loopback reverse proxy** when `dsh.isolateStorage` is enabled and the target is `http` on `127.0.0.0/8`, `localhost` or `::1`. The proxy:
   - binds `127.0.0.1` only, never a public interface;
   - forwards only to the loopback target configured in the URL file;
   - rewrites `Host`, `Origin` and `Referer` to the upstream authority, so a **local** process that reaches the proxy port can talk to the upstream with an origin the upstream considers trusted. The upstream is itself a loopback service, so no privilege boundary is crossed — but if you consider other local processes hostile, set `dsh.isolateStorage` to `false`.
5. **No telemetry, no network calls of its own.** The extension never contacts the internet. It logs to the **DSH** output channel only.

## Out of scope

- Vulnerabilities in DeepSeek Harness itself — report those to the [DSH project](https://github.com/deepseek-ai/deepseek-harness).
- Vulnerabilities in the DSH plugin that feeds this extension — report those to [rainfishs/dsh-vscode-bridge](https://github.com/rainfishs/dsh-vscode-bridge).
- Vulnerabilities in a third-party page you chose to embed.
- Anything that requires an attacker to already control your VS Code settings or your local filesystem.
