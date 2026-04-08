/**
 * Pipeline VCR — Gated funnel visualization.
 *
 * Events flow left→right through quality gates.
 * At each gate: some pass through, some drop into rejection baskets below.
 * The funnel narrows as events are filtered.
 *
 * Layout:
 *   [Research] → [GR] → [Resonance] → [Structural] → [Voicing] → [Specificity] → [Dedup] → [Junk] → [Citizen] → [✓ Born]
 *       ↓          ↓         ↓              ↓             ↓             ↓              ↓         ↓         ↓
 *    [basket]   [basket]  [basket]       [basket]      [basket]      [basket]       [basket]  [basket]  [basket]
 *
 * Each gate shows: pass count (continuing right) and fail count (dropping down).
 * Baskets accumulate rejected events and are clickable to investigate.
 */

/** Classifies an activity event into a gate stage and pass/fail for Pipeline VCR. */
export function classifyEvent(evt) {
  const c = evt.category;
  const t = evt.type;
  const d = evt.detail || {};

  // Research cycle — autonomous domain seeding
  if (c === 'cycle' && t === 'research_complete') {
    if (d.added > 0) return { gate: 'research', passed: true };
    return { gate: 'research', passed: false, reason: 'no seeds accepted' };
  }
  if (c === 'cycle' && t === 'research_domain_skip')
    return { gate: 'research', passed: false, reason: 'off-topic domain' };
  if (c === 'cycle' && t === 'research_domain_exhausted')
    return { gate: 'research', passed: false, reason: 'domain exhausted' };
  if (c === 'cycle' && t === 'research_all_exhausted')
    return { gate: 'research', passed: false, reason: 'all exhausted' };
  if (c === 'cycle' && t === 'research_relevance')
    return { gate: 'research', passed: false, reason: `relevance gate (${d.rejected}/${d.total})` };

  // Ground rules — synthesizability classification (pre-synthesis gate)
  if (c === 'system' && t === 'ground_rules_pass')
    return { gate: 'ground_rules', passed: true };
  if (c === 'system' && t === 'ground_rules_cull')
    return { gate: 'ground_rules', passed: false, reason: d.action || 'non-synthesizable' };

  // Gate events — pass or fail at specific gates
  if (c === 'synthesis' && t === 'similarity_check' && d.gate === 'resonance') {
    let reason;
    if (d.passed === false) reason = 'below threshold';
    return { gate: 'resonance', passed: d.passed !== false, reason };
  }
  if (c === 'synthesis' && t === 'similarity_check' && d.gate === 'ceiling')
    return { gate: 'resonance', passed: false, reason: 'above ceiling' };
  if (c === 'synthesis' && t === 'similarity_check' && d.gate === 'partner_search')
    return { gate: 'resonance', passed: false, reason: 'no partner' };
  if (c === 'synthesis' && t === 'similarity_check' && d.gate === 'structural')
    return { gate: 'structural', passed: d.passed !== false };
  if (c === 'synthesis' && t === 'structural_passed')
    return { gate: 'structural', passed: true };
  if (c === 'synthesis' && t === 'rejected' && ['tautology', 'low_vocabulary', 'low_specificity'].some(r => (d.reason || '').includes(r)))
    return { gate: 'structural', passed: false };

  // Connection screen — pre-voicing mechanistic dependency check
  if (c === 'synthesis' && t === 'connection_screen_rejected')
    return { gate: 'connection_screen', passed: false, reason: d.reason || d.rejectionQuestion || 'failed' };
  if (c === 'synthesis' && t === 'connection_screen_passed')
    return { gate: 'connection_screen', passed: true };

  // Voicing — extract sub-reason from activity detail
  if (c === 'voicing' && t === 'rejected') {
    let reason = 'voicing';
    const msg = evt.message || '';
    if (msg.startsWith('Truncated:') || d.gate === 'truncation') reason = 'truncated';
    else if (msg.startsWith('Too long:') || d.gate === 'word_count') reason = 'too long';
    else if (msg.startsWith('Too derivative')) reason = 'derivative';
    else if (msg.startsWith('Hallucination:')) {
      // Extract specific hallucination sub-reasons
      const reasons = d.reasons || [];
      if (reasons.some(r => r.startsWith('fabricated numbers'))) reason = 'fabricated numbers';
      else if (reasons.some(r => r.includes('verbose'))) reason = 'verbose';
      else if (reasons.some(r => r.includes('novel content'))) reason = 'novel ratio';
      else if (reasons.some(r => r.includes('financial'))) reason = 'financial claim';
      else if (reasons.some(r => r.includes('number scope'))) reason = 'number scope';
      else if (reasons.some(r => r.includes('multiplier'))) reason = 'multiplier';
      else reason = 'hallucination';
    }
    else if (msg.startsWith('Consultant:')) reason = 'consultant';
    return { gate: 'voicing', passed: false, reason };
  }
  if (c === 'synthesis' && t === 'consultant_escalation')
    return { gate: 'voicing', passed: false, reason: 'escalated' };
  if (c === 'cycle' && t === 'voicing_rejected') {
    const reason = d.rejectionReason || d.reason || 'voicing';
    if (reason === 'redundant_pairing') return { gate: 'resonance', passed: false, reason: 'redundant pairing' };
    return { gate: 'voicing', passed: false, reason };
  }
  if (c === 'cycle' && t === 'voicing_created')
    return { gate: 'voicing', passed: true };
  if (c === 'synthesis' && t === 'voicing_passed')
    return { gate: 'voicing', passed: true };
  if (c === 'synthesis' && t === 'voicing_rejected') {
    const reason = d.rejectionReason || 'voicing';
    return { gate: 'voicing', passed: false, reason };
  }

  // Claim provenance
  if (c === 'synthesis' && t === 'claim_provenance_rejected')
    return { gate: 'provenance', passed: false };
  if (c === 'synthesis' && t === 'claim_provenance_passed')
    return { gate: 'provenance', passed: true };

  // Counterfactual
  if (c === 'synthesis' && t === 'counterfactual_rejected')
    return { gate: 'counterfactual', passed: false };
  if (c === 'synthesis' && t === 'counterfactual_passed')
    return { gate: 'counterfactual', passed: true };

  // Redundancy — normalize reason to categoric labels
  if (c === 'synthesis' && t === 'redundancy_ceiling_rejected') {
    const raw = d.reason || '';
    let reason = 'redundant';
    if (raw.startsWith('Paraphrase:')) reason = 'paraphrase';
    else if (raw.startsWith('Summary/listing:')) reason = 'summary/listing';
    return { gate: 'redundancy', passed: false, reason };
  }
  if (c === 'synthesis' && t === 'redundancy_ceiling_passed')
    return { gate: 'redundancy', passed: true };

  // Dedup — normalize reason to strip unique similarity values
  if (c === 'synthesis' && t === 'similarity_check' && d.gate === 'dedup') {
    let reason ;
    if (d.passed === false) {
      const raw = d.reason || '';
      if (raw.includes('LLM judge')) reason = 'LLM judge: duplicate';
      else if (raw.includes('hard ceiling')) reason = 'above hard ceiling';
      else if (raw.includes('Embedding similarity')) reason = 'embedding similarity';
      else if (raw.includes('Word overlap')) reason = 'word overlap';
      else reason = 'duplicate';
    }
    return { gate: 'dedup', passed: d.passed !== false, reason };
  }

  // Dedup (new event names from domain-directed / cluster paths)
  if (c === 'synthesis' && t === 'dedup_passed')
    return { gate: 'dedup', passed: true };
  if (c === 'synthesis' && t === 'dedup_attractors_skipped')
    return { gate: 'dedup', passed: true, reason: 'attractors skipped' };

  // Junk filter
  if (c === 'synthesis' && t === 'similarity_check' && d.gate === 'junk')
    return { gate: 'junk', passed: d.passed !== false };
  if (c === 'synthesis' && t === 'junk_filter_passed')
    return { gate: 'junk', passed: true };

  // Specificity
  if (c === 'synthesis' && t === 'similarity_check' && d.gate === 'specificity')
    return { gate: 'specificity', passed: d.passed !== false };
  if (c === 'synthesis' && t === 'specificity_passed')
    return { gate: 'specificity', passed: true };

  // Minitruth — LLM reviewer in birth pipeline
  if (c === 'synthesis' && t === 'minitruth_accept')
    return { gate: 'minitruth', passed: true };
  if (c === 'synthesis' && t === 'minitruth_rework')
    return { gate: 'minitruth', passed: false, reason: 'rework' };
  if (c === 'synthesis' && t === 'minitruth_reject')
    return { gate: 'minitruth', passed: false, reason: 'rejected' };
  if (c === 'synthesis' && t === 'minitruth_rework_failed')
    return { gate: 'minitruth', passed: false, reason: 'rework failed' };
  if (c === 'synthesis' && t === 'minitruth_error')
    return { gate: 'minitruth', passed: true, reason: 'error (fail-open)' };
  // Legacy: citizen_validation events (historical activity before rename)
  if (c === 'synthesis' && t === 'citizen_validation_accept')
    return { gate: 'minitruth', passed: true };
  if (c === 'synthesis' && t === 'citizen_validation_rework')
    return { gate: 'minitruth', passed: false, reason: 'rework' };
  if (c === 'synthesis' && t === 'citizen_validation_reject')
    return { gate: 'minitruth', passed: false, reason: 'rejected' };
  if (c === 'synthesis' && t === 'citizen_rework_failed')
    return { gate: 'minitruth', passed: false, reason: 'rework failed' };
  if (c === 'synthesis' && t === 'citizen_validation_error')
    return { gate: 'minitruth', passed: true, reason: 'error (fail-open)' };

  // Legacy: consultant pipeline gate (historical events)
  if (c === 'synthesis' && t === 'consultant_pipeline_rejected')
    return { gate: 'consultant_pipeline', passed: false };
  if (c === 'synthesis' && t === 'consultant_pipeline_passed')
    return { gate: 'consultant_pipeline', passed: true };

  // Born — successfully created
  if (c === 'synthesis' && t === 'child_created')
    return { gate: 'born', passed: true };
  if (c === 'elite' && t === 'child_created')
    return { gate: 'born', passed: true };

  // Population control — cull pipeline events
  if (c === 'cycle' && t === 'population_control_boost')
    return { gate: 'cull_boost', passed: true, cull: true };
  if (c === 'cycle' && t === 'population_control_demote')
    return { gate: 'cull_demote', passed: true, cull: true };
  if (c === 'cycle' && t === 'population_control_archive')
    return { gate: 'cull_archive', passed: true, cull: true };
  if (c === 'cycle' && t === 'population_control_error')
    return { gate: 'cull_error', passed: false, cull: true };

  // Embedding eval — pre-screen results (shadow or live)
  if (c === 'cycle' && t === 'embedding_eval') {
    const failed = d.anyFail === true;
    return { gate: 'cull_embedding', passed: !failed, cull: true };
  }

  // Dedup sweep — post-birth duplicate archival
  if (c === 'cycle' && t === 'population_control_dedup')
    return { gate: 'cull_dedup', passed: true, cull: true };
  if (c === 'cycle' && t === 'population_control_dedup_summary')
    return { gate: 'cull_dedup', passed: true, cull: true };

  // Lab verification events
  if (c === 'system' && t === 'evm_start')
    return { gate: 'lab_extract', passed: true, lab: true };
  if (c === 'system' && t === 'evm_spec_extracted')
    return { gate: 'lab_extract', passed: true, lab: true };
  if (c === 'system' && t === 'evm_not_reducible')
    return { gate: 'lab_extract', passed: false, lab: true, reason: d.reason || 'not reducible' };
  if (c === 'system' && t === 'evm_complete') {
    const supported = d.claimSupported;
    return { gate: supported ? 'lab_supported' : 'lab_refuted', passed: true, lab: true };
  }
  if (c === 'lab' && t === 'taint_propagated')
    return { gate: 'lab_taint', passed: true, lab: true };
  if (c === 'lab' && t === 'evidence_stored')
    return { gate: 'lab_evidence', passed: true, lab: true };

  return null; // not a pipeline event
}

