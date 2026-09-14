import * as crypto from "crypto";
import * as http from "http";
import type { Duplex } from "stream";

/**
 * One loopback reverse proxy per VS Code window.
 *
 * Why this exists: an iframe's storage is keyed by origin (scheme://host:port). Every VS Code
 * window shares the same Electron session, so when each window loads `http://127.0.0.1:3080`
 * directly, they all share one localStorage and overwrite each other's state.
 * Loading `http://127.0.0.1:<this window's port>` instead gives each window a distinct origin,
 * which isolates the storage.
 *
 * The upstream (DSH) still sees the original authority in Host / Origin, so its Host/Origin fence,
 * its cookies (host-only, port-independent) and its WebSocket behaviour are unchanged; only the
 * browser side sees a new origin.
 *
 * This file does not import vscode, so it can be tested on its own.
 */

/** Start of the preferred port range (each window picks one from here). */
const PORT_BASE = 43110;
/** Range size: the key hashes to a starting point, and a taken port moves forward from there. */
const PORT_SPAN = 900;
/** How many ports to try before falling back to an OS-assigned random port. */
const PORT_TRIES = 24;

/** Hop-by-hop headers: let Node handle these instead of forwarding them as-is. */
const HOP_BY_HOP = new Set([
	"connection",
	"keep-alive",
	"proxy-authenticate",
	"proxy-authorization",
	"te",
	"trailer",
	"transfer-encoding",
	"upgrade",
]);

/** Replace a leading origin in `value` from `from` to `to` (case-insensitive); anything else is returned unchanged. */
function swapOrigin(value: string, from: string, to: string): string {
	if (value.length >= from.length && value.slice(0, from.length).toLowerCase() === from.toLowerCase()) {
		return to + value.slice(from.length);
	}
	return value;
}

/** Flatten rawHeaders into an HTTP header block (the upgrade handshake needs hand-written bytes). */
function rawHeaderLines(rawHeaders: readonly string[]): string {
	let lines = "";
	for (let index = 0; index < rawHeaders.length; index += 2) {
		lines += `${rawHeaders[index] ?? ""}: ${rawHeaders[index + 1] ?? ""}\r\n`;
	}
	return lines;
}

/** 127.0.0.0/8, localhost and ::1 all count as loopback (the same standard DSH uses for trust decisions). */
export function isLoopbackHostname(hostname: string): boolean {
	const host = hostname.replace(/^\[/u, "").replace(/\]$/u, "").toLowerCase();
	if (host === "localhost" || host === "::1") {
		return true;
	}
	const parts = host.split(".");
	if (parts.length !== 4 || parts[0] !== "127") {
		return false;
	}
	return parts.every((part) => /^\d{1,3}$/u.test(part) && Number(part) <= 255);
}

/**
 * The preferred port for a key: reopening the same folder lands on the same port, so that
 * window's localStorage does not look wiped just because the port changed.
 * @param key - window identity (the workspace path here; a one-off session id when no folder is open).
 */
export function preferredPort(key: string): number {
	const digest = crypto.createHash("sha256").update(key).digest();
	return PORT_BASE + (digest.readUInt32BE(0) % PORT_SPAN);
}

export class LoopbackProxy {
	private readonly server: http.Server;
	private readonly agent: http.Agent;
	private readonly log: (message: string) => void;
	private target: URL;
	private bound = 0;

	private constructor(target: URL, log: (message: string) => void) {
		this.target = target;
		this.log = log;
		this.agent = new http.Agent({ keepAlive: true, maxSockets: 64 });
		this.server = http.createServer((request, response) => this.forward(request, response));
		this.server.on("upgrade", (request, socket, head) => this.forwardUpgrade(request, socket, head));
		this.server.on("clientError", (_error, socket) => socket.destroy());
		this.server.on("error", (error) => this.log(`[Proxy] server error: ${String(error)}`));
	}

	/**
	 * Start a proxy: the port is derived from the key first, and taken ports move forward.
	 * @param target - the upstream (the origin actually running DSH).
	 * @param key - window identity, which decides the preferred port.
	 * @param log - message sink (the extension's output channel).
	 */
	static async start(target: URL, key: string, log: (message: string) => void): Promise<LoopbackProxy> {
		const proxy = new LoopbackProxy(target, log);
		proxy.bound = await proxy.listen(key);
		if (proxy.bound <= 0) {
			throw new Error("no free local port found");
		}
		return proxy;
	}

	/** The origin belonging to this window, e.g. `http://127.0.0.1:43123`. */
	get origin(): string {
		return `http://127.0.0.1:${String(this.bound)}`;
	}

	/** Point at a different upstream (the URL file changed) without rebuilding: the port and origin stay the same. */
	setTarget(target: URL): void {
		this.target = target;
	}

	dispose(): void {
		this.agent.destroy();
		this.server.closeAllConnections();
		this.server.close();
	}

	/** Upstream authority, e.g. `127.0.0.1:3080` (the value of the Host header). */
	private get authority(): string {
		const port = this.target.port !== "" ? this.target.port : this.target.protocol === "https:" ? "443" : "80";
		return `${this.target.hostname}:${port}`;
	}

