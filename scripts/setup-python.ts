#!/usr/bin/env npx tsx
/**
 * Setup a self-contained Python virtual environment for the EVM sandbox.
 *
 * Creates data/evm-venv/ with pip packages needed for verification code:
 *   mpmath, sympy, numpy, scipy, networkx
 *
 * Usage:
 *   npx tsx scripts/setup-python.ts          # interactive
 *   npx tsx scripts/setup-python.ts --auto   # non-interactive (CI/scripts)
 *
 * On success, writes EVM_PYTHON_PATH to .env pointing at the venv Python binary.
 */

import { execSync, spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(process.cwd());
const VENV_DIR = path.join(ROOT, 'data', 'evm-venv');
const ENV_PATH = path.join(ROOT, '.env');
const IS_WIN = process.platform === 'win32';

// Python binary inside the venv
const VENV_PYTHON = IS_WIN
  ? path.join(VENV_DIR, 'Scripts', 'python.exe')
  : path.join(VENV_DIR, 'bin', 'python3');

// Pip packages the EVM sandbox's allowed-modules list can use.
// Core math is stdlib; these are the pip-installed scientific packages.
const PIP_PACKAGES = ['mpmath', 'sympy', 'numpy', 'scipy', 'networkx'];

// ── Helpers ──

function findPython(): string | null {
  // Try common Python 3 names
  const candidates = IS_WIN
    ? ['python', 'python3', 'py -3']
    : ['python3', 'python'];

  for (const cmd of candidates) {
    try {
      const result = spawnSync(cmd.split(' ')[0], [...cmd.split(' ').slice(1), '--version'], {
        stdio: 'pipe',
        timeout: 5000,
        shell: IS_WIN,
      });
      const output = (result.stdout?.toString() || '') + (result.stderr?.toString() || '');
      const match = output.match(/Python (\d+)\.(\d+)/);
      if (match && parseInt(match[1], 10) >= 3 && parseInt(match[2], 10) >= 8) {
        return cmd;
      }
    } catch { /* next */ }
  }
  return null;
}

function run(cmd: string, opts: { cwd?: string; stdio?: 'inherit' | 'pipe' } = {}): string {
  return execSync(cmd, {
    cwd: opts.cwd || ROOT,
    stdio: opts.stdio || 'inherit',
    timeout: 300000, // 5 min for pip installs
    shell: true,
  })?.toString() || '';
}

function readEnvFile(): Record<string, string> {
  if (!fs.existsSync(ENV_PATH)) return {};
  const env: Record<string, string> = {};
  for (const line of fs.readFileSync(ENV_PATH, 'utf-8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    env[trimmed.substring(0, eq)] = trimmed.substring(eq + 1);
  }
  return env;
}

function writeEnvKey(key: string, value: string): void {
  const lines = fs.existsSync(ENV_PATH)
    ? fs.readFileSync(ENV_PATH, 'utf-8').split('\n')
    : [];

  let found = false;
  const output = lines.map(line => {
    const trimmed = line.trim();
    if (trimmed.startsWith(`${key}=`)) {
      found = true;
      return `${key}=${value}`;
    }
    return line;
  });

  if (!found) output.push(`${key}=${value}`);
  // Clean trailing blanks
  while (output.length && output[output.length - 1].trim() === '') output.pop();
  fs.writeFileSync(ENV_PATH, output.join('\n') + '\n');
}

// ── Main ──

async function main() {
  const auto = process.argv.includes('--auto');

  console.log('');
  console.log('  ── EVM Python Environment Setup ──');
  console.log('');

  // 1. Check if venv already exists and is functional
  if (fs.existsSync(VENV_PYTHON)) {
    const result = spawnSync(VENV_PYTHON, ['--version'], { stdio: 'pipe', timeout: 5000 });
    if (result.status === 0) {
      const ver = result.stdout?.toString().trim() || result.stderr?.toString().trim();
      console.log(`  Existing venv found: ${ver}`);
      console.log(`  Path: ${VENV_DIR}`);

      if (!auto) {
        // Check if packages are installed
        const check = spawnSync(VENV_PYTHON, ['-c', 'import mpmath, sympy, numpy'], {
          stdio: 'pipe', timeout: 10000,
        });
        if (check.status === 0) {
          console.log('  All required packages already installed.');
          console.log('');
          writeEnvKey('EVM_PYTHON_PATH', VENV_PYTHON);
          console.log(`  EVM_PYTHON_PATH set to: ${VENV_PYTHON}`);
          return;
        }
        console.log('  Some packages missing — will reinstall.');
      }
    }
  }

  // 2. Find system Python
  console.log('  Looking for Python 3.8+ ...');
  const pythonCmd = findPython();
  if (!pythonCmd) {
    console.error('');
    console.error('  ERROR: Python 3.8+ not found on PATH.');
    console.error('  Install Python from https://www.python.org/downloads/');
    console.error('  Then re-run: npm run setup:python');
    process.exit(1);
  }

  // Get version
  const verResult = spawnSync(pythonCmd.split(' ')[0], [...pythonCmd.split(' ').slice(1), '--version'], {
    stdio: 'pipe', timeout: 5000, shell: IS_WIN,
  });
  const pythonVersion = (verResult.stdout?.toString() || verResult.stderr?.toString() || '').trim();
  console.log(`  Found: ${pythonVersion} (${pythonCmd})`);

  // 3. Create venv
  console.log('');
  console.log(`  Creating virtual environment at: ${VENV_DIR}`);
  fs.mkdirSync(path.dirname(VENV_DIR), { recursive: true });

  try {
    run(`${pythonCmd} -m venv "${VENV_DIR}"`);
  } catch (e: any) {
    // venv module might not be installed (some Linux distros)
    console.error('');
    console.error('  ERROR: Failed to create venv. On Debian/Ubuntu, install:');
    console.error('    sudo apt install python3-venv');
    console.error('');
    console.error('  Details:', e.message);
    process.exit(1);
  }

  if (!fs.existsSync(VENV_PYTHON)) {
    console.error(`  ERROR: venv created but Python binary not found at: ${VENV_PYTHON}`);
    process.exit(1);
  }

  console.log('  Virtual environment created.');

  // 4. Upgrade pip
  console.log('');
  console.log('  Upgrading pip...');
  try {
    run(`"${VENV_PYTHON}" -m pip install --upgrade pip`, { stdio: 'pipe' });
  } catch { /* non-fatal */ }

  // 5. Install packages
  console.log(`  Installing packages: ${PIP_PACKAGES.join(', ')}`);
  console.log('  (This may take a few minutes on first install)');
  console.log('');

  try {
    run(`"${VENV_PYTHON}" -m pip install ${PIP_PACKAGES.join(' ')}`);
  } catch (e: any) {
    console.error('');
    console.error('  WARNING: Some packages failed to install.');
    console.error('  The EVM will still work for basic verification (stdlib math).');
    console.error('  You can install missing packages later:');
    console.error(`    "${VENV_PYTHON}" -m pip install ${PIP_PACKAGES.join(' ')}`);
    console.error('');
  }

  // 6. Verify
  console.log('');
  console.log('  Verifying installation...');
  const verifyResult = spawnSync(VENV_PYTHON, ['-c', `
import sys
print(f"Python {sys.version}")
packages = []
for name in ['mpmath', 'sympy', 'numpy', 'scipy', 'networkx']:
    try:
        mod = __import__(name)
        ver = getattr(mod, '__version__', '?')
        packages.append(f"  {name} {ver}")
    except ImportError:
        packages.append(f"  {name} MISSING")
print("\\n".join(packages))
`], { stdio: 'pipe', timeout: 15000 });

  const verifyOutput = verifyResult.stdout?.toString() || '';
  if (verifyOutput) {
    console.log(verifyOutput.split('\n').map(l => `    ${l}`).join('\n'));
  }

  // 7. Write to .env
  writeEnvKey('EVM_PYTHON_PATH', VENV_PYTHON);

  console.log('');
  console.log('  ── Setup Complete ──');
  console.log(`  EVM_PYTHON_PATH=${VENV_PYTHON}`);
  console.log('');
}

main().catch(e => { console.error(e); process.exit(1); });
