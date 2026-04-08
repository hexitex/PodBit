/**
 * Unit tests for config/defaults.ts — validates the default config shape.
 *
 * Ensures critical config sections exist, threshold values are in valid ranges,
 * and no accidental regressions break the config structure.
 */

import { config, DEFAULT_TEMPERATURES, DEFAULT_REPEAT_PENALTIES, VERSION } from '../../config/defaults.js';

describe('config defaults', () => {
  it('exports a VERSION string', () => {
    expect(typeof VERSION).toBe('string');
    expect(VERSION.length).toBeGreaterThan(0);
  });

  describe('top-level sections exist', () => {
    const requiredSections = [
      'database', 'api', 'services', 'proxy', 'engine', 'nodes',
      'specificity', 'dedup', 'voicing', 'injection', 'hallucination',
      'labVerify', 'autonomousCycles', 'numberVariables',
    ];

    it.each(requiredSections)('has section "%s"', (section) => {
      expect(config).toHaveProperty(section);
    });
  });

  describe('threshold ranges', () => {
    it('engine.threshold is in [0, 1]', () => {
      expect(config.engine.threshold).toBeGreaterThanOrEqual(0);
      expect(config.engine.threshold).toBeLessThanOrEqual(1);
    });

    it('engine.junkThreshold is in [0, 1]', () => {
      expect(config.engine.junkThreshold).toBeGreaterThanOrEqual(0);
      expect(config.engine.junkThreshold).toBeLessThanOrEqual(1);
    });

    it('junkThreshold >= threshold (junk is stricter)', () => {
      expect(config.engine.junkThreshold).toBeGreaterThanOrEqual(config.engine.threshold);
    });

    it('dedup.embeddingSimilarityThreshold is in [0, 1]', () => {
      expect(config.dedup.embeddingSimilarityThreshold).toBeGreaterThanOrEqual(0);
      expect(config.dedup.embeddingSimilarityThreshold).toBeLessThanOrEqual(1);
    });

    it('nodes.defaultWeight is positive', () => {
      expect(config.nodes.defaultWeight).toBeGreaterThan(0);
    });
  });

  describe('labVerify config', () => {
    it('has weightBoostOnVerified', () => {
      expect(config.labVerify.weightBoostOnVerified).toBeGreaterThan(0);
    });

    it('has failedSalienceCap in [0, 1]', () => {
      expect(config.labVerify.failedSalienceCap).toBeGreaterThanOrEqual(0);
      expect(config.labVerify.failedSalienceCap).toBeLessThanOrEqual(1);
    });

    it('has postRejection config', () => {
      expect(typeof config.labVerify.postRejection.enabled).toBe('boolean');
      expect(config.labVerify.postRejection.analysisTimeoutMs).toBeGreaterThan(0);
    });

    it('has specReview config', () => {
      expect(typeof config.labVerify.specReview.enabled).toBe('boolean');
      expect(config.labVerify.specReview.minConfidence).toBeGreaterThan(0);
    });
  });

  describe('number variables config', () => {
    it('has reasonable maxVarsPerNode', () => {
      expect(config.numberVariables.maxVarsPerNode).toBeGreaterThan(0);
      expect(config.numberVariables.maxVarsPerNode).toBeLessThanOrEqual(200);
    });

    it('has positive contextWindowSize', () => {
      expect(config.numberVariables.contextWindowSize).toBeGreaterThan(0);
    });
  });

  describe('autonomous cycles', () => {
    const cycleKeys = ['validation', 'questions', 'tensions', 'research', 'voicing'];

    it.each(cycleKeys)('cycle "%s" has intervalMs', (key) => {
      const cycle = (config.autonomousCycles as any)[key];
      expect(cycle).toBeDefined();
      expect(cycle.intervalMs).toBeGreaterThan(0);
    });
  });
});

describe('DEFAULT_TEMPERATURES', () => {
  it('has entries for core subsystems', () => {
    expect(DEFAULT_TEMPERATURES).toHaveProperty('voice');
    expect(DEFAULT_TEMPERATURES).toHaveProperty('compress');
    expect(DEFAULT_TEMPERATURES).toHaveProperty('chat');
  });

  it('all values are in [0, 2]', () => {
    for (const [_key, val] of Object.entries(DEFAULT_TEMPERATURES)) {
      expect(val).toBeGreaterThanOrEqual(0);
      expect(val).toBeLessThanOrEqual(2);
    }
  });
});

describe('DEFAULT_REPEAT_PENALTIES', () => {
  it('penalty keys are a subset of temperature keys', () => {
    const tempKeys = new Set(Object.keys(DEFAULT_TEMPERATURES));
    for (const key of Object.keys(DEFAULT_REPEAT_PENALTIES)) {
      expect(tempKeys.has(key)).toBe(true);
    }
  });

  it('all values are positive', () => {
    for (const [_key, val] of Object.entries(DEFAULT_REPEAT_PENALTIES)) {
      expect(val).toBeGreaterThan(0);
    }
  });
});

// =============================================================================
// Additional coverage — deep config sections
// =============================================================================

