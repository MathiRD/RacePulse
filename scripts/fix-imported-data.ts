import { prisma } from '../src/lib/prisma';

function minDate() {
  const value = process.env.IMPORT_MIN_DATE;
  const parsed = value ? new Date(value) : null;
  if (parsed && !Number.isNaN(parsed.getTime())) return parsed;
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

async function main() {
  const cutoff = minDate();

  const oldEvents = await prisma.event.deleteMany({
    where: {
      startsAt: { lt: cutoff },
    },
  });

  const fixedStandings = await prisma.standing.updateMany({
    data: {
      points: null,
      gap: null,
    },
  });

  console.log(JSON.stringify({ ok: true, cutoff, oldEventsDeleted: oldEvents.count, entriesFixed: fixedStandings.count }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