// Gate definitions — unified birth pipeline (mechanical checks + minitruth)
export const GATES = [
  { id: 'research',      label: 'Research',       short: 'Rsch' },
  { id: 'ground_rules',  label: 'Ground Rules',  short: 'GR' },
  { id: 'resonance',     label: 'Resonance',     short: 'Res' },
  { id: 'structural',    label: 'Structural',     short: 'Str' },
  { id: 'voicing',       label: 'Voicing',        short: 'Voice' },
  { id: 'specificity',   label: 'Specificity',    short: 'Spec' },
  { id: 'dedup',         label: 'Dedup',           short: 'Dup' },
  { id: 'junk',          label: 'Junk',            short: 'Junk' },
  { id: 'minitruth',     label: 'Minitruth',       short: 'MT' },
  { id: 'born',          label: 'Born',            short: '✓' },
];
// Lab verification gate definitions
export const LAB_GATES = [
  { id: 'lab_extract',   label: 'Spec Extraction', short: 'Ext' },
  { id: 'lab_supported', label: 'Supported',       short: '✓' },
  { id: 'lab_refuted',   label: 'Refuted',         short: '✗' },
  { id: 'lab_taint',     label: 'Tainted',         short: 'T' },
  { id: 'lab_evidence',  label: 'Evidence',         short: 'Ev' },
];

