/**
 * @module config/ports
 *
 * SINGLE SOURCE OF TRUTH for port numbers used by Podbit services.
 *
 * Resolution order (highest priority first):
 *   1. Environment variables (set in `.env` or the shell):
 *      API_PORT, ORCHESTRATOR_PORT, GUI_PORT, PARTITION_SERVER_PORT, PROXY_PORT,
 *      MATH_LAB_PORT, NN_LAB_PORT, CRITIQUE_LAB_PORT
 *   2. Fallback values from `config/port-defaults.json` (the language-agnostic
 *      source consumed by both TypeScript and the Vite build)
 *
 * Every TypeScript module that needs a port MUST import from here.
 * Do NOT duplicate fallback literals across the codebase.
 *
 * To change ports for an installation, set the corresponding env var in `.env`.
 * Edit `config/port-defaults.json` only if the entire fallback block must move.
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname_ports = path.dirname(fileURLToPath(import.meta.url));
const PORT_DEFAULTS_PATH = path.join(__dirname_ports, 'port-defaults.json');

interface PortDefaults {
    api: number;
    orchestrator: number;
    gui: number;
    partitionServer: number;
    proxy: number;
    mathLab: number;
    nnLab: number;
    critiqueLab: number;
}

function loadPortDefaults(): PortDefaults {
    try {
        const raw = JSON.parse(readFileSync(PORT_DEFAULTS_PATH, 'utf-8'));
        return {
            api: raw.api,
            orchestrator: raw.orchestrator,
            gui: raw.gui,
            partitionServer: raw.partitionServer,
            proxy: raw.proxy,
            mathLab: raw.mathLab,
            nnLab: raw.nnLab,
            critiqueLab: raw.critiqueLab,
        };
    } catch (err: any) {
        throw new Error(`Failed to load config/port-defaults.json (required for port resolution): ${err.message}`);
    }
}

/** Fallback values — sourced from `config/port-defaults.json`. Used only when the corresponding env var is unset. */
export const PORT_DEFAULTS: PortDefaults = loadPortDefaults();

/** Parse an integer env var, returning undefined if missing or invalid. */
function envInt(name: string): number | undefined {
    const raw = process.env[name];
    if (!raw) return undefined;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n > 0 ? n : undefined;
}

/**
 * Effective ports — env var if set, otherwise the hardcoded default.
 * Computed at module load. If you need live re-reads after changing env vars,
 * call `resolvePorts()` instead.
 */
export const PORTS = resolvePorts();

/** Compute effective ports from current `process.env`. Call this if env vars change at runtime. */
export function resolvePorts(): Record<keyof typeof PORT_DEFAULTS, number> {
    return {
        api: envInt('API_PORT') ?? envInt('PORT') ?? PORT_DEFAULTS.api,
        orchestrator: envInt('ORCHESTRATOR_PORT') ?? PORT_DEFAULTS.orchestrator,
        gui: envInt('GUI_PORT') ?? PORT_DEFAULTS.gui,
        partitionServer: envInt('PARTITION_SERVER_PORT') ?? PORT_DEFAULTS.partitionServer,
        proxy: envInt('PROXY_PORT') ?? PORT_DEFAULTS.proxy,
        mathLab: envInt('MATH_LAB_PORT') ?? PORT_DEFAULTS.mathLab,
        nnLab: envInt('NN_LAB_PORT') ?? PORT_DEFAULTS.nnLab,
        critiqueLab: envInt('CRITIQUE_LAB_PORT') ?? PORT_DEFAULTS.critiqueLab,
    };
}

/** Build a localhost URL for a given port. Convenience helper used by config defaults. */
export function localUrl(port: number, path = ''): string {
    const host = process.env.HOST || 'localhost';
    return `http://${host}:${port}${path}`;
}
