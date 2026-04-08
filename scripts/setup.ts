#!/usr/bin/env npx tsx
/**
 * Interactive setup script for Podbit (local or remote).
 *
 * Usage:
 *   npx tsx scripts/setup.ts           # interactive mode selection
 *   npx tsx scripts/setup.ts local     # skip to local setup
 *   npx tsx scripts/setup.ts remote    # skip to remote setup
 *
 * Configures .env with all server settings. Non-destructive: preserves
 * existing values and only overwrites what the user explicitly changes.
 */

import fs from 'fs';
import path from 'path';
import readline from 'readline';
import crypto from 'crypto';
import { execSync, spawnSync } from 'child_process';

const ROOT = path.resolve(process.cwd());
const ENV_PATH = path.join(ROOT, '.env');
const TLS_DIR = path.join(ROOT, 'data', 'tls');
const KEY_PATH = path.join(TLS_DIR, 'podbit.key');
const CERT_PATH = path.join(TLS_DIR, 'podbit.cert');

// ── Helpers ──

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

function writeEnv(env: Record<string, string>): void {
  const existingLines: string[] = fs.existsSync(ENV_PATH)
    ? fs.readFileSync(ENV_PATH, 'utf-8').split('\n')
    : [];

  const written = new Set<string>();
  const output: string[] = [];

  for (const line of existingLines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      output.push(line);
      continue;
    }
    const eq = trimmed.indexOf('=');
    if (eq === -1) { output.push(line); continue; }
    const key = trimmed.substring(0, eq);
    if (key in env) {
      output.push(`${key}=${env[key]}`);
      written.add(key);
    } else {
      output.push(line);
    }
  }

  // Append new keys
  for (const [key, val] of Object.entries(env)) {
    if (!written.has(key)) {
      output.push(`${key}=${val}`);
    }
  }

  // Remove trailing empty lines, add final newline
  while (output.length && output[output.length - 1].trim() === '') output.pop();
  fs.writeFileSync(ENV_PATH, output.join('\n') + '\n');
}

function hasOpenssl(): boolean {
  try { execSync('openssl version', { stdio: 'pipe' }); return true; } catch { return false; }
}

function generateCert(hostname: string): boolean {
  fs.mkdirSync(TLS_DIR, { recursive: true });
  const cmd = [
    'openssl', 'req', '-x509',
    '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:prime256v1',
    '-keyout', KEY_PATH, '-out', CERT_PATH,
    '-days', '365', '-nodes',
    '-subj', `"/CN=${hostname}"`,
    '-addext', `"subjectAltName=DNS:${hostname},DNS:localhost,IP:127.0.0.1"`,
  ].join(' ');

  try {
    execSync(cmd, { stdio: 'pipe' });
  } catch {
    // Fallback without -addext (older openssl)
    const fallback = [
      'openssl', 'req', '-x509',
      '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:prime256v1',
      '-keyout', KEY_PATH, '-out', CERT_PATH,
      '-days', '365', '-nodes',
      '-subj', `"/CN=${hostname}"`,
    ].join(' ');
    try {
      execSync(fallback, { stdio: 'pipe' });
      console.log('    (SAN extension omitted — older openssl version)');
    } catch (e: any) {
      console.error('    Failed to generate certificate:', e.message);
      return false;
    }
  }

  try { fs.chmodSync(KEY_PATH, 0o600); } catch { /* Windows */ }
  console.log(`    Generated: ${CERT_PATH}`);
  console.log(`    Generated: ${KEY_PATH}`);
  return true;
}

function hasEncryptedSqlite(): boolean {
  try {
    require.resolve('better-sqlite3-multiple-ciphers');
    return true;
  } catch { return false; }
}

function generateDbKey(): string {
  return crypto.randomBytes(32).toString('hex');
}

