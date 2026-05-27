export const dynamic = 'force-dynamic';

import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';

function minDate() {
  const value = process.env.IMPORT_MIN_DATE;
  const parsed = value ? new Date(value) : null;
  if (parsed && !Number.isNaN(parsed.getTime())) return parsed;
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export async function GET() {
  const events = await prisma.event.findMany({
    where: { startsAt: { gte: minDate() } },
    orderBy: [{ startsAt: 'asc' }, { priority: 'asc' }],
    take: 500,
  });
  return NextResponse.json({ ok: true, events });
}
