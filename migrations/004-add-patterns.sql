-- =============================================================================
-- MIGRATION: Add abstract pattern indexing for cross-domain discovery
-- =============================================================================
-- NOTE: The existing "patterns" table is for CODE patterns.
-- This migration creates "abstract_patterns" for CONCEPTUAL patterns.

-- ABSTRACT_PATTERNS: Domain-agnostic conceptual patterns that bridge domains
-- Examples: "structure-vs-process-gap", "measurement-becomes-target", "meta-blocker"
CREATE TABLE IF NOT EXISTS abstract_patterns (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Pattern identification
    name            VARCHAR(100) NOT NULL UNIQUE,  -- kebab-case identifier
    description     TEXT,                          -- human-readable explanation

    -- Pattern embedding for similarity search (stored as JSONB like nodes)
    embedding       JSONB,

    -- Metadata
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    created_by      VARCHAR(100)
);

-- NODE_ABSTRACT_PATTERNS: Many-to-many link between nodes and abstract patterns
CREATE TABLE IF NOT EXISTS node_abstract_patterns (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    node_id         UUID NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    pattern_id      UUID NOT NULL REFERENCES abstract_patterns(id) ON DELETE CASCADE,

    -- How strongly this node exemplifies the pattern
    strength        FLOAT DEFAULT 1.0,  -- 0.0-1.0

    -- Who made this association
    contributor     VARCHAR(100),

    created_at      TIMESTAMPTZ DEFAULT NOW(),

    -- Prevent duplicates
    UNIQUE(node_id, pattern_id)
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_abstract_patterns_name ON abstract_patterns (name);
CREATE INDEX IF NOT EXISTS idx_node_abstract_patterns_node ON node_abstract_patterns (node_id);
CREATE INDEX IF NOT EXISTS idx_node_abstract_patterns_pattern ON node_abstract_patterns (pattern_id);

-- Function to find nodes sharing a pattern across domains
CREATE OR REPLACE FUNCTION find_pattern_siblings(
    target_node_id UUID,
    exclude_same_domain BOOLEAN DEFAULT TRUE
)
RETURNS TABLE(
    node_id UUID,
    content TEXT,
    domain VARCHAR,
    pattern_name VARCHAR,
    pattern_strength FLOAT
) AS $$
BEGIN
    RETURN QUERY
    SELECT DISTINCT
        n.id as node_id,
        n.content,
        n.domain,
        p.name as pattern_name,
        np2.strength as pattern_strength
    FROM node_abstract_patterns np1
    JOIN abstract_patterns p ON np1.pattern_id = p.id
    JOIN node_abstract_patterns np2 ON np2.pattern_id = p.id AND np2.node_id != target_node_id
    JOIN nodes n ON np2.node_id = n.id
    JOIN nodes target ON target.id = target_node_id
    WHERE np1.node_id = target_node_id
        AND n.archived = FALSE
        AND (NOT exclude_same_domain OR n.domain != target.domain OR n.domain IS NULL)
    ORDER BY np2.strength DESC;
END;
$$ LANGUAGE plpgsql;

-- View for pattern statistics
CREATE OR REPLACE VIEW v_pattern_stats AS
SELECT
    p.id,
    p.name,
    p.description,
    COUNT(DISTINCT np.node_id) as node_count,
    COUNT(DISTINCT n.domain) as domain_count,
    ARRAY_AGG(DISTINCT n.domain) FILTER (WHERE n.domain IS NOT NULL) as domains
FROM abstract_patterns p
LEFT JOIN node_abstract_patterns np ON np.pattern_id = p.id
LEFT JOIN nodes n ON np.node_id = n.id AND n.archived = FALSE
GROUP BY p.id, p.name, p.description
ORDER BY node_count DESC;

COMMENT ON TABLE abstract_patterns IS 'Abstract conceptual patterns that bridge domains (distinct from code patterns)';
COMMENT ON TABLE node_abstract_patterns IS 'Links nodes to the abstract patterns they exemplify';
COMMENT ON FUNCTION find_pattern_siblings IS 'Find nodes sharing patterns, optionally excluding same domain';
