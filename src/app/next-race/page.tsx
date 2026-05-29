export const dynamic = 'force-dynamic';

import { Nav } from '@/components/nav';
import { NextRaceView } from '@/components/next-race-view';
import { prisma } from '@/lib/prisma';

export default async function NextRacePage() {
  const events = await prisma.event.findMany({
    where: { startsAt: { gte: new Date() } },
    orderBy: { startsAt: 'asc' },
  });

  const serializedEvents = events.map((event) => ({
    ...event,
    startsAt: event.startsAt.toISOString(),
    endsAt: event.endsAt ? event.endsAt.toISOString() : null,
  }));

  return (
    <main className="min-h-screen px-4 py-4">
      <Nav />
      <NextRaceView events={serializedEvents} />
    </main>
  );
}
