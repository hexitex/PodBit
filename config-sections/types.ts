/**
 * @module config-sections/types
 *
 * Type definitions for the config section metadata system. These types
 * describe the shape of each tunable config section, its parameters,
 * presets, and GUI presentation metadata. The GUI auto-renders controls
 * from these definitions without any per-section hardcoding.
 */

/** UI control type for a parameter. Inferred from min/max/step when not specified. */
export type ControlType = 'slider' | 'toggle' | 'input' | 'select' | 'wordList' | 'wordMap' | 'phraseMap' | 'patternList';

/** GUI category groups that sections are organized into. */
export type CategoryId = 'synthesisBand' | 'qualityGates' | 'cullPipeline' | 'outputShape' | 'nodeEvolution' | 'autonomousCycles' | 'verificationElite' | 'knowledgeDelivery' | 'modelParameters' | 'wordListsPatterns';

/** Metadata for a single tunable parameter within a config section. */
export interface ParameterMeta {
    /** Unique key used in save/load operations and LLM tune suggestions. */
    key: string;
    /** Human-readable label displayed in the GUI. */
    label: string;
    /** Description shown as tooltip/help text. */
    description: string;
    /** Minimum allowed value. */
    min: number;
    /** Maximum allowed value. */
    max: number;
    /** Step increment for slider/input controls. */
    step: number;
    /** Default value when not overridden. */
    default: number;
    /** Path into the runtime config object (e.g. `['voicing', 'maxOutputWords']`). */
    configPath: string[];
    /** Explicit control type. Inferred as toggle if min=0/max=1/step=1, else slider. */
    controlType?: ControlType;
    /** Context string for AI-assisted word list generation. */
    listDescription?: string;
    /** Preset suggestion chips for the word list editor. */
    presetSuggestions?: string[];
    /** Available options when controlType is 'select'. */
    selectOptions?: string[];
    /** Per-parameter complexity tier for progressive disclosure. Falls back to section tier if not set. */
    tier?: SectionTier;
}

/** A named preset with a natural language intent for LLM-driven tuning. */
export interface PresetDef {
    /** Display label for the preset button. */
    label: string;
    /** Natural language intent passed to the tuning LLM. */
    intent: string;
}

/** Complexity tier controlling which sections are visible at each detail level. */
export type SectionTier = 'basic' | 'intermediate' | 'advanced';

/** Complete metadata for a single config section. */
export interface SectionMeta {
    /** Unique section identifier (e.g. 'temperature_dynamics'). */
    id: string;
    /** Complexity tier for progressive disclosure in the GUI. */
    tier: SectionTier;
    /** Human-readable section title. */
    title: string;
    /** Brief description of what this section controls. */
    description: string;
    /** Paragraph explaining how the section's parameters interact. */
    behavior: string;
    /** Array of tunable parameters in this section. */
    parameters: ParameterMeta[];
    /** Named presets for one-click configuration. */
    presets: PresetDef[];
    /** Which GUI category group this section belongs to. */
    category?: CategoryId;
    /** Help text displayed in the HelpBadge component. */
    helpText?: string;
    /** Additional search terms beyond title and parameter labels. */
    searchTerms?: string[];
}