async function setupEncryption(env: Record<string, string>, defaultYes: boolean) {
  console.log('');
  console.log('  --- Database Encryption ---');
  console.log('  Encrypts all SQLite databases at rest using SQLCipher.');
  console.log('  Requires: npm install better-sqlite3-multiple-ciphers');

  const wantEncrypt = await yn('Enable database encryption?', defaultYes);
  if (!wantEncrypt) {
    delete env['PODBIT_DB_KEY'];
    return;
  }

  if (!hasEncryptedSqlite()) {
    console.log('');
    console.log('  Installing better-sqlite3-multiple-ciphers...');
    try {
      execSync('npm install better-sqlite3-multiple-ciphers', { cwd: ROOT, stdio: 'inherit' });
    } catch {
      console.log('  WARNING: Failed to install. You can install it manually later:');
      console.log('    npm install better-sqlite3-multiple-ciphers');
      return;
    }
  }

  const existingKey = env['PODBIT_DB_KEY'];
  if (existingKey) {
    console.log(`    Existing encryption key found (${existingKey.length} chars).`);
    const keepKey = await yn('Keep existing encryption key?');
    if (keepKey) return;
  }

  const useCustom = await yn('Use a custom encryption key? (No = auto-generate)', false);
  if (useCustom) {
    const key = await ask('Encryption key (min 16 characters)');
    if (key.length < 16) {
      console.log('    WARNING: Key is shorter than recommended minimum (16 chars).');
    }
    env['PODBIT_DB_KEY'] = key;
  } else {
    const key = generateDbKey();
    env['PODBIT_DB_KEY'] = key;
    console.log(`    Generated key: ${key}`);
  }

  console.log('');
  console.log('  IMPORTANT: Back up your encryption key! Without it, databases are unrecoverable.');
  console.log('  The key is stored in .env as PODBIT_DB_KEY.');
}

// ── Python Venv Setup ──

const VENV_DIR = path.join(ROOT, 'data', 'evm-venv');
const IS_WIN = process.platform === 'win32';
const VENV_PYTHON = IS_WIN
  ? path.join(VENV_DIR, 'Scripts', 'python.exe')
  : path.join(VENV_DIR, 'bin', 'python3');
const EVM_PIP_PACKAGES = ['mpmath', 'sympy', 'numpy', 'scipy', 'networkx'];

function findSystemPython(): string | null {
  const candidates = IS_WIN ? ['python', 'python3'] : ['python3', 'python'];
  for (const cmd of candidates) {
    try {
      const result = spawnSync(cmd, ['--version'], { stdio: 'pipe', timeout: 5000, shell: IS_WIN });
      const output = (result.stdout?.toString() || '') + (result.stderr?.toString() || '');
      const match = output.match(/Python (\d+)\.(\d+)/);
      if (match && parseInt(match[1], 10) >= 3 && parseInt(match[2], 10) >= 8) return cmd;
    } catch { /* next */ }
  }
  return null;
}

