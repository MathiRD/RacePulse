'use client';

import { useMemo, useState } from 'react';
import { FilterBar } from './filter-bar';

type Standing = {
  id: string;
  series: string;
  category: string;
  position: number;
  driver: string;
  team?: string | null;
  car?: string | null;
  points?: number | null;
  gap?: string | null;
};

export function StandingsTable({ standings }: { standings: Standing[] }) {
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');

  const categories = useMemo(() => Array.from(new Set(standings.map((standing) => standing.category))).sort(), [standings]);

  const filtered = standings.filter((standing) =>
    `${standing.series} ${standing.category} ${standing.driver} ${standing.team} ${standing.car}`.toLowerCase().includes(q.toLowerCase()) &&
    (!category || standing.category === category),
  );

  return (
    <>
      <FilterBar q={q} setQ={setQ} category={category} setCategory={setCategory} categories={categories} />
      {standings.length === 0 ? (
        <div className="glass rounded-3xl p-8 text-center text-slate-400">
          Nenhuma classificação real salva ainda. A busca pode retornar só calendário, dependendo das fontes disponíveis.
        </div>
      ) : (
        <div className="glass overflow-hidden rounded-3xl">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-white/10 text-xs uppercase tracking-widest text-slate-400">
                <tr>
                  <th className="px-5 py-4">Pos</th>
                  <th className="px-5 py-4">Piloto/Equipe</th>
                  <th className="px-5 py-4">Série</th>
                  <th className="px-5 py-4">Categoria</th>
                  <th className="px-5 py-4">Carro</th>
                  <th className="px-5 py-4">Pts</th>
                  <th className="px-5 py-4">Gap</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((standing) => (
                  <tr key={standing.id} className="border-t border-white/10">
                    <td className="px-5 py-4 font-bold text-emerald-300">#{standing.position}</td>
                    <td className="px-5 py-4"><b>{standing.driver}</b><br /><span className="text-slate-400">{standing.team || '-'}</span></td>
                    <td className="px-5 py-4">{standing.series}</td>
                    <td className="px-5 py-4">{standing.category}</td>
                    <td className="px-5 py-4">{standing.car || '-'}</td>
                    <td className="px-5 py-4">{standing.points ?? '-'}</td>
                    <td className="px-5 py-4">{standing.gap || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
