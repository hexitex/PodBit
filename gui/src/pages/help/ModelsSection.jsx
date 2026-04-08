import { Link } from 'react-router-dom';

/** Help section: model registry and subsystem assignments. */
function ModelsSection() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold mb-3 text-gray-900 dark:text-gray-200">Models & Subsystems</h2>
        <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
          The Models page manages LLM registration, subsystem assignment, and provider health.
          Podbit supports multiple providers (LM Studio, Ollama, OpenAI Compatible, Anthropic, Z.AI)
          and each internal subsystem can be assigned a different model.
        </p>
      </div>

      {/* Model Registry */}
      <div className="bg-sky-50 dark:bg-sky-900/30 border border-sky-200 dark:border-sky-700 rounded-lg p-4">
        <h3 className="font-semibold text-sky-700 dark:text-sky-300 text-sm mb-2">Model Registry</h3>
        <p className="text-xs text-sky-600 dark:text-sky-400 mb-2">
          Register LLMs with their provider, endpoint URL, and capabilities. Each model entry stores:
        </p>
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div className="bg-white dark:bg-gray-900 rounded p-2 border border-sky-100 dark:border-sky-700">
            <p className="font-medium text-sky-700 dark:text-sky-300">Identity</p>
            <p className="text-sky-500 dark:text-sky-400">Display name, model ID, provider, sort order</p>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded p-2 border border-sky-100 dark:border-sky-700">
            <p className="font-medium text-sky-700 dark:text-sky-300">Connection</p>
            <p className="text-sky-500 dark:text-sky-400">Endpoint URL, API key, max retries, retry window, concurrency</p>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded p-2 border border-sky-100 dark:border-sky-700">
            <p className="font-medium text-sky-700 dark:text-sky-300">Limits</p>
            <p className="text-sky-500 dark:text-sky-400">Max tokens, context size, cost per 1K tokens</p>
          </div>
        </div>
        <p className="text-xs text-sky-600 dark:text-sky-400 mt-2">
          <strong>Auto-discover:</strong> Scan local providers (LM Studio, Ollama) to find running models
          and add them with one click. <strong>Test:</strong> Verify connectivity for any registered model.
        </p>
        <p className="text-xs text-sky-600 dark:text-sky-400 mt-2">
          <strong>Reasoning models:</strong> Auto-detected by model ID pattern (R1, GLM, GPT OSS, o-series).
          Thinking level is controlled per-subsystem (off/low/medium/high) and mapped to provider-specific
          parameters (reasoning_effort, thinking budget, etc.). Models that can't fully disable reasoning
          (e.g. GPT OSS, o-series) have their "off" mapped to the minimum supported level.
        </p>
      </div>

      {/* Subsystem Assignments */}
      <div className="bg-purple-50 dark:bg-purple-900/30 border border-purple-200 dark:border-purple-700 rounded-lg p-4">
        <h3 className="font-semibold text-purple-700 dark:text-purple-300 text-sm mb-2">Subsystem Assignments</h3>
        <p className="text-xs text-purple-600 dark:text-purple-400 mb-3">
          Each internal subsystem can use a different model. The recommended model size depends on the
          complexity of the task  - creative synthesis and structured JSON output need strong models,
          while simple extraction or formatting tasks work fine with smaller ones.
        </p>

        {/* Frontier */}
        <div className="mb-3">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-xs font-bold uppercase tracking-wider text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/30 px-2 py-0.5 rounded-full">Frontier</span>
            <span className="text-xs text-gray-500 dark:text-gray-400">Claude Opus, GPT-4o, GPT OSS 20B, GLM-4, DeepSeek R1, Qwen 72B+</span>
          </div>
          <div className="grid grid-cols-5 gap-1.5 text-xs">
            {[
              ['voice', 'Creative synthesis between node pairs, breakthrough validation, research questions  - core reasoning task'],
              ['chat', 'Conversation, /research seed generation, /voice pair synthesis with JSON output  - does 4 different jobs'],
              ['research', 'Generates foundational domain knowledge autonomously  - needs broad knowledge and accuracy'],
              ['docs', 'Structured research briefs with outlines and validation  - long-form structured output'],
              ['tuning_judge', 'Produces 3-tier gold standard reference responses  - needs best quality to be a reliable benchmark'],
              ['breakthrough_check', 'Skeptical novelty gate for auto-promotion  - verifies insights are genuinely novel, not just textbook knowledge'],
            ].map(([sub, desc]) => (
              <div key={sub} className="bg-white dark:bg-gray-900 rounded p-1.5 border border-red-100 dark:border-red-900/50">
                <p className="font-medium text-purple-700 dark:text-purple-300">{sub}</p>
                <p className="text-gray-500 dark:text-gray-400 text-xs leading-snug">{desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Medium */}
        <div className="mb-3">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/30 px-2 py-0.5 rounded-full">Medium</span>
            <span className="text-xs text-gray-500 dark:text-gray-400">Claude Sonnet, GPT-4o-mini, Qwen 32B, Gemma 27B, Mistral Medium</span>
          </div>
          <div className="grid grid-cols-4 gap-1.5 text-xs">
            {[
              ['synthesis', 'Orchestrates pair selection, similarity gating, dedup checks, and node creation  - delegates actual LLM generation to voice'],
              ['compress', 'Summarize topics and generate compressed meta-prompts  - structured but not complex'],
              ['config_tune', 'Suggests parameter changes with reasoning  - needs decent analysis skills'],
              ['autorating', 'Automated node quality scoring  - generates structured JSON ratings for new nodes on intake'],
              ['spec_extraction', 'Extracts experiment specifications from claims  - the one auditable bias surface in the verification pipeline'],
              ['spec_review', 'Adversarial falsifiability check  - a second LLM detects cherry-picked parameters that guarantee the claimed result'],
              ['evm_triage', 'Fallback for spec_extraction  - classifies claim testability (legacy, used when spec_extraction is unassigned)'],
              ['evm_analysis', 'Post-rejection investigation  - analyzes why a claim was refuted by a lab experiment'],
              ['elite_mapping', 'Maps elite verified nodes to project manifest targets (goals, questions, bridges)'],
              ['reader_*', 'Curate ingested files (text, PDF, doc, sheet, code) into knowledge nodes  - 5 reader subsystems'],
              ['reader_image', 'Describe images for ingestion  - requires a vision-capable model specifically'],
            ].map(([sub, desc]) => (
              <div key={sub} className="bg-white dark:bg-gray-900 rounded p-1.5 border border-amber-100 dark:border-amber-900/50">
                <p className="font-medium text-purple-700 dark:text-purple-300">{sub}</p>
                <p className="text-gray-500 dark:text-gray-400 text-xs leading-snug">{desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Small */}
        <div className="mb-3">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-xs font-bold uppercase tracking-wider text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/30 px-2 py-0.5 rounded-full">Small</span>
            <span className="text-xs text-gray-500 dark:text-gray-400">Claude Haiku, Phi-4, Gemma 9B, Qwen 7B, Llama 8B</span>
          </div>
          <div className="grid grid-cols-4 gap-1.5 text-xs">
            {[
              ['context', 'Compresses chat history when token budget is exceeded  - straightforward summarization'],
              ['keyword', 'Extracts domain synonyms and node keywords  - short structured output'],
              ['dedup_judge', 'Binary yes/no on whether two nodes are duplicates  - simple classification'],
              ['proxy', 'Formats knowledge for injection into proxy responses  - mostly selection and formatting'],
            ].map(([sub, desc]) => (
              <div key={sub} className="bg-white dark:bg-gray-900 rounded p-1.5 border border-green-100 dark:border-green-900/50">
                <p className="font-medium text-purple-700 dark:text-purple-300">{sub}</p>
                <p className="text-gray-500 dark:text-gray-400 text-xs leading-snug">{desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Dedicated */}
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-xs font-bold uppercase tracking-wider text-sky-600 dark:text-sky-400 bg-sky-100 dark:bg-sky-900/30 px-2 py-0.5 rounded-full">Dedicated</span>
            <span className="text-xs text-gray-500 dark:text-gray-400">Specialized model types</span>
          </div>
          <div className="grid grid-cols-4 gap-1.5 text-xs">
            <div className="bg-white dark:bg-gray-900 rounded p-1.5 border border-sky-100 dark:border-sky-900/50">
              <p className="font-medium text-purple-700 dark:text-purple-300">embedding</p>
              <p className="text-gray-500 dark:text-gray-400 text-xs leading-snug">Vector embeddings  - not an LLM, use a dedicated embedding model (nomic-embed, bge, etc.)</p>
            </div>
          </div>
        </div>
      </div>

      {/* Auto-Tune */}
      <div className="bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 rounded-lg p-4">
        <h3 className="font-semibold text-amber-700 dark:text-amber-300 text-sm mb-2">Auto-Tune & Gold Standards</h3>
        <p className="text-xs text-amber-600 dark:text-amber-400">
          The <strong>Auto-Tune</strong> button launches automated parameter search for inference settings
          (temperature, top_p, min_p, top_k, repeat_penalty). It tests parameter combinations per subsystem
          using concurrent workers, scores output quality against <strong>gold standard references</strong> generated by
          a tuning judge model, and recommends optimal values. See the
          <Link to="/help/tuning" className="underline decoration-amber-300 ml-1 hover:text-amber-800 dark:hover:text-amber-200">Auto-Tune & Gold Standards</Link> section
          for the full system documentation.
        </p>
      </div>

      {/* Other Panels */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-700 rounded-lg p-4">
          <h3 className="font-semibold text-emerald-700 dark:text-emerald-300 text-sm mb-2">Model Health</h3>
          <p className="text-xs text-emerald-600 dark:text-emerald-400">
            Provider status indicators showing online/offline for each configured provider.
            The health check tests connectivity and reports latency.
          </p>
        </div>
        <div className="bg-orange-50 dark:bg-orange-900/30 border border-orange-200 dark:border-orange-700 rounded-lg p-4">
          <h3 className="font-semibold text-orange-700 dark:text-orange-300 text-sm mb-2">Proxy & Reader Settings</h3>
          <p className="text-xs text-orange-600 dark:text-orange-400">
            <strong>Proxy:</strong> Knowledge injection budget sliders (reserve %), telegraphic compression,
            fallback model profile. <strong>Image Reader:</strong> Max dimension, quality, format selection.
          </p>
        </div>
        <div className="col-span-2 bg-sky-50 dark:bg-sky-900/30 border border-sky-200 dark:border-sky-700 rounded-lg p-4">
          <h3 className="font-semibold text-sky-700 dark:text-sky-300 text-sm mb-2">Embedding Status</h3>
          <p className="text-xs text-sky-600 dark:text-sky-400">
            Shows the current embedding model, vector dimensions, and total embedded count. Breaks down
            nodes by status: up-to-date, legacy (old model), and stale (needs re-embedding). Displays
            which embedding model each batch was generated with.
          </p>
        </div>
      </div>
    </div>
  );
}

export default ModelsSection;
