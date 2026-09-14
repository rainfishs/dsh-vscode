import * as crypto from "crypto";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as vscode from "vscode";
import { isLoopbackHostname, LoopbackProxy } from "./proxy";

/**
 * Registered under our own container in the secondary sidebar (a standard VS Code API, always available).
 */
const VIEW_ID = "dsh.view";
/**
 * Extra attempt: register into the chat container, which on some builds shows up as a tab next to Chat.
 * If a newer VS Code blocks it, that only leaves one warning in the log and does not affect the view above.
 */
const CHAT_VIEW_ID = "dsh.chatView";
const SECTION = "dsh";
const URL_FILE_SETTING = "urlFile";
const ZOOM_SETTING = "zoom";
const ISOLATE_SETTING = "isolateStorage";

let output: vscode.OutputChannel | undefined;

function log(message: string): void {
	output?.appendLine(message);
}

export function activate(context: vscode.ExtensionContext): void {
	output = vscode.window.createOutputChannel("DSH");
	// One proxy per window (= per extension host); both panels share it, so they share one origin
	const scope = new WindowScope(log);
	const providers = [new UrlTabProvider(scope), new UrlTabProvider(scope)];

	const reloadAll = () => providers.forEach((provider) => provider.reload());

	context.subscriptions.push(
		output,
		scope,
		...providers,
		vscode.window.registerWebviewViewProvider(VIEW_ID, providers[0], {
			webviewOptions: { retainContextWhenHidden: true },
		}),
		vscode.window.registerWebviewViewProvider(CHAT_VIEW_ID, providers[1], {
			webviewOptions: { retainContextWhenHidden: true },
		}),
		vscode.commands.registerCommand("dsh.open", () =>
			vscode.commands.executeCommand(`${VIEW_ID}.focus`)
		),
		vscode.commands.registerCommand("dsh.reload", reloadAll),
		vscode.commands.registerCommand("dsh.openSettings", () =>
			vscode.commands.executeCommand("workbench.action.openSettings", `${SECTION}.${URL_FILE_SETTING}`)
		),
		vscode.workspace.onDidChangeConfiguration((event) => {
			if (event.affectsConfiguration(`${SECTION}.${URL_FILE_SETTING}`)) {
				reloadAll();
			}
			if (event.affectsConfiguration(`${SECTION}.${ISOLATE_SETTING}`)) {
				reloadAll();
			}
			if (event.affectsConfiguration(`${SECTION}.${ZOOM_SETTING}`)) {
				providers.forEach((provider) => provider.applyZoom());
			}
		})
	);

	log("activated");
}

export function deactivate(): void {
	// each provider cleans up after itself in dispose()
}

class UrlTabProvider implements vscode.WebviewViewProvider, vscode.Disposable {
	private view: vscode.WebviewView | undefined;
	private watchedFile: string | undefined;
	private loadToken = 0;

	constructor(private readonly scope: WindowScope) {}

	resolveWebviewView(view: vscode.WebviewView): void {
		this.view = view;
		view.webview.options = {
			enableScripts: true,
			enableCommandUris: true
		};
		// A copy request forwarded by the middle-layer webview -> write it with the native VS Code API
		// (the write happens in the extension host, so iframe cross-origin permissions do not apply)
		view.webview.onDidReceiveMessage((message: { type?: unknown; text?: unknown }) => {
			if (!message || message.type !== "copy" || typeof message.text !== "string" || !message.text) {
				return;
			}
			const text = message.text;
			void vscode.env.clipboard.writeText(text).then(
				() => log(`[Clipboard] copied ${text.length} characters`),
				(error) => log(`[Clipboard] failed: ${String(error)}`)
			);
		});
		view.onDidDispose(() => {
			this.view = undefined;
			this.stopWatching();
		});
		this.reload();
	}

	dispose(): void {
		this.stopWatching();
		this.view = undefined;
	}

