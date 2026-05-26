export const dynamic = 'force-dynamic';

import { requireAdmin } from '@/lib/auth';
import { runImport } from '@/lib/importer';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const internalSecret = request.headers.get('x-internal-import-secret');
  const expectedSecret = process.env.INTERNAL_IMPORT_SECRET;

  if (!expectedSecret || internalSecret !== expectedSecret) {
    await requireAdmin();
  }

  const body = await request.json().catch(() => ({}));
  const result = await runImport({
    force: Boolean(body.force),
    dryRun: Boolean(body.dryRun),
    query: body.query,
  });

  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
