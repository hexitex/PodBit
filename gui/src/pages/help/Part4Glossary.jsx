

const glossaryTerms = [
  { term: 'Abstraction trajectory', definition: 'Classification for general/philosophical synthesis nodes. Lower initial weight to prevent vague drift.' },
  { term: 'API enrichment', definition: 'External data APIs called during lab verification to ground claims in real data.' },
  { term: 'Autorating', definition: 'Autonomous cycle that scores nodes on quality and adjusts their weight.' },
  { term: 'Breakthrough', definition: 'A node promoted after validation scoring. Represents the graph\'s most validated insights. Weight 1.5.' },
  { term: 'Bridge', definition: 'Connection between two partitions allowing cross-partition synthesis.' },
  { term: 'Claim provenance', definition: 'Quality gate checking whether synthesis output is grounded in parent nodes.' },
  { term: 'Consultant pipeline', definition: 'Pipeline mode where a single LLM call replaces 5 mechanical quality gates.' },
  { term: 'Context engine', definition: 'System that selects and delivers relevant knowledge to LLM conversations.' },
  { term: 'Counterfactual independence', definition: 'Quality gate verifying both parent nodes genuinely contribute to synthesis.' },
  { term: 'Domain', definition: 'String label organizing nodes into logical groups (e.g., "biology", "architecture").' },
  { term: 'Decomposition Pipeline', definition: 'Two-stage LLM pipeline for KB document ingestion. Stage 1 decomposes sections into atomic classified claims. Stage 2 filters, assigns weights, and formats for graph ingestion.' },
  { term: 'Edge', definition: 'Parent-child relationship between nodes in the knowledge graph.' },
  { term: 'Elite pool', definition: 'Curated set of lab-verified nodes that undergo generational synthesis for progressive refinement.' },
  { term: 'Embedding', definition: 'Vector representation of node content used for similarity search and pairing.' },
  { term: 'Lab Verification', definition: 'Verification system that submits claims to external lab servers for empirical testing. Labs run experiments and return raw data; Podbit evaluates results against spec criteria. The podbit.labVerify MCP tool provides access.' },
  { term: 'Experiment Spec', definition: 'Structured description of what to test, extracted from a claim by Podbit. Sent to labs — never contains the raw claim narrative.' },
  { term: 'Falsifiability Review', definition: 'Adversarial LLM check on extracted specs. A second model judges whether setup parameters are cherry-picked to guarantee the claimed result. Catches tautological tests that pass structural checks.' },
  { term: 'Freeze', definition: 'Node state during active lab verification — frozen nodes are excluded from synthesis, decay, and lifecycle sweeps.' },
  { term: 'Fitness grading', definition: 'Quality gate assessing overall synthesis output quality.' },
  { term: 'Gold standard', definition: 'Reference outputs for auto-tune parameter optimization (3 tiers: ideal, good, acceptable).' },
  { term: 'Hallucination detection', definition: 'Quality gate flagging invented information in synthesis output.' },
  { term: 'Heuristic pipeline', definition: 'Default pipeline mode with all mechanical quality gates (100+ parameters).' },
  { term: 'Junk filter', definition: 'Blocks content similar to previously junked (removed as junk) nodes.' },
  { term: 'Knowledge proxy', definition: 'OpenAI-compatible endpoint that enriches LLM requests with graph knowledge.' },
  { term: 'Knowledge trajectory', definition: 'Classification for specific/factual synthesis nodes. Parents get weight boost.' },
  { term: 'Lineage', definition: 'Parent-child ancestry chain of a node through the knowledge graph DAG.' },
  { term: 'Manifest', definition: 'Project metadata (purpose, domains, goals, key questions) that grounds all LLM reasoning.' },
  { term: 'MCP (Model Context Protocol)', definition: 'Protocol for AI agents to interact with Podbit tools.' },
  { term: 'Node', definition: 'A piece of knowledge in the graph with content, type, domain, weight, salience, and embedding.' },
  { term: 'Number variables', definition: 'System replacing domain-specific numbers with [[[PREFIX+nnn]]] placeholders to prevent universalization during synthesis.' },
  { term: 'Partition', definition: 'Group of domains that can synthesize together. Domains in different partitions are isolated unless bridged.' },
  { term: 'Persona', definition: 'Voicing perspective mode: object-following, sincere, cynic, pragmatist, child.' },
  { term: 'Possible', definition: 'Pre-breakthrough candidate that has passed initial validation gates.' },
  { term: 'Question node', definition: 'Knowledge gap identified by the question cycle.' },
  { term: 'Raw node', definition: 'Verbatim KB ingestion content, searchable but excluded from synthesis.' },
  { term: 'Redundancy ceiling', definition: 'Quality gate preventing duplicate insights.' },
  { term: 'Research cycle', definition: 'Autonomous cycle generating new seed nodes for sparse domains.' },
  { term: 'Resonance band', definition: 'Embedding similarity range for synthesis pairing (not too similar, not too different).' },
  { term: 'Salience', definition: 'Attention score (0.01\u20131.0) determining how often a node is sampled for synthesis.' },
  { term: 'Seed', definition: 'Raw input node from humans, research, or KB ingestion. Starting material for synthesis.' },
  { term: 'Specificity scoring', definition: 'Measures how concrete and detailed synthesis output is.' },
  { term: 'Spec Review', definition: 'Adversarial falsifiability check subsystem (spec_review). Optional LLM that detects cherry-picked experiment parameters.' },
  { term: 'Subsystem', definition: 'Named LLM role (e.g., synthesis, voice, research) with independent model assignment.' },
  { term: 'Synthesis', definition: 'Process of combining two nodes to produce a new insight, or the resulting node type.' },
  { term: 'System partition', definition: 'Internally isolated partition (e.g., know-thyself) that cannot be bridged.' },
  { term: 'Telegraphic compression', definition: 'Rule-based removal of filler words from synthesis output.' },
  { term: 'Tensions', definition: 'Pairs of nodes with high similarity but opposing claims, surfaced by the tensions cycle.' },
  { term: 'Validation', definition: 'Autonomous cycle scoring nodes for breakthrough promotion.' },
  { term: 'Voiced', definition: 'Node created by the voicing cycle with a persona-driven perspective.' },
  { term: 'Voicing', definition: 'Process of generating insights from node pairs, potentially with creative personas.' },
  { term: 'Weight', definition: 'Importance score (starts 1.0, unbounded). Higher weight = more valuable, more frequently sampled.' },
];

