import { NextResponse } from 'next/server';

import { auth } from '@/lib/auth';
import { getTransactionHistory } from '@/lib/services/wallet-service';

export async function GET(request: Request) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const limit = Number(searchParams.get('limit') ?? 50);

  const history = await getTransactionHistory(
    Number(session.user.id),
    Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 200) : 50
  );

  return NextResponse.json({ data: history });
}
