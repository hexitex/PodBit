#!/usr/bin/env npx tsx
/**
 * Generate a self-signed TLS certificate for Podbit.
 *
 * Usage:
 *   npx tsx scripts/generate-cert.ts [hostname]
 *
 * Outputs:
 *   data/tls/podbit.key  — private key
 *   data/tls/podbit.cert — self-signed certificate (valid 365 days)
 *
 * Then set env vars:
 *   PODBIT_TLS_CERT=data/tls/podbit.cert
 *   PODBIT_TLS_KEY=data/tls/podbit.key
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const hostname = process.argv[2] || 'localhost';
const outDir = path.join(process.cwd(), 'data', 'tls');
const keyPath = path.join(outDir, 'podbit.key');
const certPath = path.join(outDir, 'podbit.cert');

// Ensure output directory exists
fs.mkdirSync(outDir, { recursive: true });

// Check for existing files
if (fs.existsSync(keyPath) || fs.existsSync(certPath)) {
    console.error('Certificate files already exist in data/tls/');
    console.error('Delete them first if you want to regenerate.');
    process.exit(1);
}

// Check for openssl
try {
    execSync('openssl version', { stdio: 'pipe' });
} catch {
    console.error('openssl not found. Install OpenSSL and try again.');
    console.error('');
    console.error('  Windows (Git Bash): openssl is usually included with Git for Windows');
    console.error('  macOS: brew install openssl');
    console.error('  Linux: apt install openssl  /  yum install openssl');
    console.error('');
    console.error('Or generate manually:');
    console.error(`  openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:prime256v1 \\`);
    console.error(`    -keyout ${keyPath} -out ${certPath} \\`);
    console.error(`    -days 365 -nodes -subj "/CN=${hostname}" \\`);
    console.error(`    -addext "subjectAltName=DNS:${hostname},IP:127.0.0.1"`);
    process.exit(1);
}

console.log(`Generating self-signed certificate for: ${hostname}`);

// Generate EC P-256 key + self-signed cert
// Using EC rather than RSA for faster TLS handshakes
const cmd = [
    'openssl', 'req',
    '-x509',
    '-newkey', 'ec',
    '-pkeyopt', 'ec_paramgen_curve:prime256v1',
    '-keyout', keyPath,
    '-out', certPath,
    '-days', '365',
    '-nodes',
    '-subj', `"/CN=${hostname}"`,
    '-addext', `"subjectAltName=DNS:${hostname},DNS:localhost,IP:127.0.0.1"`,
].join(' ');

try {
    execSync(cmd, { stdio: 'pipe' });
} catch (_err: any) {
    // Some openssl versions don't support -addext; fall back without SAN
    const fallbackCmd = [
        'openssl', 'req',
        '-x509',
        '-newkey', 'ec',
        '-pkeyopt', 'ec_paramgen_curve:prime256v1',
        '-keyout', keyPath,
        '-out', certPath,
        '-days', '365',
        '-nodes',
        '-subj', `"/CN=${hostname}"`,
    ].join(' ');
    try {
        execSync(fallbackCmd, { stdio: 'pipe' });
        console.log('  (Note: your openssl does not support -addext; SAN extension omitted)');
    } catch (err2: any) {
        console.error('Failed to generate certificate:', err2.message);
        process.exit(1);
    }
}

// Restrict key file permissions (best-effort on Windows)
try {
    fs.chmodSync(keyPath, 0o600);
} catch { /* Windows doesn't support chmod */ }

console.log('');
console.log('Certificate generated:');
console.log(`  Key:  ${keyPath}`);
console.log(`  Cert: ${certPath}`);
console.log('');
console.log('Add to your .env or environment:');
console.log(`  PODBIT_TLS_CERT=${certPath}`);
console.log(`  PODBIT_TLS_KEY=${keyPath}`);
console.log('');
console.log('For browsers to trust this cert, either:');
console.log('  1. Import podbit.cert into your OS/browser trust store');
console.log('  2. Accept the browser warning on first visit');
console.log('');
if (hostname !== 'localhost') {
    console.log(`To bind to this hostname, set HOST=${hostname} in your .env`);
}