// Cull pipeline gate definitions — simple triage outcomes (not a multi-gate funnel)
export const CULL_GATES = [
  { id: 'cull_embedding', label: 'Embed Eval', short: 'EE', color: '#8b5cf6' },  // violet
  { id: 'cull_boost',     label: 'Boosted',    short: '↑',  color: '#10b981' },  // emerald
  { id: 'cull_demote',    label: 'Demoted',    short: '↓',  color: '#f59e0b' },  // amber
  { id: 'cull_archive',   label: 'Archived',   short: '✗',  color: '#ef4444' },  // red
  { id: 'cull_dedup',     label: 'Dedup',      short: 'Dd', color: '#f97316' },  // orange
  { id: 'cull_error',     label: 'Errors',     short: '!',  color: '#6b7280' },  // gray
];

// Layout constants
export const SVG_WIDTH = 1100;
export const SVG_HEIGHT = 320;
export const GATE_Y = 80;            // Y of the main flow line
export const GATE_WIDTH = 64;
export const GATE_HEIGHT = 40;
export const BASKET_Y = 200;         // Y of rejection baskets
export const BASKET_WIDTH = 60;
export const BASKET_HEIGHT = 80;     // Baskets are taller — they fill up
export const SVG_PADDING = 40;

// Compute x positions for gate array
function computeGatePositions(gates) {
  const usable = SVG_WIDTH - SVG_PADDING * 2 - GATE_WIDTH;
  gates.forEach((g, i) => {
    g.x = SVG_PADDING + GATE_WIDTH / 2 + (usable * i) / (gates.length - 1);
  });
}
computeGatePositions(GATES);

