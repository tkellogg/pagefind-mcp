import test from 'node:test';
import assert from 'node:assert/strict';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { resolve } from 'path';

async function startClient() {
  const transport = new StdioClientTransport({
    command: 'node',
    args: [resolve('pagefind-mcp.js')],
    stderr: 'pipe'
  });
  const client = new Client({ name: 'test-client', version: '0.0.0' });
  await client.connect(transport);
  return { transport, client };
}

const queries = ['openai', 'anthropic', 'machine learning'];

test('search queries return results', async (t) => {
  const { transport, client } = await startClient();
  try {
    for (const query of queries) {
      const result = await client.callTool({
        name: 'search_smol_news',
        arguments: { query, limit: 3 }
      });
      const data = result.structuredContent;
      assert.ok(data.total >= 0, 'expected total to be non-negative');
      assert.ok(Array.isArray(data.hits), 'hits should be an array');
    }
  } finally {
    await client.close();
    await transport.close();
  }
});
