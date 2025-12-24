-- CreateEnum
CREATE TYPE "ParticipantType" AS ENUM ('HUMAN', 'SYNTHETIC', 'HYBRID_AUTHOR', 'HYBRID_READER');

-- AlterTable: Add new columns with defaults
ALTER TABLE "participants" ADD COLUMN "type" "ParticipantType" NOT NULL DEFAULT 'HUMAN';
ALTER TABLE "participants" ADD COLUMN "currentStage" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "participants" ADD COLUMN "sessionStart" TIMESTAMP(3);
ALTER TABLE "participants" ADD COLUMN "checkedIn" TIMESTAMP(3);
ALTER TABLE "participants" ADD COLUMN "application" JSONB;

-- Migrate existing data: Set type based on actorType
UPDATE "participants" SET "type" = 'SYNTHETIC' WHERE "actorType" = 'SYNTHETIC';

-- CreateIndex
CREATE INDEX "participants_studyId_type_idx" ON "participants"("studyId", "type");
