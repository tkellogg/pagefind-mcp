import test from 'node:test';
import assert from 'node:assert/strict';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { resolve } from 'path';

async function startClient(args = []) {
  const transport = new StdioClientTransport({
    command: 'node',
    args: [resolve('pagefind-mcp.js'), ...args],
    stderr: 'pipe',
    env: process.env
  });
  const client = new Client({ name: 'test-client', version: '0.0.0' });
  await client.connect(transport);
  return { transport, client };
}

const queries = [
  { term: 'Mary Meeker', expected: /Mary Meeker/i },
  { term: 'AI Trends', expected: /AI/i }
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
      assert.ok(
        typeof data.hits[0].content === 'string' && data.hits[0].content.length > 0,
        `content for ${term} should exist`
      );
      // verify returned URL
      const parsed = new URL(data.hits[0].url);
      assert.ok(parsed.protocol.startsWith('http'), `url for ${term} should be valid`);
    }
  } finally {
    await client.close();
    await transport.close();
  }
});

test('resources can be retrieved after search', async (t) => {
  const { transport, client } = await startClient();
  try {
    const result = await client.callTool({
      name: 'search_smol_news',
      arguments: { query: 'Mary Meeker', limit: 1 }
    });
    const hit = result.structuredContent.hits[0];
    const resource = await client.readResource({ uri: hit.url });
    assert.ok(Array.isArray(resource.contents) && resource.contents.length > 0, 'resource should have contents');
    const item = resource.contents[0];
    assert.equal(item.uri, hit.url, 'resource uri should match');
    assert.equal(item.mimeType, 'text/html');
    assert.ok(item.text.includes('Mary Meeker'), 'resource text should contain article');
  } finally {
    await client.close();
    await transport.close();
  }
});

test('--no-resources disables resource access', async (t) => {
  const { transport, client } = await startClient(['--no-resources']);
  try {
    const result = await client.callTool({
      name: 'search_smol_news',
      arguments: { query: 'Mary Meeker', limit: 1 }
    });
    const hit = result.structuredContent.hits[0];
    await assert.rejects(
      client.readResource({ uri: hit.url }),
      /-32601/,
      'readResource should fail when no resources'
    );
  } finally {
    await client.close();
    await transport.close();
  }
});
