'use client';

import { useMemo, useState } from 'react';

type EventItem = {
  id: string;
  title: string;
  series: string;
  category: string;
  circuit: string;
  startsAt: string | Date;
  notes?: string | null;
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
    categories.find((category) => /Formula 1|F1/i.test(category)) ||
    categories.find((category) => /LMGT3|GTD/i.test(category)) ||
    categories[0] ||
    ''
  );
}

export function NextRaceView({ events }: { events: EventItem[] }) {
  const categories = useMemo(
    () => groupedCategories(Array.from(new Set(events.map((event) => event.category).filter(Boolean)))),
    [events],
  );
  const [category, setCategory] = useState(() => preferredCategory(categories));
  const selectedCategory = category || preferredCategory(categories);

  const event = useMemo(
    () =>
      events.find((item) => groupedCategory(item.category) === selectedCategory) ||
      events[0] ||
      null,
    [events, selectedCategory],
  );

  return (
    <section className="mx-auto max-w-4xl glass rounded-[2rem] p-6 md:p-8">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm uppercase tracking-[.25em] text-emerald-300">Próxima corrida</p>
        {categories.length > 0 && (
          <select className="input py-2.5 sm:w-[260px]" value={selectedCategory} onChange={(event) => setCategory(event.target.value)}>
            {categories.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        )}
      </div>

      {event ? (
        <>
          <h1 className="mt-4 break-words text-4xl font-black md:text-5xl">{event.title}</h1>
          <div className="mt-8 grid gap-4 md:grid-cols-2">
            <div className="glass rounded-3xl p-5"><b>Data</b><p>{new Date(event.startsAt).toLocaleDateString('pt-BR')}</p></div>
            <div className="glass rounded-3xl p-5"><b>Categoria</b><p>{event.category}</p></div>
            <div className="glass rounded-3xl p-5"><b>Série</b><p>{event.series}</p></div>
            <div className="glass rounded-3xl p-5"><b>Circuito</b><p>{event.circuit}</p></div>
          </div>
          {event.notes && <p className="mt-6 text-slate-300 light:text-slate-700">{event.notes}</p>}
        </>
      ) : (
        <h1 className="mt-4 text-3xl font-bold">Nenhuma próxima corrida cadastrada para essa categoria.</h1>
      )}
    </section>
  );
}
