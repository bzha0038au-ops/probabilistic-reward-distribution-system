import { NextResponse } from 'next/server';

import { auth } from '@/lib/auth';

const USER_SESSION_COOKIE = 'reward_user_session';
const USER_SESSION_TTL_SECONDS =
  Number(process.env.USER_SESSION_TTL ?? '') || 60 * 60 * 8;

export async function POST() {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const token = session.backendToken;

  if (!token) {
    return NextResponse.json(
      { error: 'Missing backend session token' },
      { status: 400 }
    );
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(USER_SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: USER_SESSION_TTL_SECONDS,
    path: '/',
  });

  return response;
}
