#!/usr/bin/env node
// smol-news-mcp.js  ✧  MIT-licensed example
// ------------------------------------------------------------
// Usage:  node smol-news-mcp.js
// Requires:  node >=18  (fetch + async import),  npm i node-fetch @modelcontextprotocol/sdk zod

import { tmpdir }         from "os";
// Determine tool name
function cliToolName() {
  const argv = process.argv.slice(2);
  for (const a of argv) {
    if (a === '--tool-name') {
      const pos = argv.indexOf(a);
      return argv[pos + 1] ?? 'search_pagefind';
    }
    if (a.startsWith('--tool-name=')) return a.split('=')[1];
  return 'search_pagefind';
const TOOL_NAME = cliToolName();
// CLI switch for tool name
const args = process.argv.slice(2);
let TOOL_NAME = 'search_pagefind';
for (const arg of args) {
  if (arg === '--tool-name') {
    const pos = args.indexOf(arg);
    if (args[pos + 1]) TOOL_NAME = args[pos + 1];
    break;
  }
  if (arg.startsWith('--tool-name=')) {
    TOOL_NAME = arg.split('=')[1];
    break;
  }
}

// ------------------------------------------------------------
// 1.  Build a tiny Pagefind index at start-up
// ------------------------------------------------------------
const CACHE_DIR = join(tmpdir(), "smol_ai_pagefind");

async function fetchPage(url) {               // fetch remote page
  const agent = process.env.HTTPS_PROXY
    ? new HttpsProxyAgent(process.env.HTTPS_PROXY)
    : undefined;
  return new Promise((resolve, reject) => {
    https
      .get(url, { agent }, (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => resolve(data));
      })
      .on("error", reject);
  });
}

const args = process.argv.slice(2);
const noResources = args.includes("--no-resources");   // skip resource push

async function buildIndex() {
  await mkdir(CACHE_DIR, { recursive: true });
  const slugs = [                        // issue pages to index
    "25-06-03-not-much",
    "25-06-02-not-much",
    "25-05-30-mary-meeker",
  ];

  const { index } = await pagefindLib.createIndex();
  for (const slug of slugs) {
    const url = `https://news.smol.ai/issues/${slug}`;
    const html = await fetchPage(url);
    await index.addHTMLFile({ url, content: html, sourcePath: `issues/${slug}.html` });
  }
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

const pushedUrls = new Set();           // cache resource urls

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
  // pagefind result fields: url, content, word_count, filters, meta,
  // anchors, weighted_locations, locations, raw_content, raw_url,
  // excerpt, sub_results
  const results = [];
  for (const h of hits) {
    const url = h.url.startsWith('http') ? h.url : `https://news.smol.ai${h.url}`;
    let content = h.raw_content;
    if (noResources) {
      const html = await fetchPage(url);
      const dom = new JSDOM(html);
      const text = dom.window.document.body.textContent.trim().replace(/\s+/g, " ");
      const excerptLen = h.excerpt.replace(/<[^>]+>/g, "").length;
      content = text.slice(0, excerptLen);
    } else if (!pushedUrls.has(url)) {
      const html = await fetchPage(url);
      mcp.resource(url, url, async () => ({
        contents: [{ uri: url, mimeType: "text/html", text: html }],
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
  TOOL_NAME,
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
    async (_uri) => {
      const html = await fetchPage(_uri);
      return { contents: [{ uri: _uri, mimeType: "text/html", text: html }] };
    }
  );
}

// ------------------------------------------------------------
// 4.  Tiny stdio transport
// ------------------------------------------------------------
const transport = new StdioServerTransport();

await mcp.connect(transport);
console.log("✓ MCP server ‘smol-ai-news’ ready on stdio");
