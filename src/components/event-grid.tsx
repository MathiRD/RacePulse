'use client';

import { CalendarDays, ExternalLink, Flag, MapPin, Star } from 'lucide-react';
import { useMemo, useState } from 'react';
import { FilterBar } from './filter-bar';

type EventItem = {
  id: string;
  title: string;
  series: string;
  category: string;
  circuit: string;
  country?: string | null;
  startsAt: string | Date;
  endsAt?: string | Date | null;
  priority: number;
  hasBrazilian: boolean;
  hasVerstappen: boolean;
  notes?: string | null;
  sourceUrl?: string | null;
};

export function EventGrid({ events }: { events: EventItem[] }) {
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');

  const categories = useMemo(() => Array.from(new Set(events.map((event) => event.category))).sort(), [events]);

  const filtered = events.filter((event) => {
    const hay = `${event.title} ${event.series} ${event.category} ${event.circuit} ${event.country}`.toLowerCase();
    return (!q || hay.includes(q.toLowerCase())) && (!category || event.category === category);
  });

  return (
    <>
      <FilterBar q={q} setQ={setQ} category={category} setCategory={setCategory} categories={categories} />
      {events.length === 0 ? (
        <div className="glass rounded-3xl p-8 text-center text-slate-400">
          Nenhum evento real salvo ainda. Rode a importação pelo admin.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((event) => (
            <article key={event.id} className="glass group rounded-3xl p-5 transition hover:-translate-y-1 hover:shadow-2xl">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[.25em] text-emerald-300">{event.series}</p>
                  <h3 className="mt-2 text-xl font-bold">{event.title}</h3>
                </div>
                <span className="pill flex items-center gap-1"><Star size={13} />P{event.priority}</span>
              </div>
              <div className="space-y-3 text-sm text-slate-300 light:text-slate-700">
                <p className="flex items-center gap-2"><CalendarDays size={16} />{new Date(event.startsAt).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
                <p className="flex items-center gap-2"><MapPin size={16} />{event.circuit}{event.country ? `, ${event.country}` : ''}</p>
                <p className="flex items-center gap-2"><Flag size={16} />{event.category}</p>
              </div>
              <div className="mt-5 flex flex-wrap gap-2">
                {event.hasVerstappen && <span className="pill border-violet-400/40 bg-violet-400/15">Verstappen</span>}
                {event.hasBrazilian && <span className="pill border-yellow-300/40 bg-yellow-300/15">Brasileiro</span>}
                <span className="pill border-emerald-300/40 bg-emerald-300/15">Real data</span>
              </div>
              {event.sourceUrl && event.sourceUrl.startsWith('http') && (
                <a href={event.sourceUrl} target="_blank" rel="noreferrer" className="mt-5 inline-flex items-center gap-2 text-xs text-emerald-300 hover:underline">
                  Fonte <ExternalLink size={13} />
                </a>
              )}
            </article>
          ))}
        </div>
      )}
      {events.length > 0 && filtered.length === 0 && (
        <div className="glass rounded-3xl p-8 text-center text-slate-400">Nenhum evento encontrado para esse filtro.</div>
      )}
    </>
  );
}
