'use client';

import { Search } from 'lucide-react';

export const ALL_FILTER_VALUE = '__ALL__';

export function FilterBar({
  q,
  setQ,
  category,
  setCategory,
  categories,
  placeholder = 'Buscar por GT3, WEC, Spa, Nürburgring, Interlagos...',
}: {
  q: string;
  setQ: (v: string) => void;
  category: string;
  setCategory: (v: string) => void;
  categories: string[];
  placeholder?: string;
}) {
  return (
    <div className="glass mb-6 grid min-w-0 gap-3 rounded-3xl p-3 md:grid-cols-[minmax(0,1fr)_240px]">
      <label className="input flex min-w-0 items-center gap-2.5 px-4 py-0">
        <Search className="shrink-0 text-slate-400" size={17} />
        <input
          className="min-w-0 flex-1 border-0 bg-transparent py-2.5 pl-0 pr-0 text-sm text-slate-100 outline-none ring-0 placeholder:text-slate-400 focus:outline-none"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={placeholder}
        />
      </label>
      <select className="input min-w-0 py-2.5" value={category} onChange={(e) => setCategory(e.target.value)}>
        {categories.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
        <option value={ALL_FILTER_VALUE}>Todas categorias</option>
      </select>
    </div>
  );
}
