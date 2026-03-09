import { NextResponse } from 'next/server';

import { auth } from '@/lib/auth';
import { updatePrize } from '@/lib/services/admin-service';

function requireAdmin(session: Awaited<ReturnType<typeof auth>>) {
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  return null;
}

export async function PATCH(
  request: Request,
  { params }: { params: { prizeId: string } }
) {
  const session = await auth();
  const guard = requireAdmin(session);
  if (guard) return guard;

  const payload = await request.json();
  const prizeId = Number(params.prizeId);

  const updated = await updatePrize(prizeId, {
    name: payload.name,
    stock: payload.stock !== undefined ? Number(payload.stock) : undefined,
    weight: payload.weight !== undefined ? Number(payload.weight) : undefined,
    poolThreshold:
      payload.poolThreshold !== undefined
        ? String(payload.poolThreshold)
        : undefined,
    rewardAmount:
      payload.rewardAmount !== undefined
        ? String(payload.rewardAmount)
        : undefined,
    isActive:
      payload.isActive !== undefined ? Boolean(payload.isActive) : undefined,
  });

  return NextResponse.json({ data: updated });
}
