import type { Metadata } from 'next';
import '@/styles/globals.css';
import { ThemeScript } from '@/components/theme-script';
import { Analytics } from '@vercel/analytics/next';

export const metadata: Metadata = {
  title: 'Race Pulse',
  description: 'Calendário, próximas corridas e classificações de GT3 e Endurance.'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head><ThemeScript /></head>
      <body className="app-background">
        {children}
        <Analytics />
      </body>
    </html>
  );
}
