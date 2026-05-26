'use client';
import { Search } from 'lucide-react';
export function FilterBar({ q, setQ, category, setCategory, categories }: { q: string; setQ: (v:string)=>void; category: string; setCategory: (v:string)=>void; categories: string[] }) {
  return <div className="glass mb-6 grid gap-3 rounded-3xl p-4 md:grid-cols-[1fr_220px]"><label className="relative"><Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18}/><input className="input w-full pl-11" value={q} onChange={e=>setQ(e.target.value)} placeholder="Buscar por GT3, WEC, Spa, Nürburgring, Interlagos..."/></label><select className="input" value={category} onChange={e=>setCategory(e.target.value)}><option value="">Todas categorias</option>{categories.map(c=><option key={c} value={c}>{c}</option>)}</select></div>
}
