#!/usr/bin/env npx tsx
/**
 * Interactive client configuration generator for Podbit.
 *
 * Usage:
 *   npx tsx scripts/setup-client.ts
 *
 * Reads the current .env to detect server settings, then generates
 * ready-to-use configuration snippets for:
 *   - Python (OpenAI SDK)
 *   - Node.js / TypeScript
 *   - cURL
 *   - IDE agents (Cursor, Continue.dev, Claude Code)
 *   - MCP integration
 */

import fs from 'fs';
import path from 'path';
import readline from 'readline';

const ROOT = path.resolve(process.cwd());
const ENV_PATH = path.join(ROOT, '.env');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

function ask(question: string, defaultVal?: string): Promise<string> {
  const suffix = defaultVal ? ` [${defaultVal}]` : '';
  return new Promise(resolve => {
    rl.question(`  ${question}${suffix}: `, answer => {
      resolve(answer.trim() || defaultVal || '');
    });
  });
}

function yn(question: string, defaultYes = true): Promise<boolean> {
  const hint = defaultYes ? '[Y/n]' : '[y/N]';
  return new Promise(resolve => {
    rl.question(`  ${question} ${hint}: `, answer => {
      const a = answer.trim().toLowerCase();
      if (!a) return resolve(defaultYes);
      resolve(a === 'y' || a === 'yes');
    });
  });
}

function readEnv(): Record<string, string> {
  if (!fs.existsSync(ENV_PATH)) return {};
  const lines = fs.readFileSync(ENV_PATH, 'utf-8').split('\n');
  const env: Record<string, string> = {};
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    env[trimmed.substring(0, eq)] = trimmed.substring(eq + 1);
  }
  return env;
}

