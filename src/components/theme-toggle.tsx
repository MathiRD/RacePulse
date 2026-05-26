'use client';
import { Moon, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';
export function ThemeToggle() {
  const [theme, setTheme] = useState('dark');
  useEffect(() => setTheme(localStorage.getItem('race-pulse-theme') || 'dark'), []);
  function toggle() {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    localStorage.setItem('race-pulse-theme', next);
    document.documentElement.classList.toggle('light', next === 'light');
    document.documentElement.classList.toggle('dark', next !== 'light');
  }
  return <button onClick={toggle} className="btn btn-ghost flex items-center gap-2">{theme === 'dark' ? <Sun size={16}/> : <Moon size={16}/>} {theme === 'dark' ? 'Claro' : 'Escuro'}</button>;
}
