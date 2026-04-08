/**
 * Extract display provider from model ID prefix (e.g. "moonshotai/kimi2.5" → "moonshotai"; no slash → full id).
 */
export function getModelProvider(modelId) {
    if (!modelId) return 'unknown';
    const idx = modelId.indexOf('/');
    return idx > 0 ? modelId.substring(0, idx) : modelId;
}
