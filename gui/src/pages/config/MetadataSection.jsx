/**
 * MetadataSection — auto-renders a config section from SECTION_METADATA.
 *
 * Given a section's metadata (title, description, tier, parameters, presets,
 * helpText), renders a CollapsibleSection with the appropriate controls for
 * each parameter based on its configPath, min/max/step, and optional controlType.
 *
 * Control type inference:
 *   - controlType === 'toggle' OR (min=0, max=1, step=1) → On/Off select
 *   - controlType === 'wordList' → WordListEditor
 *   - controlType === 'wordMap' → WordMapEditor
 *   - controlType === 'phraseMap' → PhraseMapEditor
 *   - controlType === 'patternList' → PatternListEditor
 *   - Otherwise → ParameterSlider
 */
import {
  ParameterSlider, CollapsibleSection, HelpBadge,
  WordListEditor, WordMapEditor, PhraseMapEditor, PatternListEditor,
} from '../../components/ConfigPrimitives';
import { SubsystemBadge } from '../../components/RelatedLinks';
import { CONFIG_TO_SUBSYSTEMS, SUBSYSTEM_MAP } from '../../lib/subsystem-map';
import { TIER_LEVELS } from './config-constants';

/** Navigate a configPath array into a config object to read a value. */
function getValueFromConfig(config, configPath) {
  let val = config;
  for (const key of configPath) {
    val = val?.[key];
    if (val === undefined) return undefined;
  }
  return val;
}

/** Infer the control type from parameter metadata. */
function inferControlType(param) {
  if (param.controlType) return param.controlType;
  if (param.min === 0 && param.max === 1 && param.step === 1) return 'toggle';
  return 'slider';
}

/** Check if a single parameter matches a search query. */
function paramMatchesSearch(param, query) {
  if (!query) return false;
  const q = query.toLowerCase();
  return (
    param.label.toLowerCase().includes(q) ||
    param.description.toLowerCase().includes(q) ||
    param.key.toLowerCase().includes(q)
  );
}

/** Check if a section matches a search query (title, description, params, searchTerms). */
export function sectionMatchesSearch(section, query) {
  if (!query) return false;
  const q = query.toLowerCase();
  if (section.title.toLowerCase().includes(q)) return true;
  if (section.description.toLowerCase().includes(q)) return true;
  if (section.behavior?.toLowerCase().includes(q)) return true;
  for (const param of section.parameters || []) {
    if (paramMatchesSearch(param, query)) return true;
  }
  for (const term of section.searchTerms || []) {
    if (term.toLowerCase().includes(q)) return true;
  }
  return false;
}

/**
 * Synthesis pipeline gate order — sections are numbered by their position
 * in the processing pipeline so users understand execution flow.
 */
const PIPELINE_ORDER = {
  ground_rules: 1,
  resonance_specificity: 2,
  synthesis_validation: 3,
  claim_provenance: 4,
  hallucination_detection: 5,
  counterfactual_independence: 6,
  fitness_modifier: 7,
  redundancy_ceiling: 8,
  dedup_settings: 9,
  synthesis_quality_gates: 10,
};

/** Build cross-link badges for a section — subsystem badges with assignment status + pipeline order. */
function buildSectionLinks(sectionId, assignments) {
  const subs = CONFIG_TO_SUBSYSTEMS[sectionId];
  const pipelineStep = PIPELINE_ORDER[sectionId];
  const hasSubs = subs?.length > 0;

  if (!hasSubs && !pipelineStep) return null;

  return (
    <>
      {pipelineStep && (
        <span
          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300"
          title={`Pipeline gate #${pipelineStep} — gates fire in this order during synthesis`}
        >
          Gate {pipelineStep}
        </span>
      )}
      {subs?.map(sub => {
        const info = SUBSYSTEM_MAP[sub];
        if (!info) return null;
        const assigned = assignments ? !!assignments[sub] : undefined;
        return <SubsystemBadge key={sub} subsystem={sub} tier={info.tier} assigned={assigned} />;
      })}
    </>
  );
}

