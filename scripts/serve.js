#!/usr/bin/env node
// @ts-check

import {createReadStream} from "node:fs";
import {stat} from "node:fs/promises";
import {createServer} from "node:http";
import {extname, join} from "node:path/posix";

const root = new URL("../output/", import.meta.url);

/** @type {Map<string, URL>} */
const urlMap = new Map();
/** @param {string} path */
function resolve(path) {
	let value = urlMap.get(path);
	if (value == null) {
		const originalPath = path;
		if (!extname(path)) {
			path = join(path, "index.html");
		}

		value = new URL(path, root);
		console.log(root.href, path, value.href);
		urlMap.set(originalPath, value);
	}

	return value;
}

const server = createServer((req, res) => {
	const requestUrl = new URL(
		/** @type {string} */ (req.url),
		"http://localhost:3000",
	);

	if (!requestUrl.pathname.startsWith("/fh-enhancer")) {
		requestUrl.pathname = `/fh-enhancer${requestUrl.pathname}`;
		return res.writeHead(302, {Location: requestUrl.href}).end();
	}

	const path = resolve(requestUrl.pathname.slice("/fh-enhancer/".length));

	stat(path).then(
		() => {
			res.setHeader(
				"Content-Type",
				{
					".html": "text/html",
					".js": "text/javascript",
					".png": "image/png",
					".css": "text/css",
					".json": "application/json",
				}[extname(path.pathname)] ?? "application/text",
			);
			res.writeHead(200);

			createReadStream(path).pipe(res);
		},
		() => {
			res.setHeader("Content-Type", "text/html");
			res.writeHead(404);

			createReadStream(resolve("404.html")).pipe(res);
		},
	);
});

server.listen(3000);
console.log("Listening on http://localhost:3000");
