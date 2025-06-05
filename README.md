# pagefind-mcp
An MCP server for searching static sites that are indexed with pagefind

## Usage

```
npx pagefind-mcp --host <base-url> [--no-resources]
```

`--host` sets the base site to index. Prefixing with `http://` or `https://` is
optional; `https` is assumed when omitted. The `--no-resources` flag skips
pushing full page resources and instead fetches each result page to provide a
short, markup-free snippet.
