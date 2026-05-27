CREATE TYPE "StandingKind" AS ENUM ('STANDINGS', 'ENTRY_LIST');
ALTER TABLE "Standing" ADD COLUMN "kind" "StandingKind" NOT NULL DEFAULT 'STANDINGS';
ALTER TABLE "Standing" ADD COLUMN "eventKind" "EventKind" NOT NULL DEFAULT 'REAL';
CREATE INDEX "Standing_kind_idx" ON "Standing"("kind");
CREATE INDEX "Standing_eventKind_idx" ON "Standing"("eventKind");
