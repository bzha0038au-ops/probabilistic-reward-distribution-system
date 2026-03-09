import { NextResponse } from 'next/server';

import { auth } from '@/lib/auth';
import { createPrize, listPrizes } from '@/lib/services/admin-service';

function requireAdmin(session: Awaited<ReturnType<typeof auth>>) {
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  return null;
}

export async function GET() {
  const session = await auth();
  const guard = requireAdmin(session);
  if (guard) return guard;

  const prizes = await listPrizes();
  return NextResponse.json({ data: prizes });
}

export async function POST(request: Request) {
  const session = await auth();
  const guard = requireAdmin(session);
  if (guard) return guard;

  const payload = await request.json();

  const created = await createPrize({
    name: payload.name,
    stock: Number(payload.stock ?? 0),
    weight: Number(payload.weight ?? 1),
    poolThreshold: String(payload.poolThreshold ?? '0'),
    rewardAmount: String(payload.rewardAmount ?? '0'),
    isActive: Boolean(payload.isActive ?? true),
  });

  return NextResponse.json({ data: created }, { status: 201 });
}
