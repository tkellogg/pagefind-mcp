#!/usr/bin/env node
// smol-news-mcp.js  ✧  MIT-licensed example
// ------------------------------------------------------------
// Usage:  node smol-news-mcp.js
// Requires:  node >=18  (fetch + async import),  npm i node-fetch @modelcontextprotocol/sdk zod

import { tmpdir }               from "os";
import { join, dirname }        from "path";
import { pathToFileURL }        from "url";
import { JSDOM }                from "jsdom";
import z                        from "zod";
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as pagefindLib         from "pagefind";

// Convert HTML to text
function stripHtml(html) {
  return new JSDOM(html).window.document.body.textContent || "";
}
    await access(join(CACHE_DIR, "pagefind.js"));
  } catch {}

    writeFile(join(SAMPLE_DIR, p.file), `<!doctype html><html><head><title>${p.title}</title></head><body><h1>${p.title}</h1><p>${p.body}</p></body></html>`)
  await index.addDirectory({ path: SAMPLE_DIR });
async function main() {
  await buildIndex();

  // Pagefind browser shims
  global.window   = global;
  global.document = { currentScript: { src: pathToFileURL(join(CACHE_DIR, "pagefind.js")).href } };
  global.location = { href: global.document.currentScript.src };
  global.fetch    = async (url) => {
    const buf = await readFile(new URL(url));
    return {
      arrayBuffer: async () => buf,
      json: async () => JSON.parse(buf.toString("utf8"))
    };

  // ------------------------------------------------------------
  // In-process Pagefind engine
  // ------------------------------------------------------------
  const pagefind = await import(pathToFileURL(join(CACHE_DIR, "pagefind.js")).href);
  await pagefind.init({ path: CACHE_DIR });          // locate manifest & chunks

  // Simplified search wrapper
  async function doSearch(query, limit = 20) {
  }
  // ------------------------------------------------------------
  // Minimal MCP facade
  // ------------------------------------------------------------
  const mcp = new McpServer({
    name:    "smol-ai-news",
    version: "0.1.0"
  });

  // Serve article content
  mcp.resource(
    "news-article",
    new ResourceTemplate("news://{file}", { list: undefined }),
    async (_uri, { file }) => {
      const html = await readFile(join(SAMPLE_DIR, file), "utf8");
      return { contents: [{ uri: _uri.href, text: stripHtml(html) }] };
    }
  );
  mcp.tool(
    "search_smol_news",
    { query: z.string(), limit: z.number().optional() },
    async ({ query, limit }) => ({
      structuredContent: await doSearch(query, limit ?? 20)
    })
  );
  // ------------------------------------------------------------
  // 4.  Tiny stdio transport
  // ------------------------------------------------------------
  const transport = new StdioServerTransport();
  await mcp.connect(transport);
  console.log("✓ MCP server ‘smol-ai-news’ ready on stdio");
}
main().catch((err) => {
  console.error(err);
  process.exit(1);
});
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

// Convert HTML to text
function stripHtml(html) {
  return new JSDOM(html).window.document.body.textContent || "";
}

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
    hits: hits.map((h) => ({
      title: h.meta.title,
      url: `https://news.smol.ai${h.url}`,
      excerpt: stripHtml(h.excerpt),
      content: stripHtml(h.raw_content), // larger snippet text
    })),
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
