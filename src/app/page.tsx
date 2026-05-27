export const dynamic = 'force-dynamic';

import { Nav } from '@/components/nav';
import { EventGrid } from '@/components/event-grid';
import { StandingsTable } from '@/components/standings-table';
import { prisma } from '@/lib/prisma';
import { ArrowRight, CalendarDays, Search, ShieldCheck, Trophy } from 'lucide-react';
import Link from 'next/link';

export default async function HomePage() {
  const [events, standings, logs] = await Promise.all([
    prisma.event.findMany({ where: { startsAt: { gte: new Date() } }, orderBy: [{ startsAt: 'asc' }, { priority: 'asc' }], take: 60 }),
    prisma.standing.findMany({ orderBy: [{ series: 'asc' }, { category: 'asc' }, { position: 'asc' }], take: 60 }),
    prisma.importLog.findMany({ orderBy: { startedAt: 'desc' }, take: 1 }),
  ]);

  const next = events.find((event) => event.startsAt >= new Date()) || events[0];

  return (
    <main className="min-h-screen px-4 py-4">
      <Nav />
      <section className="mx-auto max-w-7xl">
        <div className="grid gap-6 lg:grid-cols-[1.2fr_.8fr]">
          <div className="glass rounded-[2rem] p-8 md:p-10">
            <p className="mb-4 inline-flex rounded-full border border-emerald-300/30 bg-emerald-300/10 px-4 py-2 text-sm text-emerald-200 light:text-emerald-700">
              GT3 • Endurance • Dados reais via busca web
            </p>
            <h1 className="max-w-4xl text-4xl font-black tracking-tight md:text-6xl">
              Calendário inteligente para acompanhar endurance.
            </h1>
            <p className="mt-5 max-w-2xl text-lg text-slate-300 light:text-slate-700">
              Importação com Gemini Grounded Search + normalizador, cache Redis, persistência PostgreSQL e painel de diagnóstico para validar fonte, JSON e erros.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/calendar" className="btn btn-primary flex items-center gap-2">Ver calendário <ArrowRight size={16} /></Link>
              <Link href="/standings" className="btn btn-ghost flex items-center gap-2">Pilotos / Entry Lists</Link>
              <Link href="/admin/login" className="btn btn-ghost flex items-center gap-2"><ShieldCheck size={16} /> Admin</Link>
            </div>
          </div>

          <aside className="glass rounded-[2rem] p-6">
            <p className="text-sm uppercase tracking-[.25em] text-slate-400">Próxima corrida</p>
            {next ? (
              <>
                <h2 className="mt-3 text-2xl font-bold">{next.title}</h2>
                <div className="mt-5 space-y-3 text-sm text-slate-300 light:text-slate-700">
                  <p className="flex gap-2"><CalendarDays size={16} />{next.startsAt.toLocaleDateString('pt-BR')}</p>
                  <p className="flex gap-2"><Trophy size={16} />{next.series} • {next.category}</p>
                  <p className="flex gap-2"><Search size={16} />{next.circuit}</p>
                </div>
              </>
            ) : (
              <div className="mt-4 rounded-3xl border border-white/10 bg-black/20 p-5 text-sm text-slate-300 light:bg-white/60 light:text-slate-700">
                Nenhuma corrida real importada ainda. Entre no admin, rode um dry-run e depois faça a importação real.
              </div>
            )}
            <div className="mt-6 rounded-3xl bg-black/20 p-4 text-xs text-slate-400 light:bg-white/50">
              Último import: {logs[0]?.status || 'sem logs'} — {logs[0]?.message || 'sem importações reais ainda'}
            </div>
          </aside>
        </div>

        <section className="mt-10">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-2xl font-bold">Calendário</h2>
            <Link className="text-sm text-emerald-300" href="/calendar">ver tudo</Link>
          </div>
          <EventGrid events={events} />
        </section>

        <section className="mt-12">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-2xl font-bold">Pilotos / Entry Lists</h2>
            <Link className="text-sm text-emerald-300" href="/standings">ver tudo</Link>
          </div>
          <StandingsTable standings={standings} />
        </section>
      </section>
    </main>
  );
}