describe('config.managedServices detail', () => {
  it('resonance service specifies health endpoint', () => {
    expect(config.managedServices.resonance.healthEndpoint).toContain('/health');
  });

  it('gui service cwd includes gui directory', () => {
    expect(config.managedServices.gui.cwd).toContain('gui');
  });

  it('proxy managed service exists with autoRestart', () => {
    expect(config.managedServices.proxy).toBeDefined();
    expect(config.managedServices.proxy.autoRestart).toBe(true);
    expect(config.managedServices.proxy.maxRestarts).toBeGreaterThan(0);
  });

  it('partitionServer managed service exists', () => {
    expect(config.managedServices.partitionServer).toBeDefined();
    expect(config.managedServices.partitionServer.autoStart).toBe(false);
  });
});

describe('config.externalServices detail', () => {
  it('mcp service is ide-managed', () => {
    expect(config.externalServices.mcp.ideManaged).toBe(true);
  });

  it('database service is required', () => {
    expect(config.externalServices.database.required).toBe(true);
  });

  it('embeddings service is required', () => {
    expect(config.externalServices.embeddings.required).toBe(true);
  });

  it('llm external service is not required', () => {
    expect(config.externalServices.llm.required).toBe(false);
  });
});

describe('config.proxy defaults', () => {
  it('has default proxy port', () => {
    expect(config.proxy.port).toBeGreaterThan(0);
  });

  it('has default knowledgeReserve', () => {
    expect(config.proxy.knowledgeReserve).toBeGreaterThan(0);
    expect(config.proxy.knowledgeReserve).toBeLessThanOrEqual(1);
  });

  it('has modelProfile string', () => {
    expect(typeof config.proxy.modelProfile).toBe('string');
  });
});

describe('config.orchestrator defaults', () => {
  it('has heartbeatIntervalMs', () => {
    expect(config.orchestrator.heartbeatIntervalMs).toBeGreaterThan(0);
  });

  it('has startupGracePeriodMs', () => {
    expect(config.orchestrator.startupGracePeriodMs).toBeGreaterThan(0);
  });
});

describe('config.voicing defaults', () => {
  it('has maxOutputWords as positive number', () => {
    expect(config.voicing.maxOutputWords).toBeGreaterThan(0);
  });
});

describe('config.nodes defaults', () => {
  it('has positive defaultWeight', () => {
    expect(config.nodes.defaultWeight).toBeGreaterThan(0);
  });

  it('has positive defaultSalience', () => {
    expect(config.nodes.defaultSalience).toBeGreaterThan(0);
  });

  it('has breakthroughWeight >= 1', () => {
    expect(config.nodes.breakthroughWeight).toBeGreaterThanOrEqual(1);
  });

  it('has promoteWeight >= 1', () => {
    expect(config.nodes.promoteWeight).toBeGreaterThanOrEqual(1);
  });

  it('has warmThreshold in (0, 2)', () => {
    expect(config.nodes.warmThreshold).toBeGreaterThan(0);
    expect(config.nodes.warmThreshold).toBeLessThan(2);
  });

  it('has warmWeightThreshold > 0', () => {
    expect(config.nodes.warmWeightThreshold).toBeGreaterThan(0);
  });
});

describe('config.feedback defaults', () => {
  it('has weightFloor', () => {
    expect(typeof config.feedback.weightFloor).toBe('number');
    expect(config.feedback.weightFloor).toBeGreaterThan(0);
    expect(config.feedback.weightFloor).toBeLessThan(1);
  });

  it('has positive usefulWeight', () => {
    expect(config.feedback.usefulWeight).toBeGreaterThan(0);
  });

  it('has negative notUsefulWeight', () => {
    expect(config.feedback.notUsefulWeight).toBeLessThan(0);
  });

  it('has negative harmfulWeight', () => {
    expect(config.feedback.harmfulWeight).toBeLessThan(0);
  });

  it('harmfulWeight is stronger than notUsefulWeight', () => {
    expect(config.feedback.harmfulWeight).toBeLessThan(config.feedback.notUsefulWeight);
  });
});

describe('config.elitePool defaults', () => {
  it('has promotionThreshold in [0, 1]', () => {
    expect(config.elitePool.promotionThreshold).toBeGreaterThan(0);
    expect(config.elitePool.promotionThreshold).toBeLessThanOrEqual(1);
  });

  it('has dedup sub-config', () => {
    expect(config.elitePool.dedup).toBeDefined();
  });

  it('has manifestMapping sub-config', () => {
    expect(config.elitePool.manifestMapping).toBeDefined();
  });
});

describe('config.knowledgeBase defaults', () => {
  it('has enabled flag', () => {
    expect(typeof config.knowledgeBase.enabled).toBe('boolean');
  });
});

describe('config.tokenLimits defaults', () => {
  it('has at least one token limit key', () => {
    expect(Object.keys(config.tokenLimits).length).toBeGreaterThan(0);
  });
});

describe('config.intakeDefense defaults', () => {
  it('has concentrationThreshold', () => {
    expect(typeof config.intakeDefense.concentrationThreshold).toBe('number');
  });

  it('has minProposalsForCheck', () => {
    expect(config.intakeDefense.minProposalsForCheck).toBeGreaterThan(0);
  });
});
