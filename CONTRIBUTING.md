# Contributing

Thanks for taking the time to look at DSH. This is a small extension and it is meant to stay small, so the fastest way to get a change merged is to keep it focused.

## Ways to help

- **Report a bug** with the [bug report template](https://github.com/rainfishs/dsh-vscode/issues/new?template=bug_report.yml).
- **Request a feature** with the [feature request template](https://github.com/rainfishs/dsh-vscode/issues/new?template=feature_request.yml). Please describe the problem, not only the solution — "I want X" is easier to discuss than "add API Y".
- **Send a pull request** for typos, docs, tests and small improvements. For anything larger, open an issue first so we can agree on the approach before you spend time on it.

## Development setup

Requirements: Node.js 18+ and [pnpm](https://pnpm.io/).

```powershell
git clone https://github.com/rainfishs/dsh-vscode.git
cd dsh-vscode
pnpm install
pnpm check      # compile + lint + test
```

Useful scripts:

| Script | What it does |
|---|---|
| `pnpm bundle` | Bundles `src/extension.ts` into `dist/extension.js` with esbuild. |
| `pnpm compile` | Type checks with `tsc --noEmit`. |
| `pnpm lint` | Runs ESLint over `src`. |
| `pnpm test` | Bundles `src/proxy.ts` and runs `node --test tests/`. |
| `pnpm check` | `compile` + `lint` + `test` — run this before opening a PR. |
| `pnpm package` | Produces the `.vsix` (runs `vscode:prepublish` first). |

### Running the extension

- **Extension Development Host:** press `F5`. The `Run Extension` launch configuration bundles first and then opens a new window with DSH loaded.
- **Packaged build:** run `pnpm package` and install the produced `.vsix` through **Extensions ▸ … ▸ Install from VSIX…**.

Either way you need a URL to point at. The cheapest is a text file containing `https://example.com`.

## Project layout

```
src/extension.ts   activation, webview views, URL file parsing, clipboard bridge
src/proxy.ts       per-window loopback reverse proxy (no vscode import — unit testable)
tests/             node:test suites; proxy.ts is bundled into .test/ before running
icon.png           extension icon
```

`src/proxy.ts` deliberately does not import `vscode`, so it can be tested with plain Node.

## Code style

- TypeScript, `strict` mode, CommonJS modules, tab indentation, double quotes, semicolons.
- Prefer small functions with a comment that explains *why*, not *what*. Comments in Chinese are fine and match the existing code; the README and the rest of the repository are in English.
- User-facing strings, code comments and documentation are in English. `README.zh-TW.md` is the only translated document; keep it in sync by hand when behaviour or settings change.
- Keep the dependency footprint at zero runtime dependencies. Everything is bundled by esbuild and shipped as a single file; please do not add runtime dependencies without discussing it first.

## Commit messages

[Conventional Commits](https://www.conventionalcommits.org/), in the imperative mood:

```
feat: add per-window zoom persistence
fix: fall back to the original URL when the proxy port is taken
docs: explain the clipboard bridge
chore: bump devDependencies
```

Keep the subject under ~72 characters. Use the body for the *why*.

## Pull request checklist

- [ ] `pnpm check` passes locally.
- [ ] The change is covered by a test, or the reason it cannot be is explained in the PR description.
- [ ] `CHANGELOG.md` has an entry under `## [Unreleased]` for user-visible changes.
- [ ] `README.md` (and `README.zh-TW.md`) updated when behaviour or settings change.
- [ ] `package.json` version bumped only when preparing a release — not in a feature PR.

## Releasing (maintainers)

Releases are made by hand for now — there is no CI to configure and no secret to store.

1. Move the `Unreleased` entries in `CHANGELOG.md` under the new version heading.
2. Bump `version` in `package.json`.
3. Commit as `chore: release X.Y.Z`, then tag and push: `git tag vX.Y.Z` and `git push origin main --tags`.
4. Build the package: `pnpm package` (produces `dsh-on-vscode-<version>.vsix`).
5. Upload that file:
   - **VS Code Marketplace** — upload it on the [publisher management page](https://marketplace.visualstudio.com/manage), or run `pnpm publish:marketplace` with a `VSCE_PAT` environment variable.
   - **GitHub** — attach the same `.vsix` to a GitHub release.

GitHub Actions are deliberately not set up yet. Add them when the manual steps start to hurt.
