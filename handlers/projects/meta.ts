import { setMaxListeners } from 'events';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname: string = path.dirname(fileURLToPath(import.meta.url));
const projectRoot: string = path.join(__dirname, '..', '..');
const projectsMetaPath: string = path.join(projectRoot, 'data', 'projects.json');

// =============================================================================
// TYPES
// =============================================================================

export interface ProjectMeta {
    created: string;
    lastSaved: string;
    description: string;
    nodeCount: number;
    domains: string[];
    purpose?: string;
    goals?: string[];
    autoBridge?: boolean;
}

export interface ProjectsFile {
    currentProject: string | null;
    projects: Record<string, ProjectMeta>;
}

// =============================================================================
// METADATA HELPERS
// =============================================================================

/** Reads data/projects.json (current project + project metadata); returns defaults if missing. */
export function readProjectsMeta(): ProjectsFile {
    if (!fs.existsSync(projectsMetaPath)) {
        return { currentProject: null, projects: {} };
    }
    try {
        return JSON.parse(fs.readFileSync(projectsMetaPath, 'utf8'));
    } catch {
        return { currentProject: null, projects: {} };
    }
}

/** Writes project metadata to data/projects.json; creates directory if needed. */
export function writeProjectsMeta(meta: ProjectsFile): void {
    const dir = path.dirname(projectsMetaPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(projectsMetaPath, JSON.stringify(meta, null, 2));
}

// =============================================================================
// PROJECT SWITCHING GUARD
// =============================================================================

/** True while a project switch is in progress. Inflight cycles check this
 *  before proposing nodes to prevent cross-project contamination. */
let _projectSwitching = false;

/** Global AbortController — aborted during project switch to cancel inflight
 *  LLM HTTP requests. Recreated after each switch completes. */
let _switchAbortController = new AbortController();
// Every in-flight fetch() adds an abort listener to this signal.
// Under heavy synthesis, 100+ concurrent requests is normal — suppress the warning.
setMaxListeners(0, _switchAbortController.signal);

/** True while a project switch is in progress; used by cycles to avoid proposing into the wrong DB. */
export function isProjectSwitching(): boolean {
    return _projectSwitching;
}

/** Returns the current abort signal for fetch() so inflight LLM requests are cancelled on project switch. */
export function getProjectAbortSignal(): AbortSignal {
    return _switchAbortController.signal;
}

/** Sets the project-switching flag (true during switch, false when done). */
export function setProjectSwitching(value: boolean): void {
    _projectSwitching = value;
}

/** Returns the AbortController used to cancel inflight requests on project switch. */
export function getAbortController(): AbortController {
    return _switchAbortController;
}

/** Creates a new AbortController after a switch completes so new requests are not aborted. */
export function resetAbortController(): void {
    _switchAbortController = new AbortController();
    setMaxListeners(0, _switchAbortController.signal);
}
