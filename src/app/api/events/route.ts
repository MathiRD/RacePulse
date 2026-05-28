export const dynamic = 'force-dynamic';

import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';

function seasonMinDate() {
  const configured = process.env.IMPORT_MIN_DATE;
  const parsed = configured ? new Date(configured) : null;

  if (parsed && !Number.isNaN(parsed.getTime())) {
    return parsed;
  }

  const year = Number(process.env.IMPORT_YEAR || new Date().getUTCFullYear());
  const safeYear = Number.isFinite(year) ? year : new Date().getUTCFullYear();

  return new Date(Date.UTC(safeYear, 0, 1, 0, 0, 0, 0));
}

export async function GET() {
  const events = await prisma.event.findMany({
    where: { startsAt: { gte: seasonMinDate() } },
    orderBy: [{ startsAt: 'asc' }, { priority: 'asc' }],
    take: 500,
  });

  return NextResponse.json({ ok: true, events });
}
