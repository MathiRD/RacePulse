export const dynamic = 'force-dynamic';

import { requireAdmin } from '@/lib/auth';
import { runImport } from '@/lib/importer';
import { prisma } from '@/lib/prisma';
import { redirect } from 'next/navigation';

async function importNow(formData: FormData) {
  'use server';
  await requireAdmin();

  const force = formData.get('force') === 'on';
  const dryRun = formData.get('dryRun') === 'on';
  const query = String(formData.get('query') || process.env.IMPORT_QUERY || '');

  const result = await runImport({ force, dryRun, query });
  redirect(`/admin?log=${result.logId}`);
}

async function clearData() {
  'use server';
  await requireAdmin();
  await prisma.standing.deleteMany();
  await prisma.event.deleteMany();
  await prisma.importLog.deleteMany();
  redirect('/admin');
}

export default async function AdminPage({ searchParams }: { searchParams: { log?: string } }) {
  await requireAdmin();

  const [eventsCount, standingsCount, logs, selected] = await Promise.all([
    prisma.event.count(),
    prisma.standing.count(),
    prisma.importLog.findMany({ orderBy: { startedAt: 'desc' }, take: 12 }),
    searchParams.log ? prisma.importLog.findUnique({ where: { id: searchParams.log } }) : null,
  ]);

  const active = selected || logs[0];

  return (
    <main className="min-h-screen px-4 py-8">
      <section className="mx-auto max-w-7xl">
        <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[.25em] text-emerald-300">Admin</p>
            <h1 className="text-4xl font-black">Painel Race Pulse</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-400">
              Divirta-se e não abuse! cuidado com o uso dos tokens de ambos os serviços!
            </p>
          </div>
          <a href="/" className="btn btn-ghost">Voltar ao site</a>
        </div>

        <div className="grid gap-5 md:grid-cols-3">
          <div className="glass rounded-3xl p-6"><p className="text-slate-400">Eventos reais</p><b className="text-4xl">{eventsCount}</b></div>
          <div className="glass rounded-3xl p-6"><p className="text-slate-400">Pilotos / Entries</p><b className="text-4xl">{standingsCount}</b></div>
          <div className="glass rounded-3xl p-6"><p className="text-slate-400">Último status</p><b className="text-2xl">{logs[0]?.status || '-'}</b></div>
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_360px]">
          <form action={importNow} className="glass rounded-[2rem] p-6">
            <h2 className="text-2xl font-bold">Importar dados reais</h2>
            <p className="mt-2 text-sm text-slate-400">
              Roda Gemini Grounded Search como principal e Tavily apenas como fallback opcional. Use dry-run primeiro para validar sem salvar no banco.
            </p>
            <textarea name="query" className="input mt-4 min-h-28 w-full" defaultValue={process.env.IMPORT_QUERY} />
            <div className="mt-4 flex flex-wrap gap-4 text-sm">
              <label className="flex items-center gap-2"><input type="checkbox" name="force" /> Ignorar cache e consultar novamente</label>
              <label className="flex items-center gap-2"><input type="checkbox" name="dryRun" /> Dry-run: validar sem salvar</label>
            </div>
            <button className="btn btn-primary mt-5">Executar importação real</button>
          </form>

          <form action={clearData} className="glass rounded-[2rem] p-6">
            <h2 className="text-xl font-bold text-red-200">Limpeza de teste</h2>
            <p className="mt-2 text-sm text-slate-400">
              Apaga eventos, classificações e logs.
            </p>
            <button className="btn mt-5 border border-red-400/30 bg-red-500/15 text-red-100 hover:bg-red-500/25">
              Limpar banco
            </button>
          </form>
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-[360px_1fr]">
          <aside className="glass rounded-[2rem] p-4">
            <h2 className="mb-4 font-bold">Logs recentes</h2>
            <div className="space-y-2">
              {logs.map((l) => (
                <a key={l.id} href={`/admin?log=${l.id}`} className="block rounded-2xl border border-white/10 p-3 hover:bg-white/10">
                  <b className={l.status === 'FAILED' ? 'text-red-300' : 'text-emerald-300'}>{l.status}</b>
                  <p className="line-clamp-2 text-xs text-slate-400">{l.message}</p>
                  <p className="mt-1 text-[11px] text-slate-500">{l.startedAt.toLocaleString('pt-BR')}</p>
                </a>
              ))}
            </div>
          </aside>

          <section className="glass overflow-hidden rounded-[2rem] p-5">
            <h2 className="text-xl font-bold">Diagnóstico do import</h2>
            {active ? (
              <div className="mt-4 space-y-4 text-sm">
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-2xl bg-black/20 p-4"><b>Status</b><p>{active.status}</p></div>
                  <div className="rounded-2xl bg-black/20 p-4"><b>Modelo</b><p>{active.llmModel || '-'}</p></div>
                  <div className="rounded-2xl bg-black/20 p-4"><b>Eventos</b><p>+{active.eventsCreated} / ~{active.eventsUpdated}</p></div>
                  <div className="rounded-2xl bg-black/20 p-4"><b>Standings</b><p>+{active.standingsCreated} / ~{active.standingsUpdated}</p></div>
                </div>

                <div className="rounded-2xl bg-black/20 p-4">
                  <b>Mensagem</b>
                  <p className="mt-1 text-slate-300">{active.message}</p>
                </div>

                {active.errorDetail && (
                  <details open>
                    <summary className="cursor-pointer font-bold text-red-200">Erro completo</summary>
                    <pre className="mt-3 max-h-96 overflow-auto rounded-2xl bg-red-950/40 p-4 text-xs text-red-100">{active.errorDetail}</pre>
                  </details>
                )}

                {active.parsedJson && (
                  <details open>
                    <summary className="cursor-pointer font-bold">JSON parseado</summary>
                    <pre className="mt-3 max-h-96 overflow-auto rounded-2xl bg-black/30 p-4 text-xs">{JSON.stringify(active.parsedJson, null, 2)}</pre>
                  </details>
                )}

                {active.llmRawText && (
                  <details>
                    <summary className="cursor-pointer font-bold">Resposta Gemini bruta</summary>
                    <pre className="mt-3 max-h-96 overflow-auto rounded-2xl bg-black/30 p-4 text-xs">{active.llmRawText}</pre>
                  </details>
                )}

                {active.rawSearchJson && (
                  <details>
                    <summary className="cursor-pointer font-bold">Evidências brutas da busca</summary>
                    <pre className="mt-3 max-h-96 overflow-auto rounded-2xl bg-black/30 p-4 text-xs">{JSON.stringify(active.rawSearchJson, null, 2)}</pre>
                  </details>
                )}
              </div>
            ) : (
              <p className="mt-4 text-slate-400">Sem logs ainda. Rode um dry-run primeiro.</p>
            )}
          </section>
        </div>
      </section>
    </main>
  );
}