/** Renders one config section (title, params, sliders, tune, reset) with search and tier filtering. */
export default function MetadataSection({
  section,
  localConfig,
  updateParam,
  updateNestedParam,
  searchTerm,
  tierLevel,
  onTune,
  onReset,
  descMap,
  assignments,
}) {
  if (!section || !localConfig) return null;

  const q = searchTerm?.trim()?.toLowerCase() || '';
  const matches = sectionMatchesSearch(section, q);

  // Detect if section has a master toggle (first toggle param with "enabled" in key) that is off
  const masterToggle = section.parameters?.find(p =>
    p.min === 0 && p.max === 1 && p.step === 1 && p.key.toLowerCase().includes('enabled')
  );
  const isInactive = masterToggle ? !getValueFromConfig(localConfig, masterToggle.configPath) : false;

  // Handle value changes using configPath depth
  const handleChange = (configPath, value) => {
    if (configPath.length === 2) {
      updateParam(configPath[0], configPath[1], value);
    } else if (configPath.length === 3) {
      updateNestedParam(configPath[0], configPath[1], configPath[2], value);
    } else if (configPath.length === 4) {
      const current = localConfig[configPath[0]]?.[configPath[1]]?.[configPath[2]] || {};
      updateNestedParam(configPath[0], configPath[1], configPath[2], {
        ...current,
        [configPath[3]]: value,
      });
    }
  };

  // Get description — prefer API description, fall back to metadata
  const desc = (param) => {
    if (descMap) {
      const apiDesc = descMap[param.configPath.join('.')];
      if (apiDesc) return apiDesc;
    }
    return param.description;
  };

  return (
    <CollapsibleSection
      sectionId={section.id}
      links={buildSectionLinks(section.id, assignments)}
      title={section.title}
      description={section.description}
      onTune={() => onTune(section.id)}
      onReset={() => onReset(section.id)}
      tier={section.tier}
      visibleTier={tierLevel}
      forceOpen={matches}
      highlighted={matches}
      inactive={isInactive}
    >
      {section.helpText && <HelpBadge text={section.helpText} />}

      {section.parameters.filter(param => {
        const paramTier = param.tier || section.tier || 'basic';
        return TIER_LEVELS[paramTier] <= TIER_LEVELS[tierLevel];
      }).map(param => {
        const controlType = inferControlType(param);
        const value = getValueFromConfig(localConfig, param.configPath);
        const highlight = q ? paramMatchesSearch(param, q) : false;

        switch (controlType) {
          case 'toggle':
            return (
              <div key={param.key} className={`mb-4 ${highlight ? 'ring-2 ring-amber-400 dark:ring-amber-500 rounded-lg p-2 -m-2 bg-amber-50/50 dark:bg-amber-900/10' : ''}`}>
                <div className="flex justify-between mb-1">
                  <label className="text-sm font-medium">{param.label}</label>
                  <select
                    value={value ? 1 : 0}
                    onChange={(e) => handleChange(param.configPath, !!parseInt(e.target.value, 10))}
                    className="w-20 text-sm text-right font-mono px-2 py-1 border rounded dark:bg-gray-700 dark:border-gray-600"
                  >
                    <option value={0}>Off</option>
                    <option value={1}>On</option>
                  </select>
                </div>
                {desc(param) && <p className="text-xs text-gray-400 mt-1">{desc(param)}</p>}
              </div>
            );

          case 'wordList':
            return (
              <WordListEditor
                key={param.key}
                label={param.label}
                words={value || []}
                onChange={(v) => handleChange(param.configPath, v)}
                description={desc(param)}
                listDescription={param.listDescription || param.description}
                presets={param.presetSuggestions || []}
              />
            );

          case 'wordMap':
            return (
              <WordMapEditor
                key={param.key}
                label={param.label}
                map={value || {}}
                onChange={(v) => handleChange(param.configPath, v)}
                description={desc(param)}
                listDescription={param.listDescription || param.description}
                presets={param.presetSuggestions || []}
              />
            );

          case 'phraseMap':
            return (
              <PhraseMapEditor
                key={param.key}
                label={param.label}
                pairs={value || []}
                onChange={(v) => handleChange(param.configPath, v)}
                description={desc(param)}
                listDescription={param.listDescription || param.description}
                presets={param.presetSuggestions || []}
              />
            );

          case 'patternList':
            return (
              <PatternListEditor
                key={param.key}
                label={param.label}
                patterns={value || []}
                onChange={(v) => handleChange(param.configPath, v)}
                description={desc(param)}
                listDescription={param.listDescription || param.description}
                presets={param.presetSuggestions || []}
              />
            );

          case 'slider':
          default:
            return (
              <ParameterSlider
                key={param.key}
                label={param.label}
                value={value ?? param.default}
                min={param.min}
                max={param.max}
                step={param.step}
                onChange={(v) => handleChange(param.configPath, v)}
                description={desc(param)}
                highlight={highlight}
              />
            );
        }
      })}
    </CollapsibleSection>
  );
}