/** Help section: glossary of Podbit terms for quick reference. */
export default function Part4Glossary() {
  return (
    <div className="space-y-6">
      {/* Section Header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Glossary</h2>
        <p className="text-sm text-gray-600 dark:text-gray-300">
          Quick reference for terms used throughout Podbit.
        </p>
      </div>

      {/* Glossary Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {glossaryTerms.map((item) => (
          <div
            key={item.term}
            className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-3"
          >
            <dt className="text-sm font-bold text-gray-900 dark:text-white mb-0.5">{item.term}</dt>
            <dd className="text-xs text-gray-600 dark:text-gray-300">{item.definition}</dd>
          </div>
        ))}
      </div>

      {/* Cross-section links */}
      <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
        <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Related Sections</h4>
        <div className="flex flex-wrap gap-2">
          <button className="docs-link-internal text-xs text-blue-600 dark:text-blue-400 hover:underline" data-doc="key-concepts">Key Concepts</button>
          <button className="docs-link-internal text-xs text-blue-600 dark:text-blue-400 hover:underline" data-doc="node-types">Node Types</button>
          <button className="docs-link-internal text-xs text-blue-600 dark:text-blue-400 hover:underline" data-doc="verification-quality">Verification & Quality</button>
          <button className="docs-link-internal text-xs text-blue-600 dark:text-blue-400 hover:underline" data-doc="growing-graph">Growing Your Graph</button>
        </div>
      </div>
    </div>
  );
}
