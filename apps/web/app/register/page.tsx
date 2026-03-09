import Link from 'next/link';
import { redirect } from 'next/navigation';

import { Form } from '@/app/form';
import { SubmitButton } from '@/app/submit-button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { createUserWithWallet, getUserByEmail } from '@/lib/services/user-service';

export default function Register() {
  async function register(formData: FormData) {
    'use server';
    const email = String(formData.get('email') ?? '').toLowerCase();
    const password = String(formData.get('password') ?? '');

    if (!email || !password) {
      return 'Email and password are required.';
    }

    const existing = await getUserByEmail(email);
    if (existing) {
      return 'User already exists.';
    }

    await createUserWithWallet(email, password);
    redirect('/login');
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 via-white to-sky-50 px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-2 text-center">
          <CardTitle>Create Account</CardTitle>
          <CardDescription>
            Start your virtual wallet and try the draw engine.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form action={register}>
            <SubmitButton>Create Account</SubmitButton>
            <p className="text-center text-sm text-muted-foreground">
              {'Already have an account? '}
              <Link href="/login" className="font-semibold text-foreground">
                Sign in
              </Link>
            </p>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
