/**
 * KNOWLEDGE BASE - CODE READER
 *
 * Reads source code files and splits them into logical blocks
 * (functions, classes, top-level declarations).
 * Uses simple regex-based boundary detection — no AST parsing required.
 */

import fs from 'fs';
import path from 'path';
import type { ReaderPlugin, ReaderResult, ChunkResult, ReaderOptions } from './types.js';

const DEFAULT_MAX_CHUNK = 4000;

/** Language detection by extension */
const LANGUAGE_MAP: Record<string, string> = {
    // JavaScript / TypeScript
    ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
    mjs: 'javascript', mts: 'typescript', cjs: 'javascript', cts: 'typescript',
    // Python
    py: 'python', pyi: 'python', pyw: 'python',
    // Ruby
    rb: 'ruby', erb: 'ruby', rake: 'ruby', gemspec: 'ruby',
    // Go / Rust / Zig / Nim
    go: 'go', rs: 'rust', zig: 'zig', nim: 'nim',
    // JVM
    java: 'java', kt: 'kotlin', kts: 'kotlin', scala: 'scala',
    groovy: 'groovy', gradle: 'groovy', clj: 'clojure', cljs: 'clojure',
    // C family
    c: 'c', cpp: 'cpp', cc: 'cpp', cxx: 'cpp', h: 'c', hpp: 'cpp', hxx: 'cpp',
    cs: 'csharp', m: 'objective-c', mm: 'objective-cpp',
    // PHP / Perl
    php: 'php', pl: 'perl', pm: 'perl',
    // Shell
    sh: 'bash', bash: 'bash', zsh: 'bash', fish: 'fish',
    ps1: 'powershell', psm1: 'powershell', bat: 'batch', cmd: 'batch',
    // Web
    html: 'html', htm: 'html', css: 'css', scss: 'scss', less: 'less', sass: 'sass',
    vue: 'vue', svelte: 'svelte', astro: 'astro',
    // SQL
    sql: 'sql', psql: 'sql', plsql: 'sql',
    // Functional / ML
    hs: 'haskell', lhs: 'haskell', ml: 'ocaml', mli: 'ocaml',
    fs: 'fsharp', fsx: 'fsharp', fsi: 'fsharp',
    erl: 'erlang', hrl: 'erlang', ex: 'elixir', exs: 'elixir',
    // Mobile / Systems
    swift: 'swift', dart: 'dart', lua: 'lua',
    // Data / Config as code
    r: 'r', jl: 'julia', tf: 'terraform', hcl: 'hcl', nix: 'nix',
    // Misc
    proto: 'protobuf', graphql: 'graphql', gql: 'graphql',
    sol: 'solidity', vy: 'vyper', wgsl: 'wgsl', glsl: 'glsl', hlsl: 'hlsl',
    cmake: 'cmake', makefile: 'make', dockerfile: 'dockerfile',
};

