'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Menu, X, Shield, Gauge } from 'lucide-react';
import { ThemeToggle } from '@/components/theme-toggle';

const links = [
  { href: '/', label: 'Início' },
  { href: '/calendar', label: 'Calendário' },
  { href: '/next-race', label: 'Próxima corrida' },
  { href: '/standings', label: 'Classificações' },
];

export function Nav() {
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState(false);
  const lastScrollY = useRef(0);

  function closeMenu() {
    setOpen(false);
  }

  useEffect(() => {
    function handleScroll() {
      const currentScrollY = window.scrollY;
      const scrollingDown = currentScrollY > lastScrollY.current;
      const scrollingUp = currentScrollY < lastScrollY.current;

      const isDesktop = window.innerWidth >= 768;

      /**
       * No topo, a navbar sempre aparece.
       */
      if (currentScrollY < 40) {
        setHidden(false);
        lastScrollY.current = currentScrollY;
        return;
      }

      /**
       * No desktop, só começa a esconder depois de rolar um pouco mais,
       * para não sumir com qualquer micro scroll.
       */
      if (isDesktop && currentScrollY < 160) {
        setHidden(false);
        lastScrollY.current = currentScrollY;
        return;
      }

      if (scrollingDown && !open) {
        setHidden(true);
      }

      if (scrollingUp) {
        setHidden(false);
      }

      lastScrollY.current = currentScrollY;
    }

    window.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  }, [open]);

  return (
    <header
      className={[
        'sticky top-4 z-50 mx-auto mb-8 w-full max-w-6xl px-4 transition-transform duration-300 ease-out md:mb-10',
        hidden ? '-translate-y-[140%]' : 'translate-y-0',
      ].join(' ')}
    >
      <div className="glass rounded-[2rem] px-4 py-4 md:px-6">
        <div className="flex items-center justify-between gap-4">
          <Link href="/" onClick={closeMenu} className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-emerald-300 text-slate-950">
              <Gauge size={20} />
            </span>

            <span className="text-lg font-black tracking-tight text-white">
              Race Pulse
            </span>
          </Link>

          <nav className="hidden items-center gap-2 md:flex">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="rounded-2xl px-4 py-3 text-sm font-medium text-slate-200 transition hover:bg-white/10 hover:text-white"
              >
                {link.label}
              </Link>
            ))}

            <Link href="/admin" className="btn btn-ghost flex items-center gap-2">
              <Shield size={16} />
              Admin
            </Link>

            <ThemeToggle />
          </nav>

          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            className="grid h-11 w-11 place-items-center rounded-2xl border border-white/10 bg-white/10 text-white transition hover:bg-white/15 md:hidden"
            aria-label={open ? 'Fechar menu' : 'Abrir menu'}
            aria-expanded={open}
          >
            {open ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>

        {open && (
          <nav className="mt-4 grid gap-2 border-t border-white/10 pt-4 md:hidden">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={closeMenu}
                className="rounded-2xl px-4 py-3 text-sm font-semibold text-slate-100 transition hover:bg-white/10"
              >
                {link.label}
              </Link>
            ))}

            <div className="grid grid-cols-2 gap-2 pt-2">
              <Link
                href="/admin"
                onClick={closeMenu}
                className="btn btn-ghost flex items-center justify-center gap-2"
              >
                <Shield size={16} />
                Admin
              </Link>

              <ThemeToggle />
            </div>
          </nav>
        )}
      </div>
    </header>
  );
}