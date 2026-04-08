/**
 * @module proxy-server
 *
 * Re-exports the OpenAI-compatible knowledge proxy server from `proxy/index.ts`.
 * This is the entry point for the orchestrator to spawn the proxy service.
 * The proxy enriches LLM requests with knowledge graph context before
 * forwarding them to the upstream model provider.
 */
export * from './proxy/index.js';