async function main() {
  console.log('');
  console.log('  ╔═══════════════════════════════════════════╗');
  console.log('  ║       PODBIT — Client Setup Helper         ║');
  console.log('  ╚═══════════════════════════════════════════╝');
  console.log('');

  // Read current server config
  const env = readEnv();
  const host = env['HOST'] || 'localhost';
  const apiPort = env['API_PORT'] || env['PORT'] || '4710';
  const proxyPort = env['PROXY_PORT'] || '11435';
  const hasTls = !!(env['PODBIT_TLS_CERT']);
  const isRemote = host !== 'localhost' && host !== '127.0.0.1';

  // Detect or ask for connection details
  let serverHost: string;
  let protocol: string;
  let apiKey: string;

  if (isRemote) {
    console.log('  Detected remote mode configuration.');
    serverHost = await ask('Server hostname or IP (as seen by clients)', host === '0.0.0.0' ? '' : host);
    if (!serverHost) {
      console.log('  You must provide the hostname clients will use to reach this server.');
      serverHost = await ask('Server hostname or IP');
    }
    protocol = hasTls ? 'https' : 'http';
    console.log('');
    console.log('  Remote mode requires a security key for proxy access.');
    console.log('  Find it in the GUI: Settings page, or via GET /api/admin/key (authenticated).');
    apiKey = await ask('Podbit security key (or press Enter for placeholder)', 'YOUR_SECURITY_KEY');
  } else {
    console.log('  Detected local mode configuration.');
    serverHost = 'localhost';
    protocol = 'http';
    apiKey = 'not-needed';
  }

  const proxyBaseUrl = `${protocol}://${serverHost}:${proxyPort}/v1`;
  const apiBaseUrl = `${protocol}://${serverHost}:${apiPort}`;
  const podbitDir = ROOT;

  console.log('');
  console.log(`  Proxy URL:  ${proxyBaseUrl}`);
  console.log(`  API URL:    ${apiBaseUrl}`);
  console.log(`  Auth:       ${isRemote ? 'Security key required' : 'None (localhost)'}`);
  console.log('');

  // ── Generate snippets ──

  const snippets: { title: string; code: string }[] = [];

  // Python
  snippets.push({
    title: 'Python (OpenAI SDK)',
    code: `from openai import OpenAI

client = OpenAI(
    base_url="${proxyBaseUrl}",
    api_key="${apiKey}"
)

response = client.chat.completions.create(
    model="default",
    messages=[{"role": "user", "content": "What patterns exist?"}],
    temperature=0.7
)
print(response.choices[0].message.content)`,
  });

  // Node.js
  snippets.push({
    title: 'Node.js / TypeScript (OpenAI SDK)',
    code: `import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "${proxyBaseUrl}",
  apiKey: "${apiKey}",
});

const response = await client.chat.completions.create({
  model: "default",
  messages: [{ role: "user", content: "What patterns exist?" }],
});
console.log(response.choices[0].message.content);`,
  });

  // cURL
  const curlAuth = isRemote ? `\n  -H "Authorization: Bearer ${apiKey}" \\` : '';
  snippets.push({
    title: 'cURL',
    code: `curl ${proxyBaseUrl}/chat/completions \\
  -H "Content-Type: application/json" \\${curlAuth}
  -d '{
    "model": "default",
    "messages": [{"role": "user", "content": "Hello"}]
  }'`,
  });

  // Cursor
  snippets.push({
    title: 'Cursor IDE — Settings > Models > Add Model',
    code: `Provider:  OpenAI Compatible
Model:     default
Base URL:  ${proxyBaseUrl}
API Key:   ${apiKey}`,
  });

  // Continue.dev
  snippets.push({
    title: 'Continue.dev — config.json',
    code: `{
  "models": [{
    "title": "Podbit Enriched",
    "provider": "openai",
    "model": "default",
    "apiBase": "${proxyBaseUrl}",
    "apiKey": "${apiKey}"
  }]
}`,
  });

  // MCP configs — local uses mcp-stdio.ts (direct DB), remote uses mcp-stdio-remote.ts (HTTP proxy)
  const mcpCwd = podbitDir.replace(/\\/g, '/');

  if (isRemote) {
    // Remote MCP — thin client that forwards tool calls over HTTP to the server
    console.log('  MCP integration requires a Podbit clone on the client machine.');
    console.log('  Clone: git clone <repo-url>  &&  npm install');
    const clientCwd = await ask('Podbit directory on client machine (or Enter to use server path)', mcpCwd);
    const remoteCwd = clientCwd || mcpCwd;

    const mcpEnv: Record<string, string> = {
      PODBIT_API_URL: apiBaseUrl,
      PODBIT_API_KEY: apiKey,
    };
    if (hasTls) {
      // Self-signed certs may need TLS verification disabled on client
      mcpEnv['NODE_TLS_REJECT_UNAUTHORIZED'] = '0';
    }

    const envJson = JSON.stringify(mcpEnv, null, 6).replace(/\n/g, '\n      ');

    snippets.push({
      title: 'Claude Code MCP (Remote) — .mcp.json or claude_desktop_config.json',
      code: `{
  "mcpServers": {
    "podbit": {
      "command": "npx",
      "args": ["tsx", "mcp-stdio-remote.ts"],
      "cwd": "${remoteCwd}",
      "env": ${envJson}
    }
  }
}`,
    });

    snippets.push({
      title: 'Cursor MCP (Remote) — .cursor/mcp.json',
      code: `{
  "mcpServers": {
    "podbit": {
      "command": "npx",
      "args": ["tsx", "mcp-stdio-remote.ts"],
      "cwd": "${remoteCwd}",
      "env": ${envJson}
    }
  }
}`,
    });
  } else {
    // Local MCP — direct DB access
    snippets.push({
      title: 'Claude Code MCP — .mcp.json or claude_desktop_config.json',
      code: `{
  "mcpServers": {
    "podbit": {
      "command": "npx",
      "args": ["tsx", "mcp-stdio.ts"],
      "cwd": "${mcpCwd}"
    }
  }
}`,
    });

    snippets.push({
      title: 'Cursor MCP — .cursor/mcp.json',
      code: `{
  "mcpServers": {
    "podbit": {
      "command": "npx",
      "args": ["tsx", "mcp-stdio.ts"],
      "cwd": "${mcpCwd}"
    }
  }
}`,
    });
  }

  // Print all snippets
  for (const s of snippets) {
    console.log(`  ┌─ ${s.title}`);
    console.log('  │');
    for (const line of s.code.split('\n')) {
      console.log(`  │  ${line}`);
    }
    console.log('  │');
    console.log('  └────────────────────────────────────────');
    console.log('');
  }

  // Optionally write to file
  const wantFile = await yn('Save these snippets to a file?', false);
  if (wantFile) {
    const outPath = path.join(ROOT, 'client-config.txt');
    let content = `Podbit Client Configuration\n`;
    content += `Generated: ${new Date().toISOString()}\n`;
    content += `Proxy URL: ${proxyBaseUrl}\n`;
    content += `API URL:   ${apiBaseUrl}\n`;
    content += `Auth:      ${isRemote ? 'Security key required' : 'None (localhost)'}\n`;
    content += `${'='.repeat(60)}\n\n`;

    for (const s of snippets) {
      content += `--- ${s.title} ---\n\n${s.code}\n\n`;
    }

    fs.writeFileSync(outPath, content);
    console.log(`  Saved to: ${outPath}`);
    console.log('  (Add client-config.txt to .gitignore if it contains secrets)');
  }

  console.log('');
  if (isRemote) {
    console.log('  Remember:');
    console.log('  - Your security key is in the GUI Settings page');
    console.log('  - For self-signed certs, clients may need NODE_TLS_REJECT_UNAUTHORIZED=0');
    console.log('    or import the cert into the OS trust store');
  }
  console.log('  Setup complete.');
  console.log('');

  rl.close();
}

main().catch(e => { console.error(e); process.exit(1); });