// Colors
export const PASS_COLOR = '#34d399';
export const FAIL_COLOR = '#ef4444';
export const FLOW_COLOR = '#a855f7';
export const BORN_COLOR = '#10b981';

// Per-gate colors for visual distinction in the pipeline diagram
export const GATE_COLORS = {
  resonance:           '#8b5cf6', // violet
  structural:          '#6366f1', // indigo
  voicing:             '#a855f7', // purple
  specificity:         '#ec4899', // pink
  dedup:               '#f97316', // orange
  junk:                '#ef4444', // red
  minitruth:           '#06b6d4', // cyan — minitruth reviewer
  born:                '#10b981', // emerald
  research:            '#22d3ee', // cyan-light
  ground_rules:        '#14b8a6', // teal
  // Lab verification gates
  lab_extract:         '#a855f7', // purple
  lab_supported:       '#10b981', // emerald
  lab_refuted:         '#ef4444', // red
  lab_taint:           '#f59e0b', // amber
  lab_evidence:        '#06b6d4', // cyan
  // Legacy gate colors (for historical activity events)
  connection_screen:   '#818cf8', // indigo-light
  provenance:          '#3b82f6', // blue
  counterfactual:      '#0ea5e9', // sky
  consultant_pipeline: '#06b6d4', // cyan
  redundancy:          '#f59e0b', // amber
};

// VCR — default speed is 100x since events are minutes/hours apart
export const SPEED_OPTIONS = [
  { label: '1x', value: 1 },
  { label: '10x', value: 10 },
  { label: '50x', value: 50 },
  { label: '100x', value: 100 },
  { label: '500x', value: 500 },
  { label: '1000x', value: 1000 },
];
export const DEFAULT_SPEED = 100;

export const MAX_VISIBLE_PARTICLES = 40;
export const PARTICLE_RADIUS = 4;
