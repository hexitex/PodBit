import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { RotateCcw, Loader, Trash2, Info, ChevronDown, ChevronRight, Plus, X, Sparkles, AlertTriangle } from 'lucide-react';
import { configApi } from '../lib/api';
import { TIER_LEVELS } from '../pages/config/config-constants';

/** Slider control for a numeric config parameter with optional inline edit. */
export function ParameterSlider({ label, value, min, max, step, onChange, description, highlight, title }) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState('');

  // Guard against non-numeric values (e.g. nested config objects passed by mistake)
  const numericValue = typeof value === 'number' ? value : (parseFloat(value) || min || 0);

  const startEdit = () => {
    setEditValue(String(numericValue));
    setEditing(true);
  };

  const commitEdit = () => {
    const parsed = parseFloat(editValue);
    if (!Number.isNaN(parsed) && parsed >= min) {
      onChange(parsed);
    }
    setEditing(false);
  };

  // Clamp slider to max but allow typed values beyond it
  const sliderValue = Math.min(numericValue, max);

  return (
    <div className={`mb-4 ${highlight ? 'ring-2 ring-amber-400 dark:ring-amber-500 rounded-lg p-2 -m-2 bg-amber-50/50 dark:bg-amber-900/10' : ''}`}>
      <div className="flex justify-between mb-1">
        <label className="text-sm font-medium" title={title}>{label}</label>
        {editing ? (
          <input
            type="number"
            min={min}
            step={step}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={(e) => e.key === 'Enter' && commitEdit()}
            autoFocus
            className="w-24 text-sm text-right font-mono bg-white dark:bg-gray-900 border border-blue-400 rounded px-1 outline-none"
          />
        ) : (
          <span
            className="text-sm text-gray-500 font-mono cursor-pointer hover:text-blue-500 hover:underline"
            onClick={startEdit}
            title="Click to type a custom value"
          >{numericValue}</span>
        )}
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={sliderValue}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer"
      />
      {description && <p className="text-xs text-gray-400 mt-1">{description}</p>}
    </div>
  );
}

/** Number or text input for a config parameter. */
export function ParameterInput({ label, value, type = 'number', min, max, step, onChange, description, highlight, title }) {
  return (
    <div className={`mb-4 ${highlight ? 'ring-2 ring-amber-400 dark:ring-amber-500 rounded-lg p-2 -m-2 bg-amber-50/50 dark:bg-amber-900/10' : ''}`}>
      <div className="flex justify-between items-center mb-1">
        <label className="text-sm font-medium" title={title}>{label}</label>
        <input
          type={type}
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(type === 'number' ? parseFloat(e.target.value) : e.target.value)}
          className="w-24 text-sm text-right font-mono px-2 py-1 border rounded"
        />
      </div>
      {description && <p className="text-xs text-gray-400 mt-1">{description}</p>}
    </div>
  );
}

