export const dynamic = 'force-dynamic';

import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';

export async function GET() {
  const logs = await prisma.importLog.findMany({
    orderBy: { startedAt: 'desc' },
    take: 20,
  });
  return NextResponse.json({ ok: true, logs });
}
