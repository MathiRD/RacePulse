CREATE TYPE "EventKind" AS ENUM ('REAL', 'ESPORT');
ALTER TABLE "Event" ADD COLUMN "eventKind" "EventKind" NOT NULL DEFAULT 'REAL';
CREATE INDEX "Event_eventKind_idx" ON "Event"("eventKind");