/** Collapsible config block with optional tune/reset and tier visibility. */
export function CollapsibleSection({ title, description, children, defaultOpen = false, onTune, onReset, tier, visibleTier, forceOpen, highlighted, sectionId, links, inactive }) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const effectiveOpen = forceOpen || isOpen;

  // Per-parameter tier filtering is now handled in MetadataSection.
  // Section-level tier is kept for badge display only.

  const tierColors = {
    basic: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
    intermediate: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
    advanced: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  };

  return (
    <div id={sectionId} data-collapsible data-collapsed={!effectiveOpen ? 'true' : 'false'} className={`border rounded-lg mb-4 ${highlighted ? 'border-amber-400 dark:border-amber-500 ring-1 ring-amber-400/50' : inactive ? 'border-gray-300 dark:border-gray-600 border-dashed' : 'border-gray-200 dark:border-gray-700'}`}>
      <button
        data-collapsible-toggle
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-50 dark:hover:bg-gray-800"
      >
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-medium text-sm">{title}</h3>
            {tier && (
              <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${tierColors[tier] || ''}`}>
                {tier}
              </span>
            )}
            {inactive && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-gray-200 text-gray-500 dark:bg-gray-700 dark:text-gray-400">
                OFF
              </span>
            )}
          </div>
          {description && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{description}</p>}
          {links && <div className="flex flex-wrap gap-1 mt-1" onClick={e => e.stopPropagation()}>{links}</div>}
        </div>
        <div className="flex items-center gap-2">
          {onReset && (
            <span
              onClick={(e) => { e.stopPropagation(); onReset(); }}
              className="flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500 hover:text-orange-500 dark:hover:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-900/20 px-2 py-1 rounded-lg transition-colors cursor-pointer"
              title="Reset this section to defaults"
            >
              <RotateCcw size={12} />
              <span>Reset</span>
            </span>
          )}
          {onTune && (
            <span
              onClick={(e) => { e.stopPropagation(); onTune(); }}
              className="text-purple-400 hover:text-purple-600 dark:hover:text-purple-300 hover:bg-purple-50 dark:hover:bg-purple-900/30 p-1.5 rounded-lg transition-colors cursor-pointer"
              title="Tune with AI"
            >
              <Sparkles size={14} />
            </span>
          )}
          {effectiveOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </div>
      </button>
      {effectiveOpen && <div className="p-4 pt-0 border-t border-gray-100 dark:border-gray-700 max-h-[50vh] overflow-y-auto">{children}</div>}
    </div>
  );
}

/** Inline help callout with info icon. */
export function HelpBadge({ text }) {
  return (
    <div className="flex items-start gap-2 p-3 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-lg mb-4 text-xs text-blue-800 dark:text-blue-300">
      <Info size={14} className="flex-shrink-0 mt-0.5" />
      <span>{text}</span>
    </div>
  );
}

/** Text input for a regex pattern with live validation. */
export function PatternInput({ label, value, onChange, description, placeholder }) {
  const [valid, setValid] = useState(true);
  const handleChange = (e) => {
    const v = e.target.value;
    try { new RegExp(v); setValid(true); } catch { setValid(false); }
    onChange(v);
  };
  return (
    <div className="mb-4">
      <label className="text-sm font-medium block mb-1">{label}</label>
      <input
        type="text"
        value={value ?? ''}
        onChange={handleChange}
        placeholder={placeholder}
        className={`w-full text-xs font-mono px-2 py-1.5 border rounded bg-white dark:bg-gray-900 ${valid ? 'border-gray-300 dark:border-gray-600' : 'border-red-400 bg-red-50 dark:bg-red-900/30'}`}
      />
      {!valid && <p className="text-xs text-red-500 mt-0.5">Invalid regex pattern</p>}
      {description && <p className="text-xs text-gray-400 mt-1">{description}</p>}
    </div>
  );
}

/** Editable list of [pattern, replacement] pairs with optional LLM generation. */
export function PatternPairList({ pairs, onChange, description }) {
  const [showGenerate, setShowGenerate] = useState(false);
  const [genRequest, setGenRequest] = useState('');
  const [generatedPairs, setGeneratedPairs] = useState(null);
  const [genAccepted, setGenAccepted] = useState({});

  const generateMutation = useMutation({
    mutationFn: ({ request }) => configApi.generatePatterns(request, 10),
    onSuccess: (data) => {
      setGeneratedPairs(data.pairs || []);
      const initial = {};
      (data.pairs || []).forEach((_, i) => { initial[i] = true; });
      setGenAccepted(initial);
    },
  });

  const addPair = () => onChange([...pairs, ['', '']]);
  const removePair = (i) => onChange(pairs.filter((_, idx) => idx !== i));
  const updatePair = (i, side, val) => {
    const updated = pairs.map((p, idx) => idx === i ? (side === 0 ? [val, p[1]] : [p[0], val]) : p);
    onChange(updated);
  };

  const handleGenerate = () => {
    if (!genRequest.trim()) return;
    generateMutation.mutate({ request: genRequest.trim() });
  };

  const handleAcceptGenerated = () => {
    const accepted = (generatedPairs || []).filter((_, i) => genAccepted[i]);
    onChange([...pairs, ...accepted]);
    setShowGenerate(false);
    setGeneratedPairs(null);
    setGenRequest('');
    generateMutation.reset();
  };

  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-2">
        <label className="text-sm font-medium">Tension Patterns</label>
        <div className="flex gap-1.5">
          <button onClick={() => setShowGenerate(!showGenerate)} className="text-xs flex items-center gap-1 px-2 py-1 text-purple-600 dark:text-purple-300 hover:bg-purple-50 dark:hover:bg-purple-900/30 border rounded border-gray-200 dark:border-gray-700">
            <Sparkles size={12} /> Generate
          </button>
          <button onClick={addPair} className="text-xs flex items-center gap-1 px-2 py-1 text-blue-600 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/30 border rounded border-gray-200 dark:border-gray-700">
            <Plus size={12} /> Add Pair
          </button>
        </div>
      </div>
      {description && <p className="text-xs text-gray-400 dark:text-gray-500 mb-2">{description}</p>}

      {/* AI Generation Panel */}
      {showGenerate && (
        <div className="mb-3 p-3 bg-purple-50 dark:bg-purple-900/30 border border-purple-200 dark:border-purple-800 rounded-lg">
          <div className="flex gap-2 mb-2">
            <input
              value={genRequest}
              onChange={(e) => setGenRequest(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !generateMutation.isPending && handleGenerate()}
              placeholder="e.g. scientific method, ethics, causality..."
              className="flex-1 text-xs px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-900 focus:outline-none focus:ring-1 focus:ring-purple-300 dark:focus:ring-purple-600"
              disabled={generateMutation.isPending}
            />
            <button
              onClick={handleGenerate}
              disabled={!genRequest.trim() || generateMutation.isPending}
              className="text-xs px-3 py-1.5 bg-purple-500 text-white rounded hover:bg-purple-600 disabled:opacity-50 flex items-center gap-1"
            >
              {generateMutation.isPending ? <Loader size={12} className="animate-spin" /> : <Sparkles size={12} />}
              Generate
            </button>
          </div>

          {/* Quick presets */}
          <div className="flex flex-wrap gap-1 mb-2">
            {['General opposites', 'Scientific concepts', 'Ethics & values', 'Technical tradeoffs'].map(preset => (
              <button
                key={preset}
                onClick={() => { setGenRequest(preset); generateMutation.mutate({ request: preset }); }}
                disabled={generateMutation.isPending}
                className="text-xs px-2 py-0.5 rounded-full border border-purple-200 dark:border-purple-700 hover:bg-purple-100 dark:hover:bg-purple-800/50 disabled:opacity-50"
              >
                {preset}
              </button>
            ))}
          </div>

          {generateMutation.isPending && (
            <div className="text-xs text-purple-600 flex items-center gap-1.5 py-2">
              <Loader size={12} className="animate-spin" /> Generating pairs...
            </div>
          )}

          {generateMutation.isError && (
            <div className="text-xs text-red-600 flex items-center gap-1.5 py-1">
              <AlertTriangle size={12} /> {generateMutation.error?.response?.data?.error || 'Generation failed'}
            </div>
          )}

          {generatedPairs && !generateMutation.isPending && (
            <div>
              {generateMutation.data?.summary && (
                <p className="text-xs text-purple-700 dark:text-purple-300 mb-2">{generateMutation.data.summary}</p>
              )}
              <div className="space-y-1 max-h-40 overflow-y-auto mb-2">
                {generatedPairs.map((pair, i) => (
                  <label key={i} className="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={genAccepted[i] ?? false}
                      onChange={() => setGenAccepted(prev => ({ ...prev, [i]: !prev[i] }))}
                      className="w-3.5 h-3.5 text-purple-600 rounded"
                    />
                    <span className="font-mono">{pair[0]}</span>
                    <span className="text-gray-400 dark:text-gray-500">/</span>
                    <span className="font-mono">{pair[1]}</span>
                  </label>
                ))}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => { setGeneratedPairs(null); generateMutation.reset(); }}
                  className="text-xs px-3 py-1 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
                >
                  Discard
                </button>
                <button
                  onClick={handleAcceptGenerated}
                  disabled={!Object.values(genAccepted).some(Boolean)}
                  className="text-xs px-3 py-1 bg-purple-500 text-white rounded hover:bg-purple-600 disabled:opacity-50"
                >
                  Add {Object.values(genAccepted).filter(Boolean).length} Pairs
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="space-y-1.5 max-h-48 overflow-y-auto">
        {pairs.map((pair, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              type="text"
              value={pair[0]}
              onChange={(e) => updatePair(i, 0, e.target.value)}
              className="flex-1 text-xs font-mono px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-900"
              placeholder="positive"
            />
            <span className="text-xs text-gray-400">/</span>
            <input
              type="text"
              value={pair[1]}
              onChange={(e) => updatePair(i, 1, e.target.value)}
              className="flex-1 text-xs font-mono px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-900"
              placeholder="negative"
            />
            <button onClick={() => removePair(i)} className="text-gray-400 hover:text-red-500 p-0.5">
              <X size={12} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── AI Generation Panel (shared by WordListEditor, WordMapEditor, PatternListEditor) ───

function GeneratePanel({ listType, listDescription, existing, onAccept, placeholder, presets }) {
  const [showGenerate, setShowGenerate] = useState(false);
  const [genRequest, setGenRequest] = useState('');
  const [generated, setGenerated] = useState(null);
  const [accepted, setAccepted] = useState({});

  const generateMutation = useMutation({
    mutationFn: ({ request }) => configApi.generateWords(listType, listDescription, existing, request),
    onSuccess: (data) => {
      let raw = data.words || data.phrases || data.patterns || null;
      // Mappings come back as an object { key: value } — convert to [key, value] pairs
      if (!raw && data.mappings && typeof data.mappings === 'object') {
        raw = Object.entries(data.mappings);
      }
      const items = Array.isArray(raw) ? raw : [];
      setGenerated(items);
      const initial = {};
      items.forEach((_, i) => { initial[i] = true; });
      setAccepted(initial);
    },
  });

  const handleGenerate = () => {
    if (!genRequest.trim()) return;
    generateMutation.mutate({ request: genRequest.trim() });
  };

  const handleAccept = () => {
    const items = (generated || []).filter((_, i) => accepted[i]);
    onAccept(items);
    setShowGenerate(false);
    setGenerated(null);
    setGenRequest('');
    generateMutation.reset();
  };

  const renderItem = (item) => {
    if (listType === 'mappings') return <><span className="font-mono">{item[0]}</span> <span className="text-gray-400 dark:text-gray-500">&rarr;</span> <span className="font-mono">{item[1]}</span></>;
    if (listType === 'phrases') return <><span className="font-mono">{item[0]}</span> <span className="text-gray-400 dark:text-gray-500">&rarr;</span> <span className="font-mono">{item[1]}</span></>;
    return <span className="font-mono">{item}</span>;
  };

  return (
    <>
      <button onClick={() => setShowGenerate(!showGenerate)} className="text-xs flex items-center gap-1 px-2 py-1 text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/30 border dark:border-gray-700 rounded">
        <Sparkles size={12} /> Generate
      </button>

      {showGenerate && (
        <div className="mt-2 mb-3 p-3 bg-purple-50 dark:bg-purple-900/30 border border-purple-200 dark:border-purple-700 rounded-lg">
          <div className="flex gap-2 mb-2">
            <input
              value={genRequest}
              onChange={(e) => setGenRequest(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !generateMutation.isPending && handleGenerate()}
              placeholder={placeholder || 'Describe what to generate...'}
              className="flex-1 text-xs px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-900 focus:outline-none focus:ring-1 focus:ring-purple-300 dark:focus:ring-purple-600"
              disabled={generateMutation.isPending}
            />
            <button
              onClick={handleGenerate}
              disabled={!genRequest.trim() || generateMutation.isPending}
              className="text-xs px-3 py-1.5 bg-purple-500 text-white rounded hover:bg-purple-600 disabled:opacity-50 flex items-center gap-1"
            >
              {generateMutation.isPending ? <Loader size={12} className="animate-spin" /> : <Sparkles size={12} />}
              Generate
            </button>
          </div>

          {presets && (
            <div className="flex flex-wrap gap-1 mb-2">
              {presets.map(preset => (
                <button
                  key={preset}
                  onClick={() => { setGenRequest(preset); generateMutation.mutate({ request: preset }); }}
                  disabled={generateMutation.isPending}
                  className="text-xs px-2 py-0.5 rounded-full border border-purple-200 dark:border-purple-700 hover:bg-purple-100 dark:hover:bg-purple-800/50 disabled:opacity-50"
                >
                  {preset}
                </button>
              ))}
            </div>
          )}

          {generateMutation.isPending && (
            <div className="text-xs text-purple-600 flex items-center gap-1.5 py-2">
              <Loader size={12} className="animate-spin" /> Generating...
            </div>
          )}

          {generateMutation.isError && (
            <div className="text-xs text-red-600 flex items-center gap-1.5 py-1">
              <AlertTriangle size={12} /> {generateMutation.error?.response?.data?.error || 'Generation failed'}
            </div>
          )}

          {generated && !generateMutation.isPending && (
            <div>
              <div className="space-y-1 max-h-40 overflow-y-auto mb-2">
                {generated.map((item, i) => (
                  <label key={i} className="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={accepted[i] ?? false}
                      onChange={() => setAccepted(prev => ({ ...prev, [i]: !prev[i] }))}
                      className="w-3.5 h-3.5 text-purple-600 rounded"
                    />
                    {renderItem(item)}
                  </label>
                ))}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => { setGenerated(null); generateMutation.reset(); }}
                  className="text-xs px-3 py-1 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
                >
                  Discard
                </button>
                <button
                  onClick={handleAccept}
                  disabled={!Object.values(accepted).some(Boolean)}
                  className="text-xs px-3 py-1 bg-purple-500 text-white rounded hover:bg-purple-600 disabled:opacity-50"
                >
                  Add {Object.values(accepted).filter(Boolean).length}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}

// ─── WordListEditor: tag-style editor for string arrays ───

/** Tag-style editor for a string array with bulk add and optional LLM generation. */
export function WordListEditor({ label, words, onChange, description, listDescription, presets }) {
  const [newWord, setNewWord] = useState('');
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkText, setBulkText] = useState('');

  const addWord = () => {
    const w = newWord.trim();
    if (w && !words.includes(w)) {
      onChange([...words, w]);
      setNewWord('');
    }
  };

  const removeWord = (i) => onChange(words.filter((_, idx) => idx !== i));

  const handleBulkAdd = () => {
    const newWords = bulkText.split(/[,\n]/).map(w => w.trim()).filter(w => w && !words.includes(w));
    if (newWords.length) onChange([...words, ...newWords]);
    setBulkText('');
    setBulkMode(false);
  };

  const handleGenerated = (items) => {
    const newWords = items.filter(w => !words.includes(w));
    if (newWords.length) onChange([...words, ...newWords]);
  };

  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-2">
        <label className="text-sm font-medium">{label} <span className="text-xs text-gray-400 dark:text-gray-500 font-normal">({words.length})</span></label>
        <div className="flex gap-1.5">
          <GeneratePanel
            listType="words"
            listDescription={listDescription || label}
            existing={words}
            onAccept={handleGenerated}
            placeholder="e.g. analytical terms, conjunctions..."
            presets={presets}
          />
          <button onClick={() => setBulkMode(!bulkMode)} className="text-xs flex items-center gap-1 px-2 py-1 text-blue-600 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/30 border rounded border-gray-200 dark:border-gray-700">
            <Plus size={12} /> Bulk
          </button>
        </div>
      </div>
      {description && <p className="text-xs text-gray-400 dark:text-gray-500 mb-2">{description}</p>}

      {bulkMode && (
        <div className="mb-2 p-2 bg-gray-50 dark:bg-gray-800 border dark:border-gray-700 rounded">
          <textarea
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
            placeholder="Paste words separated by commas or newlines..."
            className="w-full text-xs font-mono px-2 py-1.5 border dark:border-gray-700 rounded h-16 resize-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
          />
          <div className="flex gap-2 mt-1">
            <button onClick={() => setBulkMode(false)} className="text-xs px-2 py-0.5 text-gray-500 hover:bg-gray-200 rounded">Cancel</button>
            <button onClick={handleBulkAdd} disabled={!bulkText.trim()} className="text-xs px-2 py-0.5 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50">Add</button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto mb-2">
        {words.map((word, i) => (
          <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded text-xs font-mono group">
            {word}
            <button onClick={() => removeWord(i)} className="text-gray-300 dark:text-gray-500 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">
              <X size={10} />
            </button>
          </span>
        ))}
      </div>

      <div className="flex gap-1.5">
        <input
          type="text"
          value={newWord}
          onChange={(e) => setNewWord(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addWord()}
          placeholder="Add word..."
          className="flex-1 text-xs font-mono px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-900"
        />
        <button onClick={addWord} disabled={!newWord.trim()} className="text-xs px-2 py-1 bg-gray-200 dark:bg-gray-700 rounded hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50">
          <Plus size={12} />
        </button>
      </div>
    </div>
  );
}

// ─── WordMapEditor: key→value pair editor for Record<string, string> ───

/** Key→value map editor with optional LLM-generated mappings. */
export function WordMapEditor({ label, map, onChange, description, listDescription, presets }) {
  const [newKey, setNewKey] = useState('');
  const [newVal, setNewVal] = useState('');

  const entries = Object.entries(map);

  const addEntry = () => {
    const k = newKey.trim();
    const v = newVal.trim();
    if (k && v) {
      onChange({ ...map, [k]: v });
      setNewKey('');
      setNewVal('');
    }
  };

  const removeEntry = (key) => {
    const updated = { ...map };
    delete updated[key];
    onChange(updated);
  };

  const updateEntry = (oldKey, side, val) => {
    if (side === 'value') {
      onChange({ ...map, [oldKey]: val });
    } else {
      const updated = { ...map };
      const oldVal = updated[oldKey];
      delete updated[oldKey];
      updated[val] = oldVal;
      onChange(updated);
    }
  };

  const handleGenerated = (items) => {
    const updated = { ...map };
    for (const [k, v] of items) {
      if (!updated[k]) updated[k] = v;
    }
    onChange(updated);
  };

  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-2">
        <label className="text-sm font-medium">{label} <span className="text-xs text-gray-400 dark:text-gray-500 font-normal">({entries.length})</span></label>
        <GeneratePanel
          listType="mappings"
          listDescription={listDescription || label}
          existing={entries}
          onAccept={handleGenerated}
          placeholder="e.g. abbreviations for common words..."
          presets={presets}
        />
      </div>
      {description && <p className="text-xs text-gray-400 dark:text-gray-500 mb-2">{description}</p>}

      <div className="space-y-1.5 max-h-48 overflow-y-auto mb-2">
        {entries.map(([k, v], i) => (
          <div key={i} className="flex items-center gap-1.5">
            <input
              type="text"
              value={k}
              onChange={(e) => updateEntry(k, 'key', e.target.value)}
              className="flex-1 text-xs font-mono px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-900"
            />
            <span className="text-xs text-gray-400">&rarr;</span>
            <input
              type="text"
              value={v}
              onChange={(e) => updateEntry(k, 'value', e.target.value)}
              className="w-20 text-xs font-mono px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-900"
            />
            <button onClick={() => removeEntry(k)} className="text-gray-400 hover:text-red-500 p-0.5">
              <X size={12} />
            </button>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-1.5">
        <input
          type="text"
          value={newKey}
          onChange={(e) => setNewKey(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addEntry()}
          placeholder="word"
          className="flex-1 text-xs font-mono px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-900"
        />
        <span className="text-xs text-gray-400">&rarr;</span>
        <input
          type="text"
          value={newVal}
          onChange={(e) => setNewVal(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addEntry()}
          placeholder="symbol"
          className="w-20 text-xs font-mono px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-900"
        />
        <button onClick={addEntry} disabled={!newKey.trim() || !newVal.trim()} className="text-xs px-2 py-1 bg-gray-200 dark:bg-gray-700 rounded hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50">
          <Plus size={12} />
        </button>
      </div>
    </div>
  );
}

// ─── PhraseMapEditor: [string, string][] pair editor for phrase→replacement arrays ───

/** Editable list of [phrase, replacement] pairs with optional LLM generation. */
export function PhraseMapEditor({ label, pairs, onChange, description, listDescription, presets }) {
  const [newPhrase, setNewPhrase] = useState('');
  const [newReplacement, setNewReplacement] = useState('');

  const addPair = () => {
    const p = newPhrase.trim();
    const r = newReplacement.trim();
    if (p && r) {
      onChange([...pairs, [p, r]]);
      setNewPhrase('');
      setNewReplacement('');
    }
  };

  const removePair = (i) => onChange(pairs.filter((_, idx) => idx !== i));

  const updatePair = (i, side, val) => {
    onChange(pairs.map((pair, idx) => idx === i ? (side === 0 ? [val, pair[1]] : [pair[0], val]) : pair));
  };

  const handleGenerated = (items) => {
    onChange([...pairs, ...items]);
  };

  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-2">
        <label className="text-sm font-medium">{label} <span className="text-xs text-gray-400 font-normal">({pairs.length})</span></label>
        <GeneratePanel
          listType="phrases"
          listDescription={listDescription || label}
          existing={pairs}
          onAccept={handleGenerated}
          placeholder="e.g. common multi-word phrases to abbreviate..."
          presets={presets}
        />
      </div>
      {description && <p className="text-xs text-gray-400 dark:text-gray-500 mb-2">{description}</p>}

      <div className="space-y-1.5 max-h-48 overflow-y-auto mb-2">
        {pairs.map((pair, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <input
              type="text"
              value={pair[0]}
              onChange={(e) => updatePair(i, 0, e.target.value)}
              className="flex-1 text-xs font-mono px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-900"
              placeholder="phrase"
            />
            <span className="text-xs text-gray-400">&rarr;</span>
            <input
              type="text"
              value={pair[1]}
              onChange={(e) => updatePair(i, 1, e.target.value)}
              className="w-20 text-xs font-mono px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-900"
              placeholder="symbol"
            />
            <button onClick={() => removePair(i)} className="text-gray-400 hover:text-red-500 p-0.5">
              <X size={12} />
            </button>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-1.5">
        <input
          type="text"
          value={newPhrase}
          onChange={(e) => setNewPhrase(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addPair()}
          placeholder="phrase"
          className="flex-1 text-xs font-mono px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-900"
        />
        <span className="text-xs text-gray-400">&rarr;</span>
        <input
          type="text"
          value={newReplacement}
          onChange={(e) => setNewReplacement(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addPair()}
          placeholder="symbol"
          className="w-20 text-xs font-mono px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-900"
        />
        <button onClick={addPair} disabled={!newPhrase.trim() || !newReplacement.trim()} className="text-xs px-2 py-1 bg-gray-200 dark:bg-gray-700 rounded hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50">
          <Plus size={12} />
        </button>
      </div>
    </div>
  );
}

// ─── PatternListEditor: regex pattern list with validation and LLM generation ───

/** Editable list of regex patterns with validation and optional LLM generation. */
export function PatternListEditor({ label, patterns, onChange, description, listDescription, presets }) {
  const [newPattern, setNewPattern] = useState('');
  const [newValid, setNewValid] = useState(true);

  const addPattern = () => {
    const p = newPattern.trim();
    if (p && newValid && !patterns.includes(p)) {
      onChange([...patterns, p]);
      setNewPattern('');
    }
  };

  const removePattern = (i) => onChange(patterns.filter((_, idx) => idx !== i));

  const updatePattern = (i, val) => {
    onChange(patterns.map((p, idx) => idx === i ? val : p));
  };

  const validatePattern = (p) => {
    try { new RegExp(p); return true; } catch { return false; }
  };

  const handleGenerated = (items) => {
    const valid = items.filter(p => validatePattern(p) && !patterns.includes(p));
    if (valid.length) onChange([...patterns, ...valid]);
  };

  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-2">
        <label className="text-sm font-medium">{label} <span className="text-xs text-gray-400 font-normal">({patterns.length})</span></label>
        <GeneratePanel
          listType="patterns"
          listDescription={listDescription || label}
          existing={patterns}
          onAccept={handleGenerated}
          placeholder="e.g. patterns matching generic filler phrases..."
          presets={presets}
        />
      </div>
      {description && <p className="text-xs text-gray-400 dark:text-gray-500 mb-2">{description}</p>}

      <div className="space-y-1.5 max-h-48 overflow-y-auto mb-2">
        {patterns.map((pat, i) => {
          const valid = validatePattern(pat);
          return (
            <div key={i} className="flex items-center gap-1.5">
              <input
                type="text"
                value={pat}
                onChange={(e) => updatePattern(i, e.target.value)}
                className={`flex-1 text-xs font-mono px-2 py-1 border rounded bg-white dark:bg-gray-900 ${valid ? 'border-gray-300 dark:border-gray-600' : 'border-red-400 bg-red-50 dark:bg-red-900/30'}`}
              />
              {!valid && <AlertTriangle size={12} className="text-red-400 flex-shrink-0" />}
              <button onClick={() => removePattern(i)} className="text-gray-400 hover:text-red-500 p-0.5">
                <X size={12} />
              </button>
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-1.5">
        <input
          type="text"
          value={newPattern}
          onChange={(e) => {
            setNewPattern(e.target.value);
            setNewValid(validatePattern(e.target.value) || !e.target.value);
          }}
          onKeyDown={(e) => e.key === 'Enter' && addPattern()}
          placeholder="regex pattern..."
          className={`flex-1 text-xs font-mono px-2 py-1 border dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 ${newValid ? '' : 'border-red-400 bg-red-50 dark:bg-red-900/30'}`}
        />
        <button onClick={addPattern} disabled={!newPattern.trim() || !newValid} className="text-xs px-2 py-1 bg-gray-200 dark:bg-gray-700 rounded hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50">
          <Plus size={12} />
        </button>
      </div>
      {!newValid && <p className="text-xs text-red-500 mt-0.5">Invalid regex</p>}
    </div>
  );
}

/** Destructive action button with optional loading state and normal/danger variant. */
export function DeleteButton({ onClick, disabled, loading, children, variant = 'normal' }) {
  const baseClasses = "flex items-center justify-center gap-1 px-3 py-1.5 text-sm rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
  const variantClasses = variant === 'danger'
    ? "bg-red-600 text-white hover:bg-red-700"
    : "bg-red-100 text-red-700 hover:bg-red-200";

  return (
    <button onClick={onClick} disabled={disabled || loading} className={`${baseClasses} ${variantClasses}`}>
      {loading ? <Loader size={14} className="animate-spin" /> : <Trash2 size={14} />}
      {children}
    </button>
  );
}