async function setupPythonVenv(env: Record<string, string>) {
  console.log('');
  console.log('  --- EVM Python Environment ---');
  console.log('  The EVM (Empirical Verification Module) uses Python to verify knowledge claims.');
  console.log('  A dedicated virtual environment keeps dependencies isolated.');

  // Check if venv already exists
  if (fs.existsSync(VENV_PYTHON)) {
    const result = spawnSync(VENV_PYTHON, ['--version'], { stdio: 'pipe', timeout: 5000 });
    if (result.status === 0) {
      const ver = result.stdout?.toString().trim() || result.stderr?.toString().trim();
      console.log(`    Existing venv found: ${ver}`);
      env['EVM_PYTHON_PATH'] = VENV_PYTHON;
      const reinstall = await yn('Reinstall packages?', false);
      if (!reinstall) return;
    }
  }

  const wantSetup = await yn('Set up Python virtual environment for EVM?');
  if (!wantSetup) {
    console.log('    Skipped. You can set up later with: npm run setup:python');
    return;
  }

  const pythonCmd = findSystemPython();
  if (!pythonCmd) {
    console.log('    Python 3.8+ not found on PATH.');
    console.log('    Install Python from https://www.python.org/downloads/');
    console.log('    Then run: npm run setup:python');
    return;
  }

  const verResult = spawnSync(pythonCmd, ['--version'], { stdio: 'pipe', timeout: 5000, shell: IS_WIN });
  console.log(`    Using: ${(verResult.stdout?.toString() || verResult.stderr?.toString() || '').trim()}`);

  // Create venv
  console.log(`    Creating venv at: data/evm-venv/`);
  fs.mkdirSync(path.dirname(VENV_DIR), { recursive: true });
  try {
    execSync(`${pythonCmd} -m venv "${VENV_DIR}"`, { cwd: ROOT, stdio: 'pipe', timeout: 60000 });
  } catch (e: any) {
    console.log('    Failed to create venv. On Debian/Ubuntu: sudo apt install python3-venv');
    console.log('    Run later: npm run setup:python');
    return;
  }

  if (!fs.existsSync(VENV_PYTHON)) {
    console.log(`    ERROR: venv created but Python not found at expected path.`);
    return;
  }

  // Upgrade pip quietly
  try {
    execSync(`"${VENV_PYTHON}" -m pip install --upgrade pip`, { cwd: ROOT, stdio: 'pipe', timeout: 60000 });
  } catch { /* non-fatal */ }

  // Install packages
  console.log(`    Installing: ${EVM_PIP_PACKAGES.join(', ')} ...`);
  try {
    execSync(`"${VENV_PYTHON}" -m pip install ${EVM_PIP_PACKAGES.join(' ')}`, {
      cwd: ROOT, stdio: 'inherit', timeout: 300000,
    });
  } catch {
    console.log('    Some packages failed to install (EVM will still work for basic math).');
  }

  env['EVM_PYTHON_PATH'] = VENV_PYTHON;
  console.log(`    Done. EVM_PYTHON_PATH set.`);
}

// ── Setup Modes ──

async function setupLocal(env: Record<string, string>) {
  console.log('');
  console.log('  --- Local Server Setup ---');
  console.log('  Server will bind to localhost only. No authentication required.');
  console.log('');

  env['HOST'] = 'localhost';

  // Ports
  const apiPort = await ask('API server port', env['API_PORT'] || env['PORT'] || '4710');
  env['API_PORT'] = apiPort;

  const proxyPort = await ask('Knowledge proxy port', env['PROXY_PORT'] || '11435');
  env['PROXY_PORT'] = proxyPort;

  const orchPort = await ask('Orchestrator port', env['ORCHESTRATOR_PORT'] || '4711');
  env['ORCHESTRATOR_PORT'] = orchPort;

  // Data directory
  const currentData = env['PODBIT_DATA_DIR'] || '';
  const wantCustomData = await yn('Use a custom data directory?', false);
  if (wantCustomData) {
    const dataDir = await ask('Data directory (absolute path)', currentData || path.join(ROOT, 'data'));
    env['PODBIT_DATA_DIR'] = dataDir;
  } else if (currentData) {
    // Keep existing
  }

  // Runtime behavior
  console.log('');
  console.log('  --- Runtime Behavior ---');

  const autoOrch = await yn('Auto-start orchestrator from MCP server?');
  if (!autoOrch) {
    env['PODBIT_NO_AUTO_ORCHESTRATOR'] = '1';
  } else {
    delete env['PODBIT_NO_AUTO_ORCHESTRATOR'];
  }

  const autoOpen = await yn('Auto-open browser when server starts?');
  if (!autoOpen) {
    env['PODBIT_NO_AUTO_OPEN'] = '1';
  } else {
    delete env['PODBIT_NO_AUTO_OPEN'];
  }

  // EVM Python environment
  await setupPythonVenv(env);

  // Database encryption
  await setupEncryption(env, false);

  // Log level
  const logLevel = await ask('Log level (debug/info/warn/error)', env['LOG_LEVEL'] || 'info');
  if (logLevel !== 'info') env['LOG_LEVEL'] = logLevel;
}

