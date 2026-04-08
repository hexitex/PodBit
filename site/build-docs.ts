/**
 * Build script: Render React help pages to static HTML for the marketing site.
 *
 * Usage:  npx tsx site/build-docs.ts
 *
 * 1. Shims react-router-dom so <Link> renders as static <a> tags
 * 2. Renders all 16 help sections via renderToStaticMarkup
 * 3. Generates sidebar nav + content articles
 * 4. Runs Tailwind CLI for scoped CSS
 * 5. Generates standalone docs.html for GUI iframe
 * 6. Injects everything into site/index.html
 */

import path from 'node:path';
import fs from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─── Step 1: Swap gui's react-router-dom with our shim ───

const guiRRD = path.resolve(__dirname, '..', 'gui', 'node_modules', 'react-router-dom');
const guiRRDBackup = guiRRD + '.__backup';
const _rootRRDShim = path.resolve(__dirname, '..', 'node_modules', 'react-router-dom');

// Temporarily replace gui's real react-router-dom with our shim
let didSwap = false;
if (fs.existsSync(guiRRD) && !fs.existsSync(guiRRDBackup)) {
  fs.renameSync(guiRRD, guiRRDBackup);
  didSwap = true;
  // Install shim in place of the real package so ESM resolves it
  fs.mkdirSync(guiRRD, { recursive: true });
  const shimJs = `
import React from 'react';
export function Link({ to, children, className, ...rest }) {
  const match = to.match(/^\\/help\\/(.+)/);
  const docId = match ? match[1] : to.replace(/^\\//, '');
  return React.createElement('a', { href: '#doc-' + docId, 'data-doc': docId, className: ('docs-link-internal ' + (className || '')).trim(), ...rest }, children);
}
export function useLocation() { return { pathname: '/help/overview', search: '', hash: '', state: null, key: 'default' }; }
export function useNavigate() { return () => {}; }
export function useParams() { return {}; }
export function useSearchParams() { return [new URLSearchParams(), () => {}]; }
export function Outlet() { return null; }
export function NavLink(props) { return Link(props); }
`;
  fs.writeFileSync(path.join(guiRRD, 'index.js'), shimJs);
  fs.writeFileSync(path.join(guiRRD, 'package.json'), JSON.stringify({
    name: 'react-router-dom',
    version: '0.0.0-shim',
    main: './index.js',
    type: 'module',
  }, null, 2));
}

/** Restores the original gui react-router-dom if it was swapped for the shim during build. */
function restoreRRD() {
  if (didSwap && fs.existsSync(guiRRDBackup)) {
    // Remove shim if it was copied into gui
    if (fs.existsSync(guiRRD)) fs.rmSync(guiRRD, { recursive: true });
    fs.renameSync(guiRRDBackup, guiRRD);
  }
}

// Restore on exit (even on crash)
process.on('exit', restoreRRD);
process.on('SIGINT', () => { restoreRRD(); process.exit(1); });
process.on('uncaughtException', (e) => { restoreRRD(); console.error(e); process.exit(1); });

// ─── Step 2: Import all help section components ───

const guiHelp = path.resolve(__dirname, '..', 'gui', 'src', 'pages', 'help');

/**
 * Convert a help section filename to a file:// URL for dynamic ESM import.
 * Required on Windows where bare file paths are not valid ESM specifiers.
 *
 * @param filename - Help section file name (e.g. "Part1WhatIsPodbit.jsx")
 * @returns Absolute file:// URL string suitable for `import()`
 */
function helpUrl(filename: string): string {
  return pathToFileURL(path.join(guiHelp, filename)).href;
}

/**
 * Main build pipeline: imports all help section components, renders them to
 * static HTML, generates Tailwind CSS, produces standalone docs.html for the
 * GUI iframe, and injects content into the marketing site template.
 */
