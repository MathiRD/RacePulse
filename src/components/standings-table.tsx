'use client';

import { useMemo, useState } from 'react';
import { ALL_FILTER_VALUE, FilterBar } from './filter-bar';

type Standing = {
  id: string;
  series: string;
  category: string;
  kind?: 'ENTRY_LIST' | 'STANDINGS' | string;
  eventKind?: 'REAL' | 'ESPORT' | string;
  position: number;
  carNumber?: string | null;
  driver: string;
  team?: string | null;
  car?: string | null;
  points?: number | null;
  gap?: string | null;
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

export function StandingsTable({ standings }: { standings: Standing[] }) {
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');

  const categories = useMemo(
    () => groupedCategories(Array.from(new Set(standings.map((standing) => standing.category).filter(Boolean)))),
    [standings],
  );
  const selectedCategory = category || preferredCategory(categories);

  const filtered = standings.filter(
    (standing) =>
      `${standing.series} ${standing.category} ${standing.driver} ${standing.team} ${standing.car} ${standing.carNumber}`
        .toLowerCase()
        .includes(q.toLowerCase()) &&
      (selectedCategory === ALL_FILTER_VALUE || !selectedCategory || groupedCategory(standing.category) === selectedCategory),
  );

  return (
    <>
      <FilterBar
        q={q}
        setQ={setQ}
        category={selectedCategory}
        setCategory={setCategory}
        categories={categories}
        placeholder="Buscar por piloto, trio, equipe, carro, GT3, WEC, IMSA..."
      />
      {standings.length === 0 ? (
        <div className="glass rounded-3xl p-8 text-center text-slate-400">
          Nenhuma entry list salva ainda. Rode a importação pelo admin.
        </div>
      ) : (
        <div className="glass overflow-hidden rounded-3xl">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1160px] table-auto text-left text-sm">
              <thead className="bg-white/10 text-xs uppercase tracking-widest text-slate-400">
                <tr>
                  <th className="w-[120px] px-5 py-4">Tipo</th>
                  <th className="w-[84px] px-5 py-4">Nº</th>
                  <th className="px-5 py-4">Pilotos</th>
                  <th className="px-5 py-4">Equipe</th>
                  <th className="min-w-[210px] px-5 py-4">Série</th>
                  <th className="w-[170px] min-w-[170px] whitespace-nowrap break-normal px-5 py-4" style={{ whiteSpace: 'nowrap', minWidth: 170 }}>Categoria</th>
                  <th className="min-w-[180px] px-5 py-4">Carro</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((standing) => {
                  const isEsport = standing.eventKind === 'ESPORT';
                  return (
                    <tr
                      key={standing.id}
                      className={`border-t border-white/10 ${isEsport ? 'bg-fuchsia-950/20 light:bg-fuchsia-100/70' : ''}`}
                    >
                      <td className="px-5 py-4">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="pill whitespace-nowrap px-2.5 py-1 text-[11px]">{standing.kind === 'STANDINGS' ? 'Resultado' : 'Entry List'}</span>
                          {isEsport && (
                            <span className="pill whitespace-nowrap border-fuchsia-300/50 bg-fuchsia-400/20 px-2.5 py-1 text-[11px]">Esport</span>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-4 font-bold text-emerald-300">{standing.carNumber ? `#${standing.carNumber}` : '-'}</td>
                      <td className="px-5 py-4"><b>{standing.driver}</b></td>
                      <td className="px-5 py-4">{standing.team || '-'}</td>
                      <td className="min-w-[210px] px-5 py-4">{standing.series}</td>
                      <td className="w-[170px] min-w-[170px] whitespace-nowrap break-normal px-5 py-4" style={{ whiteSpace: 'nowrap', minWidth: 170 }}>{standing.category}</td>
                      <td className="min-w-[180px] px-5 py-4">{standing.car || '-'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
