import { NextResponse } from 'next/server';

import { auth } from '@/lib/auth';
import { togglePrize } from '@/lib/services/admin-service';

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
  _request: Request,
  { params }: { params: { prizeId: string } }
) {
  const session = await auth();
  const guard = requireAdmin(session);
  if (guard) return guard;

  const prizeId = Number(params.prizeId);
  const updated = await togglePrize(prizeId);

  return NextResponse.json({ data: updated });
}
