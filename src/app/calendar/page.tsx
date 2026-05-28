export const dynamic = 'force-dynamic';

import { Nav } from '@/components/nav';
import { EventGrid } from '@/components/event-grid';
import { prisma } from '@/lib/prisma';

function seasonMinDate() {
  const configured = process.env.IMPORT_MIN_DATE;
  const parsed = configured ? new Date(configured) : null;

  if (parsed && !Number.isNaN(parsed.getTime())) {
    return parsed;
  }

  const year = Number(process.env.IMPORT_YEAR || new Date().getUTCFullYear());
  const safeYear = Number.isFinite(year) ? year : new Date().getUTCFullYear();

  return new Date(Date.UTC(safeYear, 0, 1, 0, 0, 0, 0));
}

export default async function CalendarPage() {
  const events = await prisma.event.findMany({
    where: { startsAt: { gte: seasonMinDate() } },
    orderBy: [{ startsAt: 'asc' }, { priority: 'asc' }],
    take: 500,
  });

  return (
    <main className="min-h-screen max-w-full overflow-x-hidden px-3 py-4 sm:px-4">
      <Nav />
      <section className="mx-auto w-full max-w-7xl min-w-0">
        <h1 className="mb-3 break-words text-4xl font-black">Calendário completo</h1>
        <p className="mb-8 break-words text-slate-300 light:text-slate-700">
          Use a busca para filtrar por série, pista, país ou categoria. Eventos eSport aparecem destacados para não confundir com corrida real.
        </p>
        <EventGrid events={events} />
      </section>
    </main>
  );
}
