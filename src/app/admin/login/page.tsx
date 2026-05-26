import { redirect } from 'next/navigation';
import { createAdminToken, setAdminCookie, validateAdminLogin } from '@/lib/auth';

async function login(formData: FormData) {
  'use server';

  const email = String(formData.get('email') || '');
  const password = String(formData.get('password') || '');

  if (!validateAdminLogin(email, password)) {
    redirect('/admin/login?error=1');
  }

  const token = await createAdminToken(email);
  await setAdminCookie(token);
  redirect('/admin');
}

export default function LoginPage({ searchParams }: { searchParams: { error?: string } }) {
  return (
    <main className="grid min-h-screen place-items-center px-4">
      <form action={login} className="glass w-full max-w-md rounded-[2rem] p-8">
        <p className="text-sm uppercase tracking-[.25em] text-emerald-300">Race Pulse Admin</p>
        <h1 className="mt-3 text-3xl font-black">Entrar</h1>
        {searchParams.error && (
          <p className="mt-4 rounded-2xl bg-red-500/15 p-3 text-sm text-red-200">Login inválido.</p>
        )}
        <div className="mt-6 space-y-3">
          <input name="email" className="input w-full" placeholder="E-mail do admin" autoComplete="username" />
          <input name="password" type="password" className="input w-full" placeholder="Senha" autoComplete="current-password" />
          <button className="btn btn-primary w-full">Entrar</button>
        </div>
      </form>
    </main>
  );
}
