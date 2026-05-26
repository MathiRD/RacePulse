export function ThemeScript() {
  const code = `try{const t=localStorage.getItem('race-pulse-theme')||'dark';document.documentElement.classList.toggle('light',t==='light');document.documentElement.classList.toggle('dark',t!=='light')}catch(e){document.documentElement.classList.add('dark')}`;
  return <script dangerouslySetInnerHTML={{ __html: code }} />;
}
