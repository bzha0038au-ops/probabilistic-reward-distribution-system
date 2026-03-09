import { NextResponse } from 'next/server';

import { auth } from '@/lib/auth';
import { getWalletBalance } from '@/lib/services/wallet-service';

export async function GET() {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const balance = await getWalletBalance(Number(session.user.id));

  return NextResponse.json({ balance });
}
