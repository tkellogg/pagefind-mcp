# pagefind-mcp
An MCP server for searching static sites that are indexed with pagefind

## Usage

```
npx pagefind-mcp --host <base-url> [--no-resources]
```

The `--host` flag sets the base URL to query. The `--no-resources` flag skips
pushing full page resources and instead fetches each result page to provide a
short, markup-free snippet.
