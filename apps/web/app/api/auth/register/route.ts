import { NextResponse } from 'next/server';

import { createUserWithWallet, getUserByEmail } from '@/lib/services/user-service';

export async function POST(request: Request) {
  const payload = await request.json();
  const email = String(payload.email ?? '').toLowerCase();
  const password = String(payload.password ?? '');

  if (!email || !password) {
    return NextResponse.json({ error: 'Email and password required.' }, { status: 400 });
  }

  const existing = await getUserByEmail(email);
  if (existing) {
    return NextResponse.json({ error: 'User already exists.' }, { status: 409 });
  }

  const user = await createUserWithWallet(email, password);
  return NextResponse.json({ data: { id: user.id, email: user.email } }, { status: 201 });
}
