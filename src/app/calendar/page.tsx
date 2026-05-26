export const dynamic = 'force-dynamic';

import { Nav } from '@/components/nav';
import { EventGrid } from '@/components/event-grid';
import { prisma } from '@/lib/prisma';
export default async function CalendarPage(){ const events = await prisma.event.findMany({ orderBy:{ startsAt:'asc' }}); return <main className="min-h-screen px-4 py-4"><Nav/><section className="mx-auto max-w-7xl"><h1 className="mb-3 text-4xl font-black">Calendário completo</h1><p className="mb-8 text-slate-300 light:text-slate-700">Use a busca para filtrar por série, pista, país ou categoria.</p><EventGrid events={events}/></section></main> }
