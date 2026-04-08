/**
 * Unit tests for db/sql.ts — SQL translation layer (pure helpers).
 * translate: $N → ?, NOW/LEAST/GREATEST/ILIKE → SQLite; countFilter, withinDays, intervalAgo;
 * weightedRandom, inverseWeightedRandom; getLineageQuery, getPatternSiblingsQuery.
 */
import { describe, it, expect } from '@jest/globals';

import {
  translate,
  countFilter,
  withinDays,
  intervalAgo,
  weightedRandom,
  inverseWeightedRandom,
  getLineageQuery,
  getPatternSiblingsQuery,
} from '../../db/sql.js';

// ---------- translate ----------

describe('translate', () => {
  it('replaces $1 placeholders with ?', () => {
    const { sql, params } = translate('SELECT * FROM t WHERE id = $1', ['abc']);
    expect(sql).toBe("SELECT * FROM t WHERE id = ?");
    expect(params).toEqual(['abc']);
  });

  it('handles multiple parameters', () => {
    const { sql, params } = translate(
      'INSERT INTO t (a, b, c) VALUES ($1, $2, $3)',
      ['x', 'y', 'z']
    );
    expect(sql).toBe('INSERT INTO t (a, b, c) VALUES (?, ?, ?)');
    expect(params).toEqual(['x', 'y', 'z']);
  });

  it('handles repeated parameter references', () => {
    const { sql, params } = translate(
      'SELECT * FROM t WHERE a = $1 OR b = $1',
      ['val']
    );
    expect(sql).toBe('SELECT * FROM t WHERE a = ? OR b = ?');
    expect(params).toEqual(['val', 'val']);
  });

  it('reorders parameters correctly', () => {
    const { sql, params } = translate(
      'SELECT * FROM t WHERE a = $2 AND b = $1',
      ['first', 'second']
    );
    expect(sql).toBe('SELECT * FROM t WHERE a = ? AND b = ?');
    expect(params).toEqual(['second', 'first']);
  });

  it('converts booleans to 0/1', () => {
    const { sql, params } = translate('UPDATE t SET a = $1, b = $2', [true, false]);
    expect(params).toEqual([1, 0]);
  });

  it('translates NOW() to datetime(\'now\')', () => {
    const { sql } = translate('SELECT * FROM t WHERE created_at > NOW()');
    expect(sql).toContain("datetime('now')");
    expect(sql).not.toContain('NOW()');
  });

  it('translates LEAST to MIN', () => {
    const { sql } = translate('SELECT LEAST(a, b) FROM t');
    expect(sql).toBe('SELECT MIN(a, b) FROM t');
  });

  it('translates GREATEST to MAX', () => {
    const { sql } = translate('SELECT GREATEST(a, b) FROM t');
    expect(sql).toBe('SELECT MAX(a, b) FROM t');
  });

  it('translates ILIKE to LIKE', () => {
    const { sql } = translate("SELECT * FROM t WHERE name ILIKE '%test%'");
    expect(sql).toContain('LIKE');
    expect(sql).not.toContain('ILIKE');
  });

  it('strips PostgreSQL type casts', () => {
    const { sql } = translate('SELECT id::TEXT FROM t');
    expect(sql).toBe('SELECT id FROM t');
  });

  it('strips NULLS LAST/FIRST', () => {
    const { sql } = translate('SELECT * FROM t ORDER BY a NULLS LAST');
    expect(sql).not.toContain('NULLS');
  });

  it('converts TRUE/FALSE to 1/0', () => {
    const { sql } = translate('SELECT * FROM t WHERE active = TRUE AND deleted = FALSE');
    expect(sql).toContain('= 1');
    expect(sql).toContain('= 0');
  });

  it('handles empty params', () => {
    const { sql, params } = translate('SELECT 1');
    expect(sql).toBe('SELECT 1');
    expect(params).toEqual([]);
  });

  // Array expansion: = ANY($N) → IN (...)
  it('expands = ANY($N) to IN (...)', () => {
    const { sql, params } = translate(
      'SELECT * FROM t WHERE id = ANY($1)',
      [['a', 'b', 'c']]
    );
    expect(sql).toContain('IN (?, ?, ?)');
    expect(params).toContain('a');
    expect(params).toContain('b');
    expect(params).toContain('c');
  });

  it('expands = ANY($N) with empty array to IN (NULL)', () => {
    const { sql } = translate('SELECT * FROM t WHERE id = ANY($1)', [[]]);
    expect(sql).toContain('IN (NULL)');
  });

  // Array expansion: != ALL($N) → NOT IN (...)
  it('expands != ALL($N) to NOT IN (...)', () => {
    const { sql, params } = translate(
      'SELECT * FROM t WHERE id != ALL($1)',
      [['x', 'y']]
    );
    expect(sql).toContain('NOT IN');
    expect(params).toContain('x');
    expect(params).toContain('y');
  });

  it('expands != ALL($N) with empty array to 1=1', () => {
    const { sql } = translate('SELECT * FROM t WHERE id != ALL($1)', [[]]);
    expect(sql).toContain('1=1');
  });

  // ILIKE ANY expansion
  it('expands ILIKE ANY to OR LIKE conditions', () => {
    const { sql } = translate(
      'SELECT * FROM t WHERE name ILIKE ANY($1)',
      [['%foo%', '%bar%']]
    );
    expect(sql).toContain('LIKE');
    expect(sql).toContain(' OR ');
  });

  it('expands ILIKE ANY with empty array to 1=0', () => {
    const { sql } = translate(
      'SELECT * FROM t WHERE name ILIKE ANY($1)',
      [[]]
    );
    expect(sql).toContain('1=0');
  });
});

