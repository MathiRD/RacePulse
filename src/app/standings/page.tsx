export const dynamic = 'force-dynamic';

import { Nav } from '@/components/nav';
import { StandingsTable } from '@/components/standings-table';
import { prisma } from '@/lib/prisma';
export default async function StandingsPage(){ const standings = await prisma.standing.findMany({ orderBy:[{series:'asc'},{position:'asc'}]}); return <main className="min-h-screen px-4 py-4"><Nav/><section className="mx-auto max-w-7xl"><h1 className="mb-3 text-4xl font-black">Classificações</h1><p className="mb-8 text-slate-300 light:text-slate-700">Tabela filtrável por categoria, equipe, piloto e campeonato.</p><StandingsTable standings={standings}/></section></main> }
