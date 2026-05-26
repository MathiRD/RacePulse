CREATE TYPE "EventStatus" AS ENUM ('UPCOMING', 'LIVE', 'FINISHED', 'CANCELLED', 'UNKNOWN');
CREATE TYPE "ImportStatus" AS ENUM ('SUCCESS', 'FAILED');

CREATE TABLE "Event" (
    "id" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "series" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "circuit" TEXT NOT NULL,
    "country" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3),
    "status" "EventStatus" NOT NULL DEFAULT 'UPCOMING',
    "priority" INTEGER NOT NULL DEFAULT 3,
    "hasBrazilian" BOOLEAN NOT NULL DEFAULT false,
    "hasVerstappen" BOOLEAN NOT NULL DEFAULT false,
    "sourceUrl" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Standing" (
    "id" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "eventId" TEXT,
    "series" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "driver" TEXT NOT NULL,
    "team" TEXT,
    "car" TEXT,
    "points" DOUBLE PRECISION,
    "gap" TEXT,
    "sourceUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Standing_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ImportLog" (
    "id" TEXT NOT NULL,
    "status" "ImportStatus" NOT NULL,
    "provider" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "errorStage" TEXT,
    "errorDetail" TEXT,
    "tavilyStatus" INTEGER,
    "llmModel" TEXT,
    "rawSearchJson" JSONB,
    "llmRawText" TEXT,
    "parsedJson" JSONB,
    "eventsCreated" INTEGER NOT NULL DEFAULT 0,
    "eventsUpdated" INTEGER NOT NULL DEFAULT 0,
    "standingsCreated" INTEGER NOT NULL DEFAULT 0,
    "standingsUpdated" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    CONSTRAINT "ImportLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Event_sourceKey_key" ON "Event"("sourceKey");
CREATE INDEX "Event_startsAt_idx" ON "Event"("startsAt");
CREATE INDEX "Event_series_idx" ON "Event"("series");
CREATE INDEX "Event_category_idx" ON "Event"("category");
CREATE INDEX "Event_priority_idx" ON "Event"("priority");
CREATE UNIQUE INDEX "Standing_sourceKey_key" ON "Standing"("sourceKey");
CREATE INDEX "Standing_series_idx" ON "Standing"("series");
CREATE INDEX "Standing_category_idx" ON "Standing"("category");
CREATE INDEX "Standing_position_idx" ON "Standing"("position");
ALTER TABLE "Standing" ADD CONSTRAINT "Standing_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
