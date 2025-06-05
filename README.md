# pagefind-mcp
An MCP server for searching static sites that are indexed with pagefind

## Usage

```
node pagefind-mcp.js [--tool-name my_tool] [--no-resources]
```

The tool defaults to `search_pagefind` when no name is provided.

The `--no-resources` flag skips pushing full page resources and instead
fetches each result page to provide a short, markup-free snippet.

`--tool-name` allows you to name the tool, so that the LLM can more easily
find and use it.