	/** Re-read the file and repaint the view according to the settings */
	reload(): void {
		const view = this.view;
		if (!view) {
			return;
		}

		const raw = (vscode.workspace.getConfiguration(SECTION).get<string>(URL_FILE_SETTING) ?? "").trim();
		if (!raw) {
			this.stopWatching();
			view.webview.html = this.infoPage(
				"No URL configured",
				`Open Settings, search for <code>${SECTION}.${URL_FILE_SETTING}</code> and point it at the text file holding your URL.<br>
				 Example: <code>C:\\temp\\chat-url.txt</code>`,
				"Open Settings",
				"dsh.openSettings"
			);
			return;
		}

		const file = resolvePath(raw);
		this.watch(file);

		let content: string;
		try {
			content = fs.readFileSync(file, "utf8");
		} catch (error) {
			log(`read failed: ${file} (${String(error)})`);
			view.webview.html = this.infoPage(
				"Cannot read that file",
				`<code>${escapeHtml(file)}</code><br>${escapeHtml(errorMessage(error))}`
			);
			return;
		}

		const url = parseUrl(content);
		if (!url) {
			log(`no usable url in: ${file}`);
			view.webview.html = this.infoPage(
				"No usable URL in that file",
				`<code>${escapeHtml(file)}</code><br>Only lines starting with http or https are accepted (lines starting with # are ignored).`
			);
			return;
		}

		// Starting the proxy is asynchronous (it listens on a port); give up on this run if a reload happens meanwhile
		const token = ++this.loadToken;
		void this.scope.resolve(url).then((effective) => {
			if (token !== this.loadToken || this.view !== view) {
				return;
			}
			log(`load: ${effective}`);
			view.webview.html = this.framePage(effective);
		});
	}

	/** Apply the zoom only; do not reload the tab */
	applyZoom(): void {
		const view = this.view;
		if (!view) {
			return;
		}
		const zoom = readZoom();
		void view.webview.postMessage({ type: "zoom", value: zoom });
		log(`zoom: ${zoom}`);
	}

	/** Reload automatically as soon as the text file changes */
	private watch(file: string): void {
		if (this.watchedFile === file) {
			return;
		}
		this.stopWatching();
		this.watchedFile = file;
		fs.watchFile(file, { interval: 1000 }, () => this.reload());
	}

	private stopWatching(): void {
		if (this.watchedFile) {
			fs.unwatchFile(this.watchedFile);
			this.watchedFile = undefined;
		}
	}

	private framePage(url: string): string {
		// Zoom: scale the iframe, then stretch it back to the full viewport with the inverse width and height
		const zoom = readZoom();
		const inverse = Number((100 / zoom).toFixed(4));
		const nonce = crypto.randomBytes(16).toString("hex");
		// This CSP follows VS Code's own Simple Browser, which is what allows the iframe to load external URLs
		return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; frame-src *; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
<style>
	html, body { margin: 0; padding: 0; height: 100%; overflow: hidden; }
	iframe { display: block; border: 0; background: #ffffff; transform-origin: 0 0; }
</style>
</head>
<body>
<iframe id="frame" src="${escapeHtml(url)}" style="width: ${inverse}%; height: ${inverse}vh; transform: scale(${zoom});" allow="clipboard-read; clipboard-write; fullscreen; microphone; camera"></iframe>
<script nonce="${nonce}">
	const vscode = acquireVsCodeApi();
	const frame = document.getElementById("frame");
	window.addEventListener("message", (event) => {
		const data = event.data;
		if (!data) {
			return;
		}
		// (1) zoom command coming from the outer extension
		if (data.type === "zoom" && typeof data.value === "number" && data.value > 0) {
			frame.style.width = (100 / data.value) + "%";
			frame.style.height = (100 / data.value) + "vh";
			frame.style.transform = "scale(" + data.value + ")";
			return;
		}
		// (2) copy request sent by the page inside the iframe (DSH) -> forward it to the outer extension
		if (data.type === "copy" && typeof data.text === "string" && data.text.length > 0) {
			vscode.postMessage({ type: "copy", text: data.text });
		}
	});
</script>
</body>
</html>`;
	}

	private infoPage(title: string, detail: string, buttonLabel?: string, command?: string): string {
		const button =
			buttonLabel && command
				? `<p><a class="btn" href="command:${escapeHtml(command)}">${escapeHtml(buttonLabel)}</a></p>`
				: "";
		return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';">
<style>
	body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); padding: 14px; line-height: 1.7; }
	h3 { margin: 0 0 8px; font-size: 1.05em; }
	code { background: var(--vscode-textCodeBlock-background); padding: 1px 4px; border-radius: 3px; }
	.btn { display: inline-block; margin-top: 6px; padding: 5px 12px; text-decoration: none;
		color: var(--vscode-button-foreground); background: var(--vscode-button-background); border-radius: 4px; }
</style>
</head>
<body>
<h3>${escapeHtml(title)}</h3>
<p>${detail}</p>
${button}
</body>
</html>`;
	}
}

/**
 * One per window: it swaps the loopback upstream for an origin belonging to this window,
 * which is the only way to isolate localStorage. Any failing step falls back to the original
 * URL, so a broken proxy never leaves the panel empty.
 */
class WindowScope implements vscode.Disposable {
	private proxy: LoopbackProxy | undefined;
	private key: string | undefined;
	private targetKey: string | undefined;