async function setupRemote(env: Record<string, string>) {
  console.log('');
  console.log('  --- Remote Server Setup ---');
  console.log('  Server will bind to all interfaces. Full authentication enabled.');
  console.log('');

  // Host
  const host = await ask('Bind address', env['HOST'] || '0.0.0.0');
  env['HOST'] = host;

  // Ports
  const apiPort = await ask('API server port', env['API_PORT'] || env['PORT'] || '4710');
  env['API_PORT'] = apiPort;

  const proxyPort = await ask('Knowledge proxy port', env['PROXY_PORT'] || '11435');
  env['PROXY_PORT'] = proxyPort;

  const orchPort = await ask('Orchestrator port', env['ORCHESTRATOR_PORT'] || '4711');
  env['ORCHESTRATOR_PORT'] = orchPort;

  // Data directory
  const currentData = env['PODBIT_DATA_DIR'] || '';
  const wantCustomData = await yn('Use a custom data directory?', false);
  if (wantCustomData) {
    const dataDir = await ask('Data directory (absolute path)', currentData || path.join(ROOT, 'data'));
    env['PODBIT_DATA_DIR'] = dataDir;
  }

  // TLS
  console.log('');
  console.log('  --- TLS Certificate ---');
  const hasCert = fs.existsSync(CERT_PATH) && fs.existsSync(KEY_PATH);
  let tlsConfigured = false;

  if (hasCert) {
    console.log(`    Existing certificate found at ${TLS_DIR}`);
    env['PODBIT_TLS_CERT'] = CERT_PATH;
    env['PODBIT_TLS_KEY'] = KEY_PATH;
    tlsConfigured = true;
  } else {
    const wantTls = await yn('Generate a self-signed TLS certificate?');
    if (wantTls) {
      if (hasOpenssl()) {
        const hostname = await ask('Certificate hostname', host === '0.0.0.0' ? 'localhost' : host);
        if (generateCert(hostname)) {
          env['PODBIT_TLS_CERT'] = CERT_PATH;
          env['PODBIT_TLS_KEY'] = KEY_PATH;
          tlsConfigured = true;
        }
      } else {
        console.log('    openssl not found. Install OpenSSL and run: npm run generate-cert');
      }
    } else {
      const certPath = await ask('Path to TLS cert (or blank to skip)', '');
      if (certPath) {
        const keyPath = await ask('Path to TLS key');
        env['PODBIT_TLS_CERT'] = certPath;
        env['PODBIT_TLS_KEY'] = keyPath;
        tlsConfigured = true;
      }
    }
  }

  // CORS
  console.log('');
  const wantCors = await yn('Configure allowed CORS origins?', false);
  if (wantCors) {
    const origins = await ask('Comma-separated origins (e.g. https://my-app.com)');
    if (origins) env['PODBIT_CORS_ORIGINS'] = origins;
  }

  // Runtime behavior
  console.log('');
  console.log('  --- Runtime Behavior ---');
  console.log('  Remote servers typically run services independently.');

  const autoOrch = await yn('Auto-start orchestrator from MCP server?', false);
  if (!autoOrch) {
    env['PODBIT_NO_AUTO_ORCHESTRATOR'] = '1';
  } else {
    delete env['PODBIT_NO_AUTO_ORCHESTRATOR'];
  }

  const autoOpen = await yn('Auto-open browser when server starts?', false);
  if (!autoOpen) {
    env['PODBIT_NO_AUTO_OPEN'] = '1';
  } else {
    delete env['PODBIT_NO_AUTO_OPEN'];
  }

  // EVM Python environment
  await setupPythonVenv(env);

  // Database encryption
  await setupEncryption(env, true);

  // Log level
  const logLevel = await ask('Log level (debug/info/warn/error)', env['LOG_LEVEL'] || 'info');
  if (logLevel !== 'info') env['LOG_LEVEL'] = logLevel;

  if (!tlsConfigured) {
    console.log('');
    console.log('  WARNING: TLS not configured. Passwords and tokens will travel in plaintext.');
  }
}

// ── Main ──

