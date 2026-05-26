export const dynamic = 'force-dynamic';

import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';

export async function GET() {
  const standings = await prisma.standing.findMany({
    orderBy: [{ series: 'asc' }, { category: 'asc' }, { position: 'asc' }],
    take: 100,
  });
  return NextResponse.json({ ok: true, standings });
}
