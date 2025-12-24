-- Add architectureConfig column to conditions table
-- Stores StoryArchitectureConfig JSON for parameterized experiments

ALTER TABLE "conditions" ADD COLUMN "architectureConfig" TEXT;

-- No index needed as this column is not typically queried directly
