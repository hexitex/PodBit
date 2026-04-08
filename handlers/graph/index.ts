/**
 * Graph handler — barrel re-exports for node CRUD operations.
 * @module handlers/graph
 */
export { parseEmbeddingField, handleQuery } from './query.js';
export { handleGet, handleLineage } from './read.js';
export { handlePropose } from './propose.js';
export { validateProposal } from './validate.js';
export { handleRemove, handleEdit } from './modify.js';
