-- Migration: Add validation scores to nodes table
-- These scores track the quality evaluation when promoting to breakthrough

-- Add validation score columns
ALTER TABLE nodes ADD COLUMN IF NOT EXISTS validation_synthesis FLOAT;
ALTER TABLE nodes ADD COLUMN IF NOT EXISTS validation_novelty FLOAT;
ALTER TABLE nodes ADD COLUMN IF NOT EXISTS validation_testability FLOAT;
ALTER TABLE nodes ADD COLUMN IF NOT EXISTS validation_tension_resolution FLOAT;
ALTER TABLE nodes ADD COLUMN IF NOT EXISTS validation_composite FLOAT;
ALTER TABLE nodes ADD COLUMN IF NOT EXISTS validation_reason TEXT;
ALTER TABLE nodes ADD COLUMN IF NOT EXISTS validated_at TIMESTAMPTZ;
ALTER TABLE nodes ADD COLUMN IF NOT EXISTS validated_by VARCHAR(100);

-- Index for filtering breakthroughs by composite score
CREATE INDEX IF NOT EXISTS idx_nodes_validation_composite
ON nodes (validation_composite DESC)
WHERE node_type = 'breakthrough' AND archived = FALSE;

-- Comments
COMMENT ON COLUMN nodes.validation_synthesis IS 'Breakthrough score: combines multiple concepts non-obviously (0-10)';
COMMENT ON COLUMN nodes.validation_novelty IS 'Breakthrough score: genuinely new vs derivative (0-10)';
COMMENT ON COLUMN nodes.validation_testability IS 'Breakthrough score: makes testable predictions (0-10)';
COMMENT ON COLUMN nodes.validation_tension_resolution IS 'Breakthrough score: resolves paradox/tension (0-10)';
COMMENT ON COLUMN nodes.validation_composite IS 'Weighted composite of validation scores';
COMMENT ON COLUMN nodes.validation_reason IS 'Reason given for breakthrough promotion';