async function main() {
  console.log('');
  console.log('  ╔═══════════════════════════════════════════╗');
  console.log('  ║          PODBIT — Server Setup             ║');
  console.log('  ╚═══════════════════════════════════════════╝');

  // Check prerequisites
  const nodeVersion = process.version;
  const major = parseInt(nodeVersion.slice(1), 10);
  if (major < 18) {
    console.error(`  ERROR: Node.js ${nodeVersion} is too old. Podbit requires Node.js 18+.`);
    process.exit(1);
  }
  console.log(`  Node.js ${nodeVersion}`);

  if (!fs.existsSync(path.join(ROOT, 'node_modules'))) {
    console.log('  Installing dependencies...');
    execSync('npm install', { cwd: ROOT, stdio: 'inherit' });
  }

  const env = readEnv();

  // Mode selection
  let mode = process.argv[2]?.toLowerCase();
  if (mode !== 'local' && mode !== 'remote') {
    console.log('');
    console.log('  Select setup mode:');
    console.log('    1) Local   — localhost only, no auth, no TLS');
    console.log('    2) Remote  — network-accessible, full security');
    console.log('');
    const choice = await ask('Mode (1 or 2)', '1');
    mode = choice === '2' ? 'remote' : 'local';
  }

  if (mode === 'remote') {
    await setupRemote(env);
  } else {
    await setupLocal(env);
  }

  // Write .env
  console.log('');
  console.log('  Writing configuration...');
  writeEnv(env);
  console.log(`    Updated: ${ENV_PATH}`);

  // Summary
  const isRemote = env['HOST'] !== 'localhost' && env['HOST'] !== '127.0.0.1';
  const hasTls = !!env['PODBIT_TLS_CERT'];
  const protocol = hasTls ? 'https' : 'http';
  const displayHost = env['HOST'] === '0.0.0.0' ? 'your-hostname' : (env['HOST'] || 'localhost');
  const apiPort = env['API_PORT'] || '4710';
  const proxyPort = env['PROXY_PORT'] || '11435';

  console.log('');
  console.log('  ╔═══════════════════════════════════════════╗');
  console.log('  ║              SETUP COMPLETE                ║');
  console.log('  ╚═══════════════════════════════════════════╝');
  console.log('');
  console.log('  Configuration:');
  console.log(`    Host:        ${env['HOST'] || 'localhost'}`);
  console.log(`    API port:    ${apiPort}`);
  console.log(`    Proxy port:  ${proxyPort}`);
  console.log(`    Orch. port:  ${env['ORCHESTRATOR_PORT'] || '4711'}`);
  if (env['PODBIT_DATA_DIR']) {
    console.log(`    Data dir:    ${env['PODBIT_DATA_DIR']}`);
  }
  console.log(`    TLS:         ${hasTls ? 'Enabled' : 'Disabled'}`);
  console.log(`    Encryption:  ${env['PODBIT_DB_KEY'] ? 'Enabled (SQLCipher)' : 'Disabled'}`);
  console.log(`    EVM Python:  ${env['EVM_PYTHON_PATH'] || 'System default (python/python3)'}`);
  console.log(`    Mode:        ${isRemote ? 'REMOTE (auth required)' : 'LOCAL (no auth)'}`);
  console.log(`    Auto-orch:   ${env['PODBIT_NO_AUTO_ORCHESTRATOR'] ? 'No (start manually)' : 'Yes'}`);
  console.log(`    Auto-open:   ${env['PODBIT_NO_AUTO_OPEN'] ? 'No' : 'Yes'}`);
  console.log('');
  console.log('  Next steps:');
  console.log('    1. Start the server:');
  console.log('       npm start');
  console.log('');
  console.log(`    2. Open the GUI:`);
  console.log(`       ${protocol}://${displayHost}:${apiPort}`);
  let step = 3;
  if (env['PODBIT_NO_AUTO_ORCHESTRATOR']) {
    console.log(`    ${step}. Start the orchestrator (separate terminal):`);
    console.log('       npm run orchestrate');
    console.log('');
    step++;
  }
  if (isRemote) {
    console.log(`    ${step}. Set admin password on first visit`);
    step++;
    console.log('');
    console.log(`    ${step}. Configure proxy clients:`);
    console.log(`       npm run setup:client`);
  }
  console.log('');
  console.log('    Register LLM models in the GUI (Models page) to start using Podbit.');
  console.log('');

  rl.close();
}

main().catch(e => { console.error(e); process.exit(1); });
