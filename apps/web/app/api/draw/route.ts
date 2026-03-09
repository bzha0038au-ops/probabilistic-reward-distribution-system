import { NextResponse } from 'next/server';

import { auth } from '@/lib/auth';
import { executeDraw } from '@/lib/services/draw-service';

export async function POST() {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const record = await executeDraw(Number(session.user.id));
    return NextResponse.json({ data: record });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Draw failed';
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