	/** The upstream's own origin, e.g. `http://127.0.0.1:3080`. */
	private get upstreamOrigin(): string {
		return `${this.target.protocol}//${this.target.host}`;
	}

	/** Headers to forward: Host / Origin / Referer rewritten back to the upstream, everything else untouched. */
	private forwardHeaders(request: http.IncomingMessage, keepUpgrade: boolean): http.OutgoingHttpHeaders {
		const headers: http.OutgoingHttpHeaders = {};
		for (const [name, value] of Object.entries(request.headers)) {
			const lower = name.toLowerCase();
			if (value === undefined || lower === "host") {
				continue;
			}
			if (!keepUpgrade && HOP_BY_HOP.has(lower)) {
				continue;
			}
			headers[lower] = value;
		}
		headers.host = this.authority;
		// DSH's trust check requires Origin to equal Host; restoring both to the upstream hides the proxy from it.
		headers.origin = this.upstreamOrigin;
		if (typeof request.headers.referer === "string") {
			headers.referer = swapOrigin(request.headers.referer, this.origin, this.upstreamOrigin);
		}
		return headers;
	}

	private listen(key: string): Promise<number> {
		const start = preferredPort(key) - PORT_BASE;
		const attempt = async (step: number): Promise<number> => {
			if (step >= PORT_TRIES) {
				this.log("[Proxy] every preferred port is taken, falling back to an OS-assigned port");
				return this.tryListen(0);
			}
			const bound = await this.tryListen(PORT_BASE + ((start + step) % PORT_SPAN));
			return bound > 0 ? bound : attempt(step + 1);
		};
		return attempt(0);
	}

	private tryListen(port: number): Promise<number> {
		return new Promise((resolve) => {
			const onError = (): void => {
				this.server.removeListener("listening", onListening);
				resolve(0);
			};
			const onListening = (): void => {
				this.server.removeListener("error", onError);
				const address = this.server.address();
				resolve(typeof address === "object" && address !== null ? address.port : 0);
			};
			this.server.once("error", onError);
			this.server.once("listening", onListening);
			this.server.listen(port, "127.0.0.1");
		});
	}

	/** Plain HTTP: forward the whole exchange and rewrite the response Location back to the proxy origin. */
	private forward(request: http.IncomingMessage, response: http.ServerResponse): void {
		const upstream = http.request({
			host: this.target.hostname,
			port: this.target.port || undefined,
			method: request.method,
			path: request.url,
			headers: this.forwardHeaders(request, false),
			agent: this.agent,
		});
		upstream.on("response", (answer) => {
			const headers: http.OutgoingHttpHeaders = {};
			for (const [name, value] of Object.entries(answer.headers)) {
				const lower = name.toLowerCase();
				if (value === undefined || HOP_BY_HOP.has(lower)) {
					continue;
				}
				headers[lower] = lower === "location" && typeof value === "string" ? swapOrigin(value, this.upstreamOrigin, this.origin) : value;
			}
			response.writeHead(answer.statusCode ?? 502, headers);
			answer.pipe(response);
		});
		upstream.on("error", (error) => {
			this.log(`[Proxy] forwarding failed: ${String(error)}`);
			if (!response.headersSent) {
				response.writeHead(502, { "content-type": "text/plain; charset=utf-8" });
			}
			response.end("DSH proxy: upstream request failed\n");
		});
		request.on("error", () => upstream.destroy());
		response.on("close", () => {
			if (!response.writableEnded) {
				upstream.destroy();
			}
		});
		request.pipe(upstream);
	}

	/** WebSocket: hand the handshake to the upstream as-is, then couple the two sockets once it succeeds. */
	private forwardUpgrade(request: http.IncomingMessage, socket: Duplex, head: Buffer): void {
		const upstream = http.request({
			host: this.target.hostname,
			port: this.target.port || undefined,
			method: request.method,
			path: request.url,
			headers: this.forwardHeaders(request, true),
			agent: false,
		});
		upstream.on("upgrade", (answer, upstreamSocket, upstreamHead) => {
			socket.write(`HTTP/1.1 ${String(answer.statusCode ?? 101)} ${answer.statusMessage ?? "Switching Protocols"}\r\n${rawHeaderLines(answer.rawHeaders)}\r\n`);
			if (head.length > 0) {
				upstreamSocket.write(head);
			}
			if (upstreamHead.length > 0) {
				socket.write(upstreamHead);
			}
			upstreamSocket.on("error", () => socket.destroy());
			socket.on("error", () => upstreamSocket.destroy());
			upstreamSocket.on("close", () => socket.destroy());
			socket.on("close", () => upstreamSocket.destroy());
			upstreamSocket.pipe(socket);
			socket.pipe(upstreamSocket);
		});
		// The upstream refused the upgrade (401 / 403...): pass the plain response back so the browser sees the real error.
		upstream.on("response", (answer) => {
			socket.write(`HTTP/1.1 ${String(answer.statusCode ?? 502)} ${answer.statusMessage ?? ""}\r\n${rawHeaderLines(answer.rawHeaders)}\r\n`);
			answer.pipe(socket);
		});
		upstream.on("error", (error) => {
			this.log(`[Proxy] WebSocket forwarding failed: ${String(error)}`);
			socket.destroy();
		});
		upstream.end();
	}
}
