/**
 * @module prompts/api-verification
 *
 * External API verification prompt definitions. Covers the full verification
 * pipeline: decision (which APIs to call), interpretation (comparing API
 * responses against claims), extraction (mining new facts from responses),
 * and onboarding (interview-based API configuration). Used by the API
 * verification subsystem in `evm/api/`.
 */

import type { PromptDefinition } from './types.js';
import { loadTemplate } from './loader.js';

const CAT = 'api-verification';

/**
 * API verification prompts, keyed by prompt ID (e.g. `'api.decision'`).
 * Each entry is a {@link PromptDefinition} whose `description` field serves
 * as the canonical documentation for that prompt's purpose and behavior.
 */
export const API_VERIFICATION_PROMPTS: Record<string, PromptDefinition> = {
    'api.query_formulation': {
        id: 'api.query_formulation',
        category: 'api_verification',
        description: 'Build an HTTP request from a claim and per-API query template — must use search endpoints, never guess resource paths',
        variables: ['apiPromptQuery', 'nodeContent', 'varDesc', 'decisionReason', 'baseUrl'],
        content: loadTemplate(CAT, 'api.query_formulation'),
    },

    'api.decision': {
        id: 'api.decision',
        category: 'api_verification',
        description: 'Decide which external APIs (if any) should be called to verify a knowledge claim',
        variables: ['nodeContent', 'domain', 'availableApis', 'variableContext'],
        content: loadTemplate(CAT, 'api.decision'),
    },

    'api.interpreter_system': {
        id: 'api.interpreter_system',
        category: 'api_verification',
        description: 'System prompt for interpreting API responses and classifying verification impact',
        variables: [],
        content: loadTemplate(CAT, 'api.interpreter_system'),
    },

    'api.interpret': {
        id: 'api.interpret',
        category: 'api_verification',
        description: 'Interpret an API response against a knowledge claim',
        variables: ['nodeContent', 'apiName', 'apiResponse', 'variableContext', 'perApiPrompt'],
        content: loadTemplate(CAT, 'api.interpret'),
    },

    'api.extract_system': {
        id: 'api.extract_system',
        category: 'api_verification',
        description: 'System prompt for extracting new knowledge facts from API responses',
        variables: [],
        content: loadTemplate(CAT, 'api.extract_system'),
    },

    'api.extract': {
        id: 'api.extract',
        category: 'api_verification',
        description: 'Extract discrete knowledge facts from an API response',
        variables: ['nodeContent', 'apiName', 'apiResponse', 'perApiPrompt', 'domain', 'decisionReason'],
        content: loadTemplate(CAT, 'api.extract'),
    },

    'api.onboard_start': {
        id: 'api.onboard_start',
        category: 'api_verification',
        description: 'Opening prompt for API onboarding interview',
        variables: ['apiName'],
        content: loadTemplate(CAT, 'api.onboard_start'),
    },

    'api.onboard_continue': {
        id: 'api.onboard_continue',
        category: 'api_verification',
        description: 'Continuation prompt for API onboarding interview',
        variables: ['history', 'response'],
        content: loadTemplate(CAT, 'api.onboard_continue'),
    },
};
