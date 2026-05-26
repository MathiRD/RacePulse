import Link from 'next/link';
import { Gauge, Shield } from 'lucide-react';
import { ThemeToggle } from './theme-toggle';
export function Nav() {
  const links = [['/','Início'],['/calendar','Calendário'],['/next-race','Próxima corrida'],['/standings','Classificações']];
  return <header className="sticky top-4 z-20 mx-auto mb-8 max-w-7xl px-4"><div className="glass flex flex-wrap items-center justify-between gap-3 rounded-3xl p-3"><Link href="/" className="flex items-center gap-2 rounded-2xl px-3 py-2 font-bold"><span className="grid size-9 place-items-center rounded-2xl bg-emerald-300 text-slate-950"><Gauge size={18}/></span>Race Pulse</Link><nav className="flex flex-wrap items-center gap-2">{links.map(([href,label])=><Link key={href} href={href} className="rounded-2xl px-3 py-2 text-sm text-slate-300 hover:bg-white/10 hover:text-white light:text-slate-700 light:hover:bg-slate-100">{label}</Link>)}<Link href="/admin" className="btn btn-ghost flex items-center gap-2"><Shield size={16}/>Admin</Link><ThemeToggle/></nav></div></header>
}
