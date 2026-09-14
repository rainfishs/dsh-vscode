import assert from "node:assert/strict";
import http from "node:http";
import { describe, it } from "node:test";

import { LoopbackProxy, isLoopbackHostname, preferredPort } from "../.test/proxy.mjs";

/** @type {(message: string) => void} */
const silent = () => {};

/** @type {(server: http.Server, port?: number) => Promise<number>} */
function listen(server, port = 0) {
	return new Promise((resolve) => {
		server.listen(port, "127.0.0.1", () => resolve(server.address().port));
	});
}

/** @type {(server: http.Server) => Promise<void>} */
function close(server) {
	return new Promise((resolve) => {
		server.close(() => resolve());
	});
}

/** @type {(handler: http.RequestListener) => Promise<{ server: http.Server, port: number, origin: string }>} */
async function startUpstream(handler) {
	const server = http.createServer(handler);
	const port = await listen(server);
	return { server, port, origin: `http://127.0.0.1:${port}` };
}

describe("isLoopbackHostname", () => {
	const accepted = ["127.0.0.1", "127.0.0.53", "127.255.255.254", "localhost", "LOCALHOST", "::1", "[::1]"];
	const rejected = ["0.0.0.0", "10.0.0.1", "128.0.0.1", "192.168.1.10", "127.0.0.1.example.com", "127.0.0", "example.com", ""];

	for (const host of accepted) {
		it(`accepts ${host}`, () => {
			assert.equal(isLoopbackHostname(host), true);
		});
	}

	for (const host of rejected) {
		it(`rejects ${JSON.stringify(host)}`, () => {
			assert.equal(isLoopbackHostname(host), false);
		});
	}
});

describe("preferredPort", () => {
	it("is stable for the same window key", () => {
		assert.equal(preferredPort("folder:c:\\projects\\demo"), preferredPort("folder:c:\\projects\\demo"));
	});

	it("stays inside the preferred range", () => {
		for (let index = 0; index < 64; index += 1) {
			const port = preferredPort(`folder:${index}`);
			assert.ok(port >= 43110 && port < 43110 + 900, `port out of range: ${port}`);
		}
	});
});

describe("LoopbackProxy", () => {
	it("forwards a request and rewrites Host and Origin back to the upstream", async () => {
		let seen;
		const upstream = await startUpstream((request, response) => {
			seen = { host: request.headers.host, origin: request.headers.origin, url: request.url };
			response.writeHead(200, { "content-type": "text/plain" });
			response.end("hello from upstream");
		});
		const proxy = await LoopbackProxy.start(new URL(upstream.origin), "test:forward", silent);

		try {
			const response = await fetch(`${proxy.origin}/chat?x=1`);
			assert.equal(response.status, 200);
			assert.equal(await response.text(), "hello from upstream");
			assert.equal(seen.host, `127.0.0.1:${upstream.port}`);
			assert.equal(seen.origin, upstream.origin);
			assert.equal(seen.url, "/chat?x=1");
		} finally {
			proxy.dispose();
			await close(upstream.server);
		}
	});

	it("rewrites a Location header back to the proxy origin", async () => {
		const upstream = await startUpstream((request, response) => {
			response.writeHead(302, { location: `http://${request.headers.host}/next` });
			response.end();
		});
		const proxy = await LoopbackProxy.start(new URL(upstream.origin), "test:location", silent);

		try {
			const response = await fetch(`${proxy.origin}/redirect`, { redirect: "manual" });
			assert.equal(response.status, 302);
			assert.equal(response.headers.get("location"), `${proxy.origin}/next`);
		} finally {
			proxy.dispose();
			await close(upstream.server);
		}
	});

	it("moves to another port when the preferred one is taken", async () => {
		const key = "test:occupied";
		const occupied = http.createServer((_request, response) => response.end("occupied"));
		const occupiedPort = await listen(occupied, preferredPort(key));
		const upstream = await startUpstream((_request, response) => response.end("ok"));
		const proxy = await LoopbackProxy.start(new URL(upstream.origin), key, silent);

		try {
			const boundPort = Number(new URL(proxy.origin).port);
			assert.notEqual(boundPort, occupiedPort);
			assert.ok(boundPort > 0);
		} finally {
			proxy.dispose();
			await close(upstream.server);
			await close(occupied);
		}
	});

	it("answers 502 when the upstream is unreachable", async () => {
		const dead = http.createServer();
		const deadPort = await listen(dead);
		await close(dead);

		const proxy = await LoopbackProxy.start(new URL(`http://127.0.0.1:${deadPort}`), "test:dead", silent);

		try {
			const response = await fetch(`${proxy.origin}/`);
			assert.equal(response.status, 502);
		} finally {
			proxy.dispose();
		}
	});
});