// ---------- countFilter ----------

describe('countFilter', () => {
  it('generates SUM CASE WHEN expression', () => {
    const result = countFilter('status = 1');
    expect(result).toBe('SUM(CASE WHEN status = 1 THEN 1 ELSE 0 END)');
  });
});

// ---------- withinDays ----------

describe('withinDays', () => {
  it('generates datetime comparison', () => {
    const result = withinDays('created_at', '?');
    expect(result).toContain('created_at');
    expect(result).toContain("datetime('now'");
    expect(result).toContain('days');
  });
});

// ---------- intervalAgo ----------

describe('intervalAgo', () => {
  it('generates datetime interval', () => {
    const result = intervalAgo(7, 'days');
    expect(result).toBe("datetime('now', '-7 days')");
  });

  it('works with hours', () => {
    const result = intervalAgo(2, 'hours');
    expect(result).toBe("datetime('now', '-2 hours')");
  });
});

// ---------- weightedRandom ----------

describe('weightedRandom', () => {
  it('generates expression using salience', () => {
    const result = weightedRandom('salience');
    expect(result).toContain('LOG');
    expect(result).toContain('RANDOM()');
    expect(result).toContain('salience');
  });

  it('accepts complex expressions', () => {
    const result = weightedRandom('salience / (1 + barren_cycles * 0.3)');
    expect(result).toContain('salience / (1 + barren_cycles * 0.3)');
  });
});

// ---------- inverseWeightedRandom ----------

describe('inverseWeightedRandom', () => {
  it('generates expression multiplying by column', () => {
    const result = inverseWeightedRandom('weight');
    expect(result).toContain('LOG');
    expect(result).toContain('RANDOM()');
    expect(result).toContain('weight');
  });
});

// ---------- getLineageQuery ----------

describe('getLineageQuery', () => {
  it('returns recursive CTE query', () => {
    const sql = getLineageQuery();
    expect(sql).toContain('WITH RECURSIVE');
    expect(sql).toContain('ancestors');
    expect(sql).toContain('descendants');
    expect(sql).toContain('$1'); // node id param
    expect(sql).toContain('$2'); // depth param
  });

  it('includes connected_from for tree reconstruction', () => {
    const sql = getLineageQuery();
    expect(sql).toContain('connected_from');
  });
});

// ---------- getPatternSiblingsQuery ----------

describe('getPatternSiblingsQuery', () => {
  it('returns query joining abstract patterns', () => {
    const sql = getPatternSiblingsQuery();
    expect(sql).toContain('node_abstract_patterns');
    expect(sql).toContain('abstract_patterns');
    expect(sql).toContain('$1'); // node id
    expect(sql).toContain('$2'); // exclude same domain
    expect(sql).toContain('$3'); // limit
  });
});
