'use client';

import { CalendarDays, ExternalLink, Flag, MapPin, Star } from 'lucide-react';
import { useMemo, useState } from 'react';
import { ALL_FILTER_VALUE, FilterBar } from './filter-bar';

type EventItem = {
  id: string;
  title: string;
  series: string;
  category: string;
  eventKind?: 'REAL' | 'ESPORT' | string;
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

function groupedCategory(category: string) {
  const value = category.trim();
  const upper = value.toUpperCase();

  if (/\bGT3\b/.test(upper) && !/LMGT3|GTD/.test(upper)) {
    return 'GT3';
  }

  return value;
}

function groupedCategories(categories: string[]) {
  return Array.from(new Set(categories.map(groupedCategory))).sort();
}

function preferredCategory(categories: string[]) {
  return (
    categories.find((category) => category === 'GT3') ||
    categories.find((category) => /Endurance/i.test(category)) ||
    categories.find((category) => /LMGT3|GTD/i.test(category)) ||
    categories[0] ||
    ALL_FILTER_VALUE
  );
}

function toDate(value: string | Date) {
  return value instanceof Date ? value : new Date(value);
}

function dayStart(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function isWithinRaceHighlightWindow(eventDate: Date, referenceDate: Date) {
  const eventDay = dayStart(eventDate);
  const referenceDay = dayStart(referenceDate);
  const threeDayWindowEnd = eventDay + 2 * 24 * 60 * 60 * 1000;

  return referenceDay >= eventDay && referenceDay <= threeDayWindowEnd;
}

function getNextEventIdsByCategory(events: EventItem[]) {
  const todayStart = dayStart(new Date());
  const nextByCategory = new Map<string, EventItem>();

  for (const event of events) {
    const eventDate = toDate(event.startsAt);
    const eventDay = dayStart(eventDate);

    if (Number.isNaN(eventDate.getTime()) || eventDay <= todayStart) {
      continue;
    }

    const key = groupedCategory(event.category || '');
    const current = nextByCategory.get(key);

    if (!current || eventDate.getTime() < toDate(current.startsAt).getTime()) {
      nextByCategory.set(key, event);
    }
  }

  return new Set(Array.from(nextByCategory.values()).map((event) => event.id));
}

function getNextEventId(events: EventItem[]) {
  const todayStart = dayStart(new Date());

  return events
    .filter((event) => {
      const eventDate = toDate(event.startsAt);
      return !Number.isNaN(eventDate.getTime()) && dayStart(eventDate) > todayStart;
    })
    .sort((a, b) => toDate(a.startsAt).getTime() - toDate(b.startsAt).getTime())[0]?.id;
}

export function EventGrid({ events }: { events: EventItem[] }) {
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');

  const categories = useMemo(
    () => groupedCategories(Array.from(new Set(events.map((event) => event.category).filter(Boolean)))),
    [events],
  );

  const selectedCategory = category || preferredCategory(categories);

  const filtered = useMemo(
    () =>
      events.filter((event) => {
        const hay = `${event.title} ${event.series} ${event.category} ${event.circuit} ${event.country} ${event.eventKind}`.toLowerCase();
        return (
          (!q || hay.includes(q.toLowerCase())) &&
          (selectedCategory === ALL_FILTER_VALUE || !selectedCategory || groupedCategory(event.category) === selectedCategory)
        );
      }),
    [events, q, selectedCategory],
  );

  const nextEventId = useMemo(() => getNextEventId(filtered), [filtered]);
  const nextEventIdsByCategory = useMemo(() => getNextEventIdsByCategory(filtered), [filtered]);

  return (
    <>
      <FilterBar q={q} setQ={setQ} category={selectedCategory} setCategory={setCategory} categories={categories} />
      {events.length === 0 ? (
        <div className="glass rounded-3xl p-8 text-center text-slate-400">
          Nenhum evento real salvo ainda. Rode a importação pelo admin.
        </div>
      ) : (
        <div className="grid min-w-0 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((event) => {
            const isEsport = event.eventKind === 'ESPORT';
            const eventDate = toDate(event.startsAt);
            const isToday = !Number.isNaN(eventDate.getTime()) && isWithinRaceHighlightWindow(eventDate, new Date());
            const isNext = !isToday && (selectedCategory === ALL_FILTER_VALUE ? nextEventIdsByCategory.has(event.id) : event.id === nextEventId);

            const cardStateClass = isToday
              ? 'border-emerald-300/80 shadow-[0_0_34px_rgba(52,211,153,0.24)] ring-2 ring-emerald-300/35'
              : isNext
                ? 'border-sky-300/75 shadow-[0_0_34px_rgba(56,189,248,0.22)] ring-2 ring-sky-300/32'
                : isEsport
                  ? 'border-fuchsia-400/40 bg-fuchsia-950/30 light:bg-fuchsia-100/80'
                  : '';

            return (
              <article
                key={event.id}
                className={`glass group relative min-w-0 overflow-hidden rounded-3xl border p-5 transition hover:-translate-y-1 hover:shadow-2xl ${cardStateClass}`}
              >
                {isToday && <div className="absolute inset-x-0 top-0 h-1.5 bg-emerald-300/80" />}
                {isNext && <div className="absolute inset-x-0 top-0 h-1.5 bg-sky-300/80" />}
                <div className="mb-4 flex min-w-0 items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className={`break-words text-xs uppercase tracking-[.25em] ${isToday ? 'text-emerald-200' : isNext ? 'text-sky-200' : isEsport ? 'text-fuchsia-300 light:text-fuchsia-700' : 'text-emerald-300'}`}>
                      {isEsport ? 'ESPORT • ' : ''}{event.series}
                    </p>
                    <h3 className="mt-2 break-words text-xl font-bold">{event.title}</h3>
                  </div>
                  <span className="pill flex shrink-0 items-center gap-1"><Star size={13} />P{event.priority}</span>
                </div>
                <div className="space-y-3 text-sm text-slate-300 light:text-slate-700">
                  <p className="flex min-w-0 items-start gap-2"><CalendarDays className="mt-0.5 shrink-0" size={16} /><span className="break-words">{eventDate.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}</span></p>
                  <p className="flex min-w-0 items-start gap-2"><MapPin className="mt-0.5 shrink-0" size={16} /><span className="break-words">{event.circuit}{event.country ? `, ${event.country}` : ''}</span></p>
                  <p className="flex min-w-0 items-start gap-2"><Flag className="mt-0.5 shrink-0" size={16} /><span className="break-words">{event.category}</span></p>
                </div>
                <div className="mt-5 flex min-w-0 flex-wrap gap-2">
                  {isToday && <span className="pill border-emerald-200/80 bg-emerald-300/35 font-bold text-emerald-50 shadow-[0_0_18px_rgba(52,211,153,0.25)] light:text-emerald-900">Hoje</span>}
                  {isNext && <span className="pill border-sky-200/80 bg-sky-300/35 font-bold text-sky-50 shadow-[0_0_18px_rgba(56,189,248,0.25)] light:text-sky-900">Próxima corrida</span>}
                  {isEsport && <span className="pill border-fuchsia-300/50 bg-fuchsia-400/20 text-fuchsia-100 light:text-fuchsia-800">Virtual / Esport</span>}
                  {event.hasVerstappen && <span className="pill border-violet-400/40 bg-violet-400/15">Verstappen</span>}
                  {event.hasBrazilian && <span className="pill border-yellow-300/40 bg-yellow-300/15">Brasileiro</span>}
                  {!isEsport && <span className="pill border-emerald-300/40 bg-emerald-300/15">Real data</span>}
                </div>
                {event.sourceUrl && event.sourceUrl.startsWith('http') && (
                  <a href={event.sourceUrl} target="_blank" rel="noreferrer" className="mt-5 inline-flex max-w-full items-center gap-2 break-all text-xs text-emerald-300 hover:underline">
                    Fonte <ExternalLink className="shrink-0" size={13} />
                  </a>
                )}
              </article>
            );
          })}
        </div>
      )}
      {events.length > 0 && filtered.length === 0 && (
        <div className="glass rounded-3xl p-8 text-center text-slate-400">Nenhum evento encontrado para esse filtro.</div>
      )}
    </>
  );
}
