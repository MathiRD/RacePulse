import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createAdminToken, setAdminCookie, validateAdminLogin } from '@/lib/auth';

type LoginPageProps = {
  searchParams?: {
    error?: string;
  };
};

async function login(formData: FormData) {
  'use server';

  const email = String(formData.get('email') || '').trim();
  const password = String(formData.get('password') || '');

  let isValid = false;

  try {
    isValid = await validateAdminLogin(email, password);
  } catch {
    redirect('/admin/login?error=blocked');
  }

  if (!isValid) {
    redirect('/admin/login?error=1');
  }

  const token = await createAdminToken(email);

  await setAdminCookie(token);

  redirect('/admin');
}

export default function LoginPage({ searchParams }: LoginPageProps) {
  const error = searchParams?.error;

  return (
    <main
      className="min-h-screen px-4 py-10"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
      }}
    >
      <form
        action={login}
        className="glass rounded-[2rem] p-6 sm:p-8"
        style={{
          width: '100%',
          maxWidth: '480px',
          margin: '0 auto',
          boxSizing: 'border-box',
        }}
      >
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-[.25em] text-emerald-300">
              Race Pulse Admin
            </p>

            <h1 className="mt-3 text-3xl font-black">Entrar</h1>
          </div>

          <Link
            href="/"
            className="rounded-2xl border border-white/10 bg-white/10 px-3 py-2 text-xs font-semibold text-slate-100 transition hover:bg-white/15"
          >
            Voltar
          </Link>
        </div>

        {error === '1' && (
          <p className="mt-4 rounded-2xl bg-red-500/15 p-3 text-sm text-red-200">
            E-mail ou senha inválidos.
          </p>
        )}

        {error === 'blocked' && (
          <p className="mt-4 rounded-2xl bg-red-500/15 p-3 text-sm text-red-200">
            Muitas tentativas de login. Tente novamente em 1 hora.
          </p>
        )}

        <div className="space-y-3">
          <input
            name="email"
            type="email"
            className="input w-full"
            placeholder="E-mail do admin"
            autoComplete="username"
            required
          />

          <input
            name="password"
            type="password"
            className="input w-full"
            placeholder="Senha"
            autoComplete="current-password"
            required
          />

          <button type="submit" className="btn btn-primary w-full">
            Entrar
          </button>
        </div>
      </form>
    </main>
  );
}