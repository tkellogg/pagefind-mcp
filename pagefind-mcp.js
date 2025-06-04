#!/usr/bin/env node
// smol-news-mcp.js  ✧  MIT-licensed example
// ------------------------------------------------------------
// Usage:  node smol-news-mcp.js [PORT]
// Requires:  node >=18  (fetch + async import),  npm i node-fetch @modelcontextprotocol/sdk zod

import { createServer }   from "http";
import { tmpdir }         from "os";
import { join, dirname }  from "path";
import { mkdir, writeFile, readFile } from "fs/promises";
import { fileURLToPath, pathToFileURL } from "url";
import fetch              from "node-fetch";
import z                  from "zod";
import { McpServer }      from "@modelcontextprotocol/sdk/server/mcp.js";
import { HttpServerTransport } from "@modelcontextprotocol/sdk/server/http.js";

// ------------------------------------------------------------
// 1.  Grab the Pagefind bundle on start-up
// ------------------------------------------------------------
const BASE      = "https://news.smol.ai/pagefind";
const CACHE_DIR = join(tmpdir(), "smol_ai_pagefind");

async function download(pathOnSite) {
  const url  = `${BASE}/${pathOnSite}`;
  const dest = join(CACHE_DIR, pathOnSite);
  await mkdir(dirname(dest), { recursive: true });
  const buf  = await (await fetch(url)).arrayBuffer();
  await writeFile(dest, Buffer.from(buf));
}

async function syncPagefind() {
  await mkdir(CACHE_DIR, { recursive: true });

  // Core engine assets
  await Promise.all(["pagefind.js", "pagefind.wasm"].map(download));

  // Manifest lists every chunk we must mirror
  const manifestJson = await (await fetch(`${BASE}/manifest.json`)).json();
  await download("manifest.json");
  const chunks = manifestJson.chunks || manifestJson.files || [];
  await Promise.all(chunks.map(download));
}
await syncPagefind();

// ------------------------------------------------------------
// 2.  In-process Pagefind engine
// ------------------------------------------------------------
const pagefind = await import(pathToFileURL(join(CACHE_DIR, "pagefind.js")).href);
await pagefind.init({ path: CACHE_DIR });          // locate manifest & chunks  :contentReference[oaicite:1]{index=1}

// Convenience wrapper
async function doSearch(query, limit = 20) {
  const res    = await pagefind.search(query);
  const hits   = await Promise.all(
    res.results.slice(0, limit).map(r => r.data())
  );
  return {
    total: res.count,
    hits: hits.map(h => ({
      title:   h.meta.title,
      url:     `https://news.smol.ai${h.url}`,
      excerpt: h.excerpt
    }))
  };
}

// ------------------------------------------------------------
// 3.  Minimal MCP façade (one tool)
// ------------------------------------------------------------
const mcp = new McpServer({
  name:    "smol-ai-news",
  version: "0.1.0"
});

mcp.tool(
  "search_smol_news",
  z.object({ query: z.string(), limit: z.number().optional() }),
  async ({ query, limit }) => ({
    content: [{
      type: "json",
      value: await doSearch(query, limit ?? 20)
    }]
  })
);

// ------------------------------------------------------------
// 4.  Tiny HTTP transport (also serves Pagefind static files)
// ------------------------------------------------------------
const listenPort = Number(process.argv[2] || 8848);
const transport  = new HttpServerTransport({
  port: listenPort,
  // Static handler for /pagefind/** so Pagefind can lazy-load shards if needed
  static: {
    "/pagefind": CACHE_DIR
  }
});

await mcp.connect(transport);
console.log(`✓ MCP server “smol-ai-news” ready on http://localhost:${listenPort}`);