/** Patterns for function/class boundaries per language family */
const BLOCK_PATTERNS: Record<string, RegExp> = {
    // C-family: function/class/interface declarations
    default: /^(?:export\s+)?(?:async\s+)?(?:function|class|interface|enum|type|const|let|var|def|fn|pub fn|func|fun|sub|proc)\s+\w+/m,
    python: /^(?:def|class|async def)\s+\w+/m,
    ruby: /^(?:def|class|module)\s+\w+/m,
    go: /^(?:func|type)\s+/m,
    rust: /^(?:pub\s+)?(?:fn|struct|enum|trait|impl|mod)\s+/m,
    java: /^(?:public|private|protected|static|\s)*(?:class|interface|enum|void|int|String|boolean|\w+)\s+\w+\s*[({]/m,
};

/**
 * Split source code into logical blocks (functions, classes, etc.) using
 * regex-based boundary detection. Falls back to line-based splitting when
 * no recognizable block patterns are found.
 *
 * @param content - The full source code content
 * @param language - Language identifier (from {@link LANGUAGE_MAP})
 * @param maxChunkSize - Maximum character length per chunk
 * @returns Array of {@link ChunkResult} with type 'code_block'
 */
function splitCode(content: string, language: string, maxChunkSize: number): ChunkResult[] {
    const lines = content.split('\n');
    const pattern = BLOCK_PATTERNS[language] || BLOCK_PATTERNS.default;

    // Find line indices where blocks start
    const blockStarts: number[] = [];
    for (let i = 0; i < lines.length; i++) {
        if (pattern.test(lines[i])) {
            blockStarts.push(i);
        }
    }

    if (blockStarts.length === 0) {
        // No recognizable blocks — split by line count
        return splitByLines(content, maxChunkSize);
    }

    const chunks: ChunkResult[] = [];

    // Handle imports/preamble before first block
    if (blockStarts[0] > 0) {
        const preamble = lines.slice(0, blockStarts[0]).join('\n').trim();
        if (preamble.length > 20) {
            chunks.push({
                index: 0,
                type: 'code_block',
                label: 'Imports & preamble',
                content: preamble.slice(0, maxChunkSize),
                metadata: { language, blockType: 'preamble' },
            });
        }
    }

    // Extract each block
    for (let i = 0; i < blockStarts.length; i++) {
        const start = blockStarts[i];
        const end = i + 1 < blockStarts.length ? blockStarts[i + 1] : lines.length;
        const blockLines = lines.slice(start, end);
        const blockContent = blockLines.join('\n').trimEnd();

        // Extract block name from first line
        const firstLine = lines[start].trim();
        const nameMatch = firstLine.match(/(?:function|class|interface|enum|type|def|fn|func|fun|struct|trait|impl|module|pub fn|async def)\s+(\w+)/);
        const blockName = nameMatch ? nameMatch[1] : firstLine.slice(0, 50);

        if (blockContent.length <= maxChunkSize) {
            chunks.push({
                index: chunks.length,
                type: 'code_block',
                label: blockName,
                content: blockContent,
                metadata: { language, blockName, startLine: start + 1, endLine: end },
            });
        } else {
            // Block too large — split by lines within it
            const subChunks = splitByLines(blockContent, maxChunkSize);
            for (const sub of subChunks) {
                sub.label = `${blockName} (part ${sub.index + 1})`;
                sub.index = chunks.length;
                sub.metadata = { ...sub.metadata, language, blockName };
                chunks.push(sub);
            }
        }
    }

    return chunks;
}

/**
 * Fallback: split code by line boundaries to stay under max chunk size.
 * Used when no recognizable function/class patterns are found, or when
 * a single block exceeds the size limit.
 *
 * @param content - The code content to split
 * @param maxChunkSize - Maximum character length per chunk
 * @returns Array of {@link ChunkResult} chunks
 */
function splitByLines(content: string, maxChunkSize: number): ChunkResult[] {
    const lines = content.split('\n');
    const chunks: ChunkResult[] = [];
    let current = '';
    let partNum = 1;

    for (const line of lines) {
        if (current.length + line.length + 1 > maxChunkSize && current.length > 0) {
            chunks.push({
                index: chunks.length,
                type: 'code_block',
                label: `Part ${partNum}`,
                content: current,
                metadata: { part: partNum },
            });
            partNum++;
            current = '';
        }
        current += (current ? '\n' : '') + line;
    }

    if (current.trim()) {
        chunks.push({
            index: chunks.length,
            type: chunks.length === 0 ? 'full' : 'code_block',
            label: chunks.length === 0 ? 'Full content' : `Part ${partNum}`,
            content: current,
            metadata: chunks.length === 0 ? {} : { part: partNum },
        });
    }

    return chunks;
}

/**
 * Source code reader supporting 50+ languages.
 *
 * Splits code into logical blocks (functions, classes, interfaces, etc.) using
 * regex-based boundary detection -- no AST parsing or external tooling required.
 * Falls back to line-based splitting when no recognizable block patterns are found
 * or when a single block exceeds the chunk size limit.
 * Does not require an LLM.
 */
export const codeReader: ReaderPlugin = {
    id: 'code',
    name: 'Code Reader',
    subsystem: 'reader_code',
    extensions: [
        // JavaScript / TypeScript
        'ts', 'tsx', 'js', 'jsx', 'mjs', 'mts', 'cjs', 'cts',
        // Python
        'py', 'pyi', 'pyw',
        // Ruby
        'rb', 'erb', 'rake', 'gemspec',
        // Go / Rust / Zig / Nim
        'go', 'rs', 'zig', 'nim',
        // JVM
        'java', 'kt', 'kts', 'scala', 'groovy', 'gradle', 'clj', 'cljs',
        // C family
        'c', 'cpp', 'cc', 'cxx', 'h', 'hpp', 'hxx', 'cs', 'm', 'mm',
        // PHP / Perl
        'php', 'pl', 'pm',
        // Shell
        'sh', 'bash', 'zsh', 'fish', 'ps1', 'psm1', 'bat', 'cmd',
        // Web
        'html', 'htm', 'css', 'scss', 'less', 'sass', 'vue', 'svelte', 'astro',
        // SQL
        'sql', 'psql', 'plsql',
        // Functional / ML
        'hs', 'lhs', 'ml', 'mli', 'fs', 'fsx', 'fsi', 'erl', 'hrl', 'ex', 'exs',
        // Mobile / Systems
        'swift', 'dart', 'lua',
        // Data / Config as code
        'r', 'jl', 'tf', 'hcl', 'nix',
        // Misc
        'proto', 'graphql', 'gql', 'sol', 'vy', 'wgsl', 'glsl', 'hlsl',
        'cmake', 'makefile', 'dockerfile',
    ],
    mimeTypes: [
        'text/javascript', 'application/javascript', 'text/typescript',
        'text/x-python', 'text/x-ruby', 'text/x-go', 'text/x-rust',
        'text/x-java', 'text/x-c', 'text/x-cpp', 'text/html', 'text/css',
    ],
    requiresLLM: false,

    async read(filePath: string, options?: ReaderOptions): Promise<ReaderResult> {
        const maxChunkSize = options?.maxChunkSize || DEFAULT_MAX_CHUNK;
        const content = fs.readFileSync(filePath, 'utf-8');
        const ext = path.extname(filePath).replace(/^\./, '').toLowerCase();
        const language = LANGUAGE_MAP[ext] || ext;

        const chunks = splitCode(content, language, maxChunkSize);

        // Ensure at least one chunk
        if (chunks.length === 0) {
            chunks.push({
                index: 0,
                type: 'full',
                label: 'Full content',
                content: content.slice(0, maxChunkSize) || '(empty file)',
                metadata: { language },
            });
        }

        return {
            chunks,
            metadata: { language },
        };
    },
};
