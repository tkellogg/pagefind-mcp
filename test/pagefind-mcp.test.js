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

const queries = [
  { term: 'openai', expected: /OpenAI launches new GPT model/i },
  { term: 'anthropic', expected: /Anthropic releases Claude 3/i },
  { term: 'machine learning', expected: /Machine Learning breakthrough/i }
];

test('search queries return textual results', async (t) => {
  const { transport, client } = await startClient();
  try {
    for (const { term, expected } of queries) {
      const result = await client.callTool({
        name: 'search_smol_news',
        arguments: { query: term, limit: 3 }
      });
      const data = result.structuredContent;
      assert.ok(data.total > 0, `expected total to be positive for ${term}`);
      assert.ok(Array.isArray(data.hits) && data.hits.length > 0, `expected hits for ${term}`);
      assert.ok(
        typeof data.hits[0].excerpt === 'string' &&
          expected.test(data.hits[0].excerpt.replace(/<[^>]+>/g, '')),
        `excerpt for ${term} should contain expected text`
      );
    }
  } finally {
    await client.close();
    await transport.close();
  }
});
