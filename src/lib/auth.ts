import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { SignJWT, jwtVerify } from 'jose';

const COOKIE = 'race_pulse_admin';
function secret() {
  const value = process.env.JWT_SECRET;
  if (!value || value.length < 32) throw new Error('JWT_SECRET precisa ter pelo menos 32 caracteres.');
  return new TextEncoder().encode(value);
}
export async function createAdminToken(email: string) {
  return new SignJWT({ email, role: 'admin' }).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('7d').sign(secret());
}
export async function setAdminCookie(token: string) {
  cookies().set(COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 60 * 60 * 24 * 7 });
}
export async function clearAdminCookie() { cookies().delete(COOKIE); }
export async function getAdminSession() {
  const token = cookies().get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    if (payload.role !== 'admin') return null;
    return payload;
  } catch { return null; }
}
export async function requireAdmin() {
  const session = await getAdminSession();
  if (!session) redirect('/admin/login');
  return session;
}
export function validateAdminLogin(email: string, password: string) {
  return email === process.env.ADMIN_EMAIL && password === process.env.ADMIN_PASSWORD;
}
