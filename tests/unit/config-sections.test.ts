/**
 * Unit tests for config-sections metadata — validates structural invariants.
 *
 * These tests ensure every section and parameter meets the schema requirements
 * that the GUI auto-renderer depends on. Catching issues here prevents runtime
 * crashes in MetadataSection.jsx.
 */

import { SECTION_METADATA } from '../../config-sections/index.js';
import type { ParameterMeta, SectionTier, CategoryId } from '../../config-sections/types.js';

const VALID_TIERS: SectionTier[] = ['basic', 'intermediate', 'advanced'];
const VALID_CATEGORIES: CategoryId[] = ['synthesisBand', 'qualityGates', 'cullPipeline', 'outputShape', 'nodeEvolution', 'autonomousCycles', 'verificationElite', 'knowledgeDelivery', 'modelParameters', 'wordListsPatterns'];

const sections = Object.entries(SECTION_METADATA);

describe('config-sections metadata', () => {
  it('has at least one section defined', () => {
    expect(sections.length).toBeGreaterThan(0);
  });

  describe.each(sections)('section "%s"', (id, section) => {
    it('has a valid id matching its key', () => {
      expect(section.id).toBe(id);
    });

    it('has a valid tier', () => {
      expect(VALID_TIERS).toContain(section.tier);
    });

    it('has non-empty title and description', () => {
      expect(section.title.length).toBeGreaterThan(0);
      expect(section.description.length).toBeGreaterThan(0);
    });

    it('has non-empty behavior text', () => {
      expect(section.behavior.length).toBeGreaterThan(0);
    });

    it('has a valid category', () => {
      expect(VALID_CATEGORIES).toContain(section.category);
    });

    it('has a parameters array', () => {
      expect(Array.isArray(section.parameters)).toBe(true);
    });

    it('has a presets array', () => {
      expect(Array.isArray(section.presets)).toBe(true);
    });
  });
});

describe('parameter metadata', () => {
  const allParams: Array<[string, string, ParameterMeta]> = [];
  for (const [sectionId, section] of sections) {
    for (const param of section.parameters) {
      allParams.push([sectionId, param.key, param]);
    }
  }

  if (allParams.length > 0) {
    describe.each(allParams)('section "%s" param "%s"', (_sectionId, _key, param) => {
      it('has non-empty key and label', () => {
        expect(param.key.length).toBeGreaterThan(0);
        expect(param.label.length).toBeGreaterThan(0);
      });

      it('has a description', () => {
        expect(param.description.length).toBeGreaterThan(0);
      });

      it('has valid numeric range (min <= default <= max)', () => {
        expect(param.min).toBeLessThanOrEqual(param.default);
        expect(param.default).toBeLessThanOrEqual(param.max);
      });

      it('has non-negative step (0 for list controls, positive for numeric)', () => {
        const isListControl = param.controlType && ['wordList', 'wordMap', 'phraseMap', 'patternList'].includes(param.controlType);
        if (isListControl) {
          expect(param.step).toBeGreaterThanOrEqual(0);
        } else {
          expect(param.step).toBeGreaterThan(0);
        }
      });

      it('has non-empty configPath', () => {
        expect(param.configPath.length).toBeGreaterThan(0);
        for (const segment of param.configPath) {
          expect(typeof segment).toBe('string');
          expect(segment.length).toBeGreaterThan(0);
        }
      });

      it('has a valid tier if specified', () => {
        if (param.tier) {
          expect(VALID_TIERS).toContain(param.tier);
        }
      });
    });
  }
});

describe('section uniqueness', () => {
  it('has no duplicate section IDs', () => {
    const ids = sections.map(([id]) => id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has no duplicate parameter keys within any section', () => {
    for (const [_id, section] of sections) {
      const keys = section.parameters.map(p => p.key);
      const dupes = keys.filter((k, i) => keys.indexOf(k) !== i);
      expect(dupes).toEqual([]);
    }
  });
});

describe('preset metadata', () => {
  const allPresets: Array<[string, string, { label: string; intent: string }]> = [];
  for (const [sectionId, section] of sections) {
    for (const preset of section.presets) {
      allPresets.push([sectionId, preset.label, preset]);
    }
  }

  if (allPresets.length > 0) {
    describe.each(allPresets)('section "%s" preset "%s"', (_sectionId, _label, preset) => {
      it('has non-empty label and intent', () => {
        expect(preset.label.length).toBeGreaterThan(0);
        expect(preset.intent.length).toBeGreaterThan(0);
      });
    });
  }
});