async function main() {

// Installation & Security
const InstallationSection = (await import(helpUrl('InstallationSection.jsx'))).default;

// Part 1 — Getting Started
const Part1WhatIsPodbit = (await import(helpUrl('Part1WhatIsPodbit.jsx'))).default;
const Part1FirstTenMinutes = (await import(helpUrl('Part1FirstTenMinutes.jsx'))).default;
const Part1KeyConcepts = (await import(helpUrl('Part1KeyConcepts.jsx'))).default;

// Part 2 — Core Workflows
const Part2AddingKnowledge = (await import(helpUrl('Part2AddingKnowledge.jsx'))).default;
const Part2GrowingGraph = (await import(helpUrl('Part2GrowingGraph.jsx'))).default;
const Part2ChatQuestions = (await import(helpUrl('Part2ChatQuestions.jsx'))).default;
const Part2ReviewingCurating = (await import(helpUrl('Part2ReviewingCurating.jsx'))).default;

// Part 3 — Going Deeper
const Part3ProjectsDomains = (await import(helpUrl('Part3ProjectsDomains.jsx'))).default;
const Part3VerificationQuality = (await import(helpUrl('Part3VerificationQuality.jsx'))).default;
const Part3Configuration = (await import(helpUrl('Part3Configuration.jsx'))).default;
const Part3SlashCommands = (await import(helpUrl('Part3SlashCommands.jsx'))).default;
const SecuritySection = (await import(helpUrl('SecuritySection.jsx'))).default;

// Part 4 — Reference
const Part4NodeTypes = (await import(helpUrl('Part4NodeTypes.jsx'))).default;
const Part4Troubleshooting = (await import(helpUrl('Part4Troubleshooting.jsx'))).default;
const Part4Glossary = (await import(helpUrl('Part4Glossary.jsx'))).default;

// ─── Step 3: Section registry (mirrors gui/src/pages/Help.jsx) ───

interface SectionDef {
  key: string;
  name: string;
  component: React.ComponentType;
  group: string;
}

const sectionGroups = [
  {
    label: 'Getting Started',
    sections: [
      { key: 'installation',      name: 'Installation & Setup',     component: InstallationSection },
      { key: 'what-is-podbit',    name: 'What is Podbit?',          component: Part1WhatIsPodbit },
      { key: 'first-steps',       name: 'Your First Steps',          component: Part1FirstTenMinutes },
      { key: 'key-concepts',      name: 'Key Concepts',             component: Part1KeyConcepts },
    ],
  },
  {
    label: 'Core Workflows',
    sections: [
      { key: 'adding-knowledge',    name: 'Adding Knowledge',         component: Part2AddingKnowledge },
      { key: 'growing-graph',       name: 'Growing Your Graph',       component: Part2GrowingGraph },
      { key: 'chat-questions',      name: 'Chat & Asking Questions',  component: Part2ChatQuestions },
      { key: 'reviewing-curating',  name: 'Reviewing & Curating',     component: Part2ReviewingCurating },
    ],
  },
  {
    label: 'Going Deeper',
    sections: [
      { key: 'projects-domains',       name: 'Projects & Domains',       component: Part3ProjectsDomains },
      { key: 'verification-quality',   name: 'Verification & Quality',   component: Part3VerificationQuality },
      { key: 'configuration',          name: 'Configuration',            component: Part3Configuration },
      { key: 'slash-commands',         name: 'Slash Commands Reference',  component: Part3SlashCommands },
      { key: 'security',               name: 'Security & Remote Access',  component: SecuritySection },
    ],
  },
  {
    label: 'Reference',
    sections: [
      { key: 'node-types',        name: 'Node Types',         component: Part4NodeTypes },
      { key: 'troubleshooting',   name: 'Troubleshooting',    component: Part4Troubleshooting },
      { key: 'glossary',          name: 'Glossary',           component: Part4Glossary },
    ],
  },
];

// ─── Step 4: Render sections to HTML ───

console.log('Rendering 16 help sections to static HTML...');

let sidebarHtml = '';
let contentHtml = '';
let first = true;

for (const group of sectionGroups) {
  sidebarHtml += `            <li class="docs-group-label">${group.label}</li>\n`;

  for (const sec of group.sections) {
    const activeClass = first ? ' active' : '';

    // Sidebar link
    sidebarHtml += `            <li><a href="#doc-${sec.key}" class="docs-link${activeClass}" data-doc="${sec.key}">${sec.name}</a></li>\n`;

    // Render component
    const html = renderToStaticMarkup(React.createElement(sec.component));

    // Content article (no `dark` class — controlled by html.dark for iframe, wrapper for site)
    contentHtml += `          <article class="doc-section podbit-docs${activeClass}" data-doc="${sec.key}">\n`;
    contentHtml += `            <h3>${sec.name}</h3>\n`;
    contentHtml += `            ${html}\n`;
    contentHtml += `          </article>\n\n`;

    if (first) first = false;
  }
}

console.log(`  Rendered ${sectionGroups.reduce((n, g) => n + g.sections.length, 0)} sections`);

// ─── Step 5: Generate CSS variables for .podbit-docs scope ───

const varsCSS = `/* Auto-generated by build-docs.ts — do not edit manually */
.podbit-docs {
  /* Dark-mode gray scale (from gui/src/index.css default theme) */
  --gray-50:  249 250 251;
  --gray-100: 243 244 246;
  --gray-200: 229 231 235;
  --gray-300: 209 213 219;
  --gray-400: 156 163 175;
  --gray-500: 107 114 128;
  --gray-600: 75  85  99;
  --gray-700: 55  65  81;
  --gray-800: 31  41  55;
  --gray-900: 17  24  39;
  --gray-950: 3   7   18;

  /* Accent palette (sky-blue from default theme) */
  --accent-50:  240 249 255;
  --accent-100: 224 242 254;
  --accent-200: 186 230 253;
  --accent-300: 125 211 252;
  --accent-400: 56  189 248;
  --accent-500: 14  165 233;
  --accent-600: 2   132 199;
  --accent-700: 3   105 161;
  --accent-800: 7   89  133;
  --accent-900: 12  74  110;
}
`;

const generatedDir = path.resolve(__dirname, 'generated');
fs.mkdirSync(generatedDir, { recursive: true });
fs.writeFileSync(path.join(generatedDir, 'docs-vars.css'), varsCSS);
console.log('  Generated docs-vars.css');

// ─── Step 6: Run Tailwind CLI for scoped CSS ───

const twConfig = path.resolve(__dirname, 'build-docs-tailwind.config.js');
const twInput = path.resolve(__dirname, 'build-docs-input.css');
const twOutput = path.join(generatedDir, 'docs-tailwind.css');

// Resolve tailwindcss from gui/node_modules
const guiNodeModules = path.resolve(__dirname, '..', 'gui', 'node_modules');
const twBin = path.join(guiNodeModules, '.bin', 'tailwindcss');

try {
  execSync(`"${twBin}" -c "${twConfig}" -i "${twInput}" -o "${twOutput}" --minify`, {
    stdio: 'pipe',
    cwd: path.resolve(__dirname, '..'),
  });
  console.log('  Generated docs-tailwind.css');
} catch (_e: any) {
  console.warn('  Warning: Tailwind CLI failed, trying npx fallback...');
  try {
    execSync(`npx tailwindcss -c "${twConfig}" -i "${twInput}" -o "${twOutput}" --minify`, {
      stdio: 'pipe',
      cwd: path.resolve(__dirname, '..', 'gui'),
    });
    console.log('  Generated docs-tailwind.css (via npx)');
  } catch (e2: any) {
    console.error('  ERROR: Could not run Tailwind CSS. Docs will render without Tailwind styles.');
    console.error('  ', e2.message);
    // Write empty file so the link tag doesn't 404
    fs.writeFileSync(twOutput, '/* Tailwind build failed */');
  }
}

// ─── Step 7: Generate standalone docs.html for GUI iframe ───

const tailwindCSS = fs.readFileSync(twOutput, 'utf-8');

// Read theme variable definitions from gui/src/index.css
const indexCSS = fs.readFileSync(path.resolve(__dirname, '..', 'gui', 'src', 'index.css'), 'utf-8');

/** Extracts theme variable blocks and silver saturation filters from index.css for standalone docs. */
function extractThemeCSS(css: string): string {
  const blocks: string[] = [];
  // Text size rules
  blocks.push(`:root { font-size: 16px; }`);
  blocks.push(`html[data-text-size="med"] { font-size: 17.5px; }`);
  blocks.push(`html[data-text-size="large"] { font-size: 19px; }`);

  // Extract all [data-theme] and .dark[data-theme] blocks
  const themeRe = /(?::root,\s*)?(?:\.dark)?(?:\[data-theme[^\]]*\])?(?:\.dark)?\s*\{[^}]*--gray-50[\s\S]*?\}/g;
  let m;
  while ((m = themeRe.exec(css)) !== null) {
    blocks.push(m[0]);
  }

  // Extract silver saturation filters
  const silverStart = css.indexOf('/* Silver: globally mute');
  if (silverStart !== -1) {
    const silverEnd = css.indexOf('/* ═', silverStart + 10);
    if (silverEnd !== -1) {
      blocks.push(css.substring(silverStart, silverEnd).trim());
    }
  }

  return blocks.join('\n\n');
}