	constructor(private readonly log: (message: string) => void) {}

	dispose(): void {
		this.proxy?.dispose();
		this.proxy = undefined;
		this.targetKey = undefined;
	}

	/** Return the URL that should really be loaded: the proxy origin (when needed and available), or the original URL. */
	async resolve(url: string): Promise<string> {
		let target: URL;
		try {
			target = new URL(url);
		} catch {
			return url;
		}
		// Only http loopback targets (the local DSH service) are proxied; every other URL is loaded as-is
		if (!readIsolate() || target.protocol !== "http:" || !isLoopbackHostname(target.hostname)) {
			return url;
		}
		const proxy = await this.ensure(target);
		return proxy ? `${proxy.origin}${target.pathname}${target.search}${target.hash}` : url;
	}

	private async ensure(target: URL): Promise<LoopbackProxy | undefined> {
		const targetKey = `${target.hostname}:${target.port}`;
		if (this.proxy && this.targetKey === targetKey) {
			return this.proxy;
		}
		const key = windowScopeKey();
		if (this.proxy && this.key !== key) {
			this.proxy.dispose();
			this.proxy = undefined;
		}
		try {
			if (this.proxy) {
				this.proxy.setTarget(target);
			} else {
				this.proxy = await LoopbackProxy.start(target, key, this.log);
				this.key = key;
				this.log(`[Proxy] ${targetKey} → ${this.proxy.origin} (window-specific origin, storage isolated)`);
			}
			this.targetKey = targetKey;
			return this.proxy;
		} catch (error) {
			this.log(`[Proxy] failed to start, loading the original URL directly: ${String(error)}`);
			this.proxy = undefined;
			this.targetKey = undefined;
			return undefined;
		}
	}
}

/** Window identity: reopening the same folder lands on the same port; without a folder, use this session. */
function windowScopeKey(): string {
	const folder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
	return folder ? `folder:${path.resolve(folder).toLowerCase()}` : `session:${vscode.env.sessionId}`;
}

/** Isolation setting: missing or malformed values count as enabled. */
function readIsolate(): boolean {
	return vscode.workspace.getConfiguration(SECTION).get<boolean>(ISOLATE_SETTING) !== false;
}

/** Read the zoom setting: anything malformed or non-positive falls back to 1, and is clamped to 0.25-4 */
function readZoom(): number {
	const value = vscode.workspace.getConfiguration(SECTION).get<number>(ZOOM_SETTING);
	if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
		return 1;
	}
	return Math.min(4, Math.max(0.25, value));
}

/** Relative paths resolve against the workspace root; ~ is supported */
function resolvePath(file: string): string {
	if (file.startsWith("~")) {
		return path.join(os.homedir(), file.slice(1));
	}
	if (path.isAbsolute(file)) {
		return path.normalize(file);
	}
	const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? os.homedir();
	return path.resolve(root, file);
}

/** Take the first meaningful line as the URL (skipping the BOM, blank lines, # comments and wrapping quotes or angle brackets) */
function parseUrl(content: string): string | undefined {
	const line = content
		.replace(/^\uFEFF/, "")
		.split(/\r?\n/)
		.map((candidate) => candidate.trim())
		.find((candidate) => candidate.length > 0 && !candidate.startsWith("#"));

	if (!line) {
		return undefined;
	}

	const cleaned = line.replace(/^[<"']+/, "").replace(/[>"']+$/, "").trim();

	try {
		const parsed = new URL(cleaned);
		return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.toString() : undefined;
	} catch {
		return undefined;
	}
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}
