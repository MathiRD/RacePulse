-- AlterTable
ALTER TABLE "Standing" ADD COLUMN     "carNumber" TEXT,
ALTER COLUMN "kind" SET DEFAULT 'ENTRY_LIST';

-- CreateIndex
CREATE INDEX "Standing_eventId_idx" ON "Standing"("eventId");
