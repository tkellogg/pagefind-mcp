#!/usr/bin/env node
// smol-news-mcp.js  ✧  MIT-licensed example
// ------------------------------------------------------------
// Usage:  node smol-news-mcp.js
// Requires:  node >=18  (fetch + async import),  npm i node-fetch @modelcontextprotocol/sdk zod

import { tmpdir }         from "os";
import { join, dirname }  from "path";
import { mkdir, writeFile, readFile } from "fs/promises";
import { pathToFileURL } from "url";
import { JSDOM }          from "jsdom";
import z                  from "zod";
import { McpServer }      from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { UriTemplate }   from "@modelcontextprotocol/sdk/shared/uriTemplate.js";
import * as pagefindLib   from "pagefind";

// ------------------------------------------------------------
// 1.  Build a tiny Pagefind index at start-up
// ------------------------------------------------------------
const CACHE_DIR = join(tmpdir(), "smol_ai_pagefind");
const SAMPLE_DIR = join(tmpdir(), "smol_ai_sample");

const args = process.argv.slice(2);
const noResources = args.includes("--no-resources");

async function buildIndex() {
  await mkdir(CACHE_DIR, { recursive: true });
  await mkdir(SAMPLE_DIR, { recursive: true });

  const pages = [
    { file: "index.html", title: "OpenAI launches new GPT model", body: "OpenAI's latest model improves reasoning and efficiency." },
    { file: "anthropic.html", title: "Anthropic releases Claude 3", body: "Anthropic's Claude 3 sets new benchmarks in alignment." },
    { file: "research.html", title: "Machine Learning breakthrough", body: "Researchers propose a new transformer variant." }
  ];

  await Promise.all(pages.map(p =>
    writeFile(join(SAMPLE_DIR, p.file), `<!doctype html><html><head><title>${p.title}</title></head><body><h1>${p.title}</h1><p>${p.body}</p></body></html>`)
  ));

  const { index } = await pagefindLib.createIndex();
  await index.addDirectory({ path: SAMPLE_DIR });
  await index.writeFiles({ outputPath: CACHE_DIR });
}
await buildIndex();

// Polyfill minimal browser globals for Pagefind
global.window   = global;
global.document = { currentScript: { src: pathToFileURL(join(CACHE_DIR, "pagefind.js")).href } };
global.location = { href: global.document.currentScript.src };
global.fetch    = async (url) => {
  const buf = await readFile(new URL(url));
  return {
    arrayBuffer: async () => buf,
    json: async () => JSON.parse(buf.toString("utf8"))
  };
};

// ------------------------------------------------------------
// 2.  In-process Pagefind engine
// ------------------------------------------------------------
const pagefind = await import(pathToFileURL(join(CACHE_DIR, "pagefind.js")).href);
await pagefind.init({ path: CACHE_DIR });          // locate manifest & chunks

const pushedUrls = new Set();

// Convenience wrapper
async function doSearch(query, limit = 20) {
  let res = await pagefind.search(query);
  if (res.unfilteredResultCount === 0 && query.includes(" ")) {
    for (const part of query.split(/\s+/)) {
      if (!part) continue;
      res = await pagefind.search(part);
      if (res.unfilteredResultCount > 0) break;
    }
  }
  const hits = await Promise.all(
    res.results.slice(0, limit).map((r) => r.data())
  );
  const results = [];
  for (const h of hits) {
    const url = `https://news.smol.ai${h.url}`;
    let content = h.raw_content;
    if (noResources) {
      const file = h.url === "/" ? "index.html" : h.url.replace(/^\//, "");
      const html = await readFile(join(SAMPLE_DIR, file), "utf8");
      const dom = new JSDOM(html);
      const text = dom.window.document.body.textContent.trim().replace(/\s+/g, " ");
      const excerptLen = h.excerpt.replace(/<[^>]+>/g, "").length;
      content = text.slice(0, excerptLen);
    } else if (!pushedUrls.has(url)) {
      const file = h.url === "/" ? "index.html" : h.url.replace(/^\//, "");
      const html = await readFile(join(SAMPLE_DIR, file), "utf8");
      mcp.resource(url, url, async () => ({
        contents: [{ mimeType: "text/html", text: html }],
      }));
      pushedUrls.add(url);
    }
    results.push({ title: h.meta.title, url, excerpt: h.excerpt, content });
  }
  return {
    total: res.unfilteredResultCount,
    hits: results,
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
  { query: z.string(), limit: z.number().optional() },
  async ({ query, limit }) => ({
    structuredContent: await doSearch(query, limit ?? 20)
  })
);

// Single page template
if (!noResources) {
  mcp.resource(
    "page",
    new UriTemplate("https://news.smol.ai/{+path}"),
    async (_uri, vars) => {
      const file = vars.path === "" ? "index.html" : vars.path.replace(/^\//, "");
      const html = await readFile(join(SAMPLE_DIR, file), "utf8");
      return { contents: [{ mimeType: "text/html", text: html }] };
    }
  );
}

// ------------------------------------------------------------
// 4.  Tiny stdio transport
// ------------------------------------------------------------
const transport = new StdioServerTransport();

await mcp.connect(transport);
console.log("✓ MCP server ‘smol-ai-news’ ready on stdio");