const themeCSS = extractThemeCSS(indexCSS);

const standaloneHtml = `<!DOCTYPE html>
<html lang="en" class="dark" data-theme="the-og">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Podbit Documentation</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    /* ── Theme Variables (from gui/src/index.css) ── */
    ${themeCSS}

    /* ── Tailwind (scoped to .podbit-docs) ── */
    ${tailwindCSS}

    /* ── Base ── */
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: rgb(var(--gray-50));
      color: rgb(var(--gray-800));
      line-height: 1.6;
      overflow: hidden;
      height: 100vh;
    }
    html.dark body {
      background: rgb(var(--gray-950));
      color: rgb(var(--gray-200));
    }

    /* ── Layout ── */
    .docs-shell {
      display: flex;
      height: 100vh;
      overflow: hidden;
    }
    .docs-sidebar {
      width: 220px;
      min-width: 220px;
      background: rgb(var(--gray-100));
      border-right: 1px solid rgba(0,0,0,0.08);
      overflow-y: auto;
      padding: 16px 0;
    }
    html.dark .docs-sidebar {
      background: rgb(var(--gray-900));
      border-right-color: rgba(255,255,255,0.06);
    }
    .docs-sidebar ul {
      list-style: none;
      display: flex;
      flex-direction: column;
      gap: 1px;
    }
    .docs-content {
      flex: 1;
      overflow-y: auto;
      padding: 32px 40px;
      min-width: 0;
    }

    /* ── Sidebar ── */
    .docs-group-label {
      padding: 14px 14px 4px;
      font-size: 0.625rem;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: rgb(var(--gray-400));
    }
    html.dark .docs-group-label { color: rgb(var(--gray-500)); }
    .docs-group-label:first-child { padding-top: 4px; }

    /* ── Search ── */
    .docs-search {
      padding: 8px 12px;
      margin-bottom: 4px;
    }
    .docs-search input {
      width: 100%;
      padding: 6px 10px 6px 30px;
      font-size: 0.8125rem;
      font-family: inherit;
      border-radius: 6px;
      border: 1px solid rgba(0,0,0,0.12);
      background: rgb(var(--gray-50));
      color: rgb(var(--gray-800));
      outline: none;
      transition: border-color 0.15s;
    }
    .docs-search input:focus {
      border-color: rgb(var(--accent-400));
      box-shadow: 0 0 0 2px rgba(var(--accent-400), 0.15);
    }
    .docs-search input::placeholder { color: rgb(var(--gray-400)); }
    html.dark .docs-search input {
      background: rgb(var(--gray-800));
      border-color: rgba(255,255,255,0.1);
      color: rgb(var(--gray-200));
    }
    html.dark .docs-search input::placeholder { color: rgb(var(--gray-500)); }
    .docs-search-wrapper {
      position: relative;
    }
    .docs-search-icon {
      position: absolute;
      left: 9px;
      top: 50%;
      transform: translateY(-50%);
      width: 14px;
      height: 14px;
      color: rgb(var(--gray-400));
      pointer-events: none;
    }
    .docs-search-clear {
      position: absolute;
      right: 6px;
      top: 50%;
      transform: translateY(-50%);
      width: 16px;
      height: 16px;
      border: none;
      background: none;
      color: rgb(var(--gray-400));
      cursor: pointer;
      padding: 0;
      display: none;
      font-size: 14px;
      line-height: 1;
    }
    .docs-search-clear.visible { display: block; }
    .docs-search-clear:hover { color: rgb(var(--gray-600)); }
    html.dark .docs-search-clear:hover { color: rgb(var(--gray-300)); }
    .docs-no-results {
      padding: 12px 14px;
      font-size: 0.75rem;
      color: rgb(var(--gray-400));
      display: none;
    }
    .docs-sidebar li.search-hidden { display: none; }
    .docs-sidebar li.docs-group-label.search-hidden { display: none; }
    mark.docs-highlight {
      background: rgba(250, 204, 21, 0.35);
      color: inherit;
      border-radius: 2px;
      padding: 0 1px;
    }
    html.dark mark.docs-highlight {
      background: rgba(250, 204, 21, 0.25);
    }
    .docs-link {
      display: block;
      padding: 5px 14px;
      font-size: 0.8125rem;
      font-weight: 500;
      color: rgb(var(--gray-500));
      border-radius: 4px;
      border-left: 2px solid transparent;
      transition: color 0.15s ease, background 0.15s ease;
      text-decoration: none;
      cursor: pointer;
    }
    html.dark .docs-link { color: rgb(var(--gray-400)); }
    .docs-link:hover {
      color: rgb(var(--gray-700));
      background: rgba(0,0,0,0.04);
    }
    html.dark .docs-link:hover {
      color: rgb(var(--gray-200));
      background: rgba(255,255,255,0.03);
    }
    .docs-link.active {
      color: rgb(var(--gray-900));
      background: rgba(0,0,0,0.06);
      border-left-color: rgb(var(--accent-500));
    }
    html.dark .docs-link.active {
      color: rgb(var(--gray-100));
      background: rgba(255,255,255,0.04);
      border-left-color: rgb(var(--accent-400));
    }

    /* ── Content ── */
    .doc-section { display: none; }
    .doc-section.active {
      display: block;
      animation: doc-fade 0.2s ease;
    }
    @keyframes doc-fade {
      from { opacity: 0; transform: translateY(4px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .doc-section h3 {
      font-size: 1.375rem;
      font-weight: 700;
      color: rgb(var(--gray-800));
      margin-bottom: 12px;
    }
    html.dark .doc-section h3 { color: rgb(var(--gray-100)); }

    /* ── Podbit-docs wrapper ── */
    .podbit-docs {
      font-size: 0.875rem;
      line-height: 1.7;
      color: rgb(var(--gray-600));
    }
    html.dark .podbit-docs { color: rgb(var(--gray-300)); }
    .podbit-docs h2 {
      font-size: 1.0625rem;
      font-weight: 700;
      color: rgb(var(--gray-800));
      margin-bottom: 8px;
    }
    html.dark .podbit-docs h2 { color: rgb(var(--gray-100)); }
    .podbit-docs a {
      color: rgb(var(--accent-600));
      text-decoration: underline;
      text-underline-offset: 2px;
    }
    html.dark .podbit-docs a { color: rgb(var(--accent-400)); }
    .podbit-docs a:hover { color: rgb(var(--gray-900)); }
    html.dark .podbit-docs a:hover { color: rgb(var(--gray-100)); }
    .podbit-docs pre {
      background: rgb(var(--gray-100));
      border: 1px solid rgba(0,0,0,0.06);
      border-radius: 6px;
      padding: 10px 14px;
      overflow-x: auto;
      font-size: 0.8125rem;
      font-family: 'JetBrains Mono', 'Fira Code', monospace;
      line-height: 1.6;
      margin: 10px 0;
    }
    html.dark .podbit-docs pre {
      background: rgb(var(--gray-800));
      border-color: rgba(255,255,255,0.06);
    }
    .podbit-docs code {
      font-family: 'JetBrains Mono', 'Fira Code', monospace;
      font-size: 0.85em;
      background: rgba(0,0,0,0.04);
      padding: 1px 5px;
      border-radius: 3px;
    }
    html.dark .podbit-docs code { background: rgba(255,255,255,0.05); }
    .podbit-docs pre code { background: none; padding: 0; }
    .podbit-docs svg { max-width: 100%; height: auto; }
    .podbit-docs .docs-link-internal {
      color: #4338ca !important;
      cursor: pointer;
      text-decoration: underline;
      text-underline-offset: 2px;
      filter: none !important;
    }
    html.dark .podbit-docs .docs-link-internal { color: #818cf8 !important; }
    .podbit-docs .docs-link-internal:hover { color: #1e1b4b !important; }
    html.dark .podbit-docs .docs-link-internal:hover { color: #c7d2fe !important; }
    .docs-match-count {
      display: inline-block;
      margin-left: 6px;
      padding: 1px 5px;
      border-radius: 10px;
      font-size: 10px;
      font-weight: 600;
      background: rgba(67,56,202,0.1);
      color: #4338ca;
      vertical-align: middle;
      line-height: 1.4;
    }
    html.dark .docs-match-count { background: rgba(129,140,248,0.15); color: #818cf8; }

    /* ── Desaturate — mute colorful elements for cleaner look ── */
    .docs-content [class*="bg-blue-"],
    .docs-content [class*="bg-green-"],
    .docs-content [class*="bg-purple-"],
    .docs-content [class*="bg-orange-"],
    .docs-content [class*="bg-emerald-"],
    .docs-content [class*="bg-cyan-"],
    .docs-content [class*="bg-amber-"],
    .docs-content [class*="bg-rose-"],
    .docs-content [class*="bg-red-"],
    .docs-content [class*="bg-indigo-"],
    .docs-content [class*="bg-teal-"],
    .docs-content [class*="bg-sky-"],
    .docs-content [class*="bg-yellow-"],
    .docs-content [class*="bg-pink-"],
    .docs-content [class*="bg-violet-"] {
      filter: saturate(0.5);
    }
    .docs-content [class*="text-blue-"],
    .docs-content [class*="text-green-"],
    .docs-content [class*="text-purple-"],
    .docs-content [class*="text-orange-"],
    .docs-content [class*="text-emerald-"],
    .docs-content [class*="text-cyan-"],
    .docs-content [class*="text-amber-"],
    .docs-content [class*="text-rose-"],
    .docs-content [class*="text-red-"],
    .docs-content [class*="text-indigo-"],
    .docs-content [class*="text-teal-"],
    .docs-content [class*="text-sky-"],
    .docs-content [class*="text-yellow-"],
    .docs-content [class*="text-pink-"],
    .docs-content [class*="text-violet-"] {
      filter: saturate(0.5);
    }
    .docs-content [class*="border-blue-"],
    .docs-content [class*="border-green-"],
    .docs-content [class*="border-purple-"],
    .docs-content [class*="border-orange-"],
    .docs-content [class*="border-emerald-"],
    .docs-content [class*="border-cyan-"],
    .docs-content [class*="border-amber-"],
    .docs-content [class*="border-rose-"],
    .docs-content [class*="border-red-"],
    .docs-content [class*="border-indigo-"],
    .docs-content [class*="border-teal-"],
    .docs-content [class*="border-sky-"],
    .docs-content [class*="border-yellow-"],
    .docs-content [class*="border-pink-"],
    .docs-content [class*="border-violet-"] {
      filter: saturate(0.5);
    }
    .docs-content [class*="fill-"] { filter: saturate(0.5); }

    /* ── Scrollbar ── */
    ::-webkit-scrollbar { width: 6px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb {
      background: rgba(0,0,0,0.15);
      border-radius: 3px;
    }
    html.dark ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); }
    ::-webkit-scrollbar-thumb:hover { background: rgba(0,0,0,0.25); }
    html.dark ::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.2); }

    /* ── Responsive ── */
    @media (max-width: 768px) {
      .docs-shell { flex-direction: column; }
      .docs-sidebar {
        width: 100%;
        min-width: unset;
        max-height: 200px;
        border-right: none;
        border-bottom: 1px solid rgba(255,255,255,0.06);
      }
      .docs-sidebar ul { flex-direction: row; flex-wrap: wrap; gap: 0; }
      .docs-group-label { display: none; }
      .docs-search { padding: 6px 8px; margin-bottom: 2px; }
      .docs-search input { padding: 4px 8px 4px 28px; font-size: 0.75rem; }
      .docs-link { padding: 6px 10px; font-size: 0.75rem; white-space: nowrap; }
      .docs-content { padding: 20px 16px; }
    }
  </style>
</head>
<body>
  <div class="docs-shell">
    <nav class="docs-sidebar">
      <div class="docs-search">
        <div class="docs-search-wrapper">
          <svg class="docs-search-icon" viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clip-rule="evenodd"/>
          </svg>
          <input type="text" id="docs-search-input" placeholder="Search docs..." autocomplete="off" spellcheck="false"/>
          <button class="docs-search-clear" id="docs-search-clear" title="Clear search">&times;</button>
        </div>
      </div>
      <div class="docs-no-results" id="docs-no-results">No matching sections</div>
      <ul>
${sidebarHtml}
      </ul>
    </nav>
    <div class="docs-content">
${contentHtml}
    </div>
  </div>
  <script>
    /* ── Tab switching ── */
    const docsLinks = document.querySelectorAll('.docs-link');
    const docSections = document.querySelectorAll('.doc-section');

    const docsContent = document.querySelector('.docs-content');
    function switchDoc(docId) {
      docsLinks.forEach(l => l.classList.toggle('active', l.dataset.doc === docId));
      docSections.forEach(s => s.classList.toggle('active', s.dataset.doc === docId));
      if (docsContent) docsContent.scrollTo(0, 0);
    }

    docsLinks.forEach(link => {
      link.addEventListener('click', e => {
        e.preventDefault();
        switchDoc(link.dataset.doc);
        history.replaceState(null, '', '#doc-' + link.dataset.doc);
      });
    });

    document.addEventListener('click', e => {
      const link = e.target.closest('.docs-link-internal');
      if (link && link.dataset.doc) {
        e.preventDefault();
        switchDoc(link.dataset.doc);
        history.replaceState(null, '', '#doc-' + link.dataset.doc);
      }
    });

    function handleHash() {
      const hash = location.hash;
      if (hash && hash.startsWith('#doc-')) switchDoc(hash.replace('#doc-', ''));
    }
    handleHash();
    window.addEventListener('hashchange', handleHash);

    /* ── Search ── */
    const searchInput = document.getElementById('docs-search-input');
    const searchClear = document.getElementById('docs-search-clear');
    const noResults = document.getElementById('docs-no-results');
    const sidebarItems = document.querySelectorAll('.docs-sidebar ul li');
    let activeTerms = [];

    // Build search index: map each doc key to its searchable text
    const searchIndex = {};
    docSections.forEach(sec => {
      searchIndex[sec.dataset.doc] = (sec.textContent || '').toLowerCase();
    });

    function clearHighlights(root) {
      root.querySelectorAll('mark.docs-highlight').forEach(mark => {
        const parent = mark.parentNode;
        parent.replaceChild(document.createTextNode(mark.textContent), mark);
        parent.normalize();
      });
    }

    function highlightTerms(section, terms) {
      if (!terms.length) return;
      // Build regex matching any term (escaped, case-insensitive)
      const escaped = terms.map(t => t.replace(/[.*+?^\${}()|[\\]\\\\]/g, '\\\\$&'));
      const re = new RegExp('(' + escaped.join('|') + ')', 'gi');

      const walker = document.createTreeWalker(section, NodeFilter.SHOW_TEXT, null);
      const textNodes = [];
      while (walker.nextNode()) textNodes.push(walker.currentNode);

      textNodes.forEach(node => {
        if (!node.nodeValue || !re.test(node.nodeValue)) return;
        // Skip nodes inside <pre>, <code>, <svg>, <script>
        const tag = node.parentElement?.tagName;
        if (tag === 'SCRIPT' || tag === 'STYLE') return;

        const frag = document.createDocumentFragment();
        let lastIdx = 0;
        re.lastIndex = 0;
        let m;
        while ((m = re.exec(node.nodeValue)) !== null) {
          if (m.index > lastIdx) frag.appendChild(document.createTextNode(node.nodeValue.slice(lastIdx, m.index)));
          const mark = document.createElement('mark');
          mark.className = 'docs-highlight';
          mark.textContent = m[0];
          frag.appendChild(mark);
          lastIdx = re.lastIndex;
        }
        if (lastIdx < node.nodeValue.length) frag.appendChild(document.createTextNode(node.nodeValue.slice(lastIdx)));
        node.parentNode.replaceChild(frag, node);
      });
    }

    function applyHighlights() {
      docSections.forEach(sec => clearHighlights(sec));
      if (!activeTerms.length) return;
      const active = document.querySelector('.doc-section.active');
      if (active) highlightTerms(active, activeTerms);
    }

    // Patch switchDoc to re-apply highlights after tab change
    const _origSwitchDoc = switchDoc;
    switchDoc = function(docId) {
      _origSwitchDoc(docId);
      applyHighlights();
    };

    function filterDocs(query) {
      query = query.trim().toLowerCase();
      searchClear.classList.toggle('visible', query.length > 0);

      // Remove existing match badges
      document.querySelectorAll('.docs-match-count').forEach(el => el.remove());

      if (!query) {
        sidebarItems.forEach(li => li.classList.remove('search-hidden'));
        noResults.style.display = 'none';
        activeTerms = [];
        applyHighlights();
        return;
      }

      const terms = query.split(/\\s+/).filter(Boolean);
      activeTerms = terms;
      let anyVisible = false;

      sidebarItems.forEach(li => {
        if (li.classList.contains('docs-group-label')) {
          li.classList.add('search-hidden');
          return;
        }
        const link = li.querySelector('.docs-link');
        if (!link) return;

        const docKey = link.dataset.doc;
        const linkText = (link.textContent || '').replace(/\\d+$/, '').trim().toLowerCase();
        const content = searchIndex[docKey] || '';

        const matches = terms.every(t => linkText.includes(t) || content.includes(t));
        li.classList.toggle('search-hidden', !matches);
        if (matches) {
          anyVisible = true;
          // Count total occurrences across all terms in content
          let count = 0;
          terms.forEach(t => {
            let pos = 0;
            while ((pos = content.indexOf(t, pos)) !== -1) { count++; pos += t.length; }
          });
          const badge = document.createElement('span');
          badge.className = 'docs-match-count';
          badge.textContent = String(count);
          link.appendChild(badge);
        }
      });

      let currentGroup = null;
      sidebarItems.forEach(li => {
        if (li.classList.contains('docs-group-label')) {
          currentGroup = li;
          return;
        }
        if (currentGroup && !li.classList.contains('search-hidden')) {
          currentGroup.classList.remove('search-hidden');
        }
      });

      noResults.style.display = anyVisible ? 'none' : 'block';
      applyHighlights();
    }

    let searchTimer;
    searchInput.addEventListener('input', () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => filterDocs(searchInput.value), 150);
    });
    searchClear.addEventListener('click', () => {
      searchInput.value = '';
      filterDocs('');
      searchInput.focus();
    });

    document.addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        searchInput.focus();
        searchInput.select();
      }
      if (e.key === 'Escape' && document.activeElement === searchInput) {
        searchInput.value = '';
        filterDocs('');
        searchInput.blur();
      }
    });

    /* ── Theme sync from parent app via postMessage ── */
    window.addEventListener('message', e => {
      if (!e.data || e.data.type !== 'podbit-theme') return;
      const { theme, isDark, textSize } = e.data;
      const html = document.documentElement;
      if (theme) html.setAttribute('data-theme', theme);
      if (typeof isDark === 'boolean') html.classList.toggle('dark', isDark);
      if (textSize) html.setAttribute('data-text-size', textSize);
    });
  </script>
</body>
</html>`;

