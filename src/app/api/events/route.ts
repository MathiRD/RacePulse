export const dynamic = 'force-dynamic';

import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';

export async function GET() {
  const events = await prisma.event.findMany({
    orderBy: [{ startsAt: 'asc' }, { priority: 'asc' }],
    take: 100,
  });
  return NextResponse.json({ ok: true, events });
}