const guiPublic = path.resolve(__dirname, '..', 'gui', 'public');
fs.mkdirSync(guiPublic, { recursive: true });
fs.writeFileSync(path.join(guiPublic, 'docs.html'), standaloneHtml);
console.log('  Generated gui/public/docs.html (standalone for iframe)');

// ─── Step 8: Inject into site/docs.html ───

const docsPagePath = path.resolve(__dirname, 'docs.html');
let docsPageHtml = fs.readFileSync(docsPagePath, 'utf-8');

// Replace sidebar
const sidebarStart = '<!-- DOCS_SIDEBAR_START -->';
const sidebarEnd = '<!-- DOCS_SIDEBAR_END -->';
if (docsPageHtml.includes(sidebarStart) && docsPageHtml.includes(sidebarEnd)) {
  const before = docsPageHtml.substring(0, docsPageHtml.indexOf(sidebarStart) + sidebarStart.length);
  const after = docsPageHtml.substring(docsPageHtml.indexOf(sidebarEnd));
  docsPageHtml = before + '\n' + sidebarHtml + '      ' + after;
  console.log('  Injected sidebar (16 sections, 4 groups)');
} else {
  console.error('  ERROR: Could not find DOCS_SIDEBAR_START/END markers in docs.html');
  console.error('  Add <!-- DOCS_SIDEBAR_START --> and <!-- DOCS_SIDEBAR_END --> inside the <ul>');
}

// Replace content
const contentStart = '<!-- DOCS_CONTENT_START -->';
const contentEnd = '<!-- DOCS_CONTENT_END -->';
if (docsPageHtml.includes(contentStart) && docsPageHtml.includes(contentEnd)) {
  const before = docsPageHtml.substring(0, docsPageHtml.indexOf(contentStart) + contentStart.length);
  const after = docsPageHtml.substring(docsPageHtml.indexOf(contentEnd));
  docsPageHtml = before + '\n' + contentHtml + '    ' + after;
  console.log(`  Injected content (${sectionGroups.reduce((n, g) => n + g.sections.length, 0)} articles)`);
} else {
  console.error('  ERROR: Could not find DOCS_CONTENT_START/END markers in docs.html');
  console.error('  Add <!-- DOCS_CONTENT_START --> and <!-- DOCS_CONTENT_END --> inside .docs-page-content');
}

fs.writeFileSync(docsPagePath, docsPageHtml);

// ─── Step 9: Restore gui's react-router-dom ───
restoreRRD();

console.log('\nDone! Open site/index.html in a browser to verify.');

} // end main

main().catch(e => { console.error(e); process.exit(1); });
