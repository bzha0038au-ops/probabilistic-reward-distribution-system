import Link from 'next/link';
import { redirect } from 'next/navigation';

import { Form } from '@/app/form';
import { SubmitButton } from '@/app/submit-button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { signIn } from '@/lib/auth';

export default function Login({
  searchParams,
}: {
  searchParams?: { error?: string };
}) {
  const error = searchParams?.error;
  const errorMessage =
    error === 'CredentialsSignin'
      ? 'Invalid email or password.'
      : error
        ? 'Unable to sign in. Please try again.'
        : null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 via-white to-sky-50 px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-2 text-center">
          <CardTitle>Sign In</CardTitle>
          <CardDescription>
            Access your wallet and draw history.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form
            action={async (formData: FormData) => {
              'use server';
              try {
                await signIn('credentials', {
                  redirectTo: '/app',
                  email: formData.get('email') as string,
                  password: formData.get('password') as string,
                });
              } catch (error) {
                const type = (error as { type?: string })?.type;
                if (type) {
                  redirect(`/login?error=${encodeURIComponent(type)}`);
                }
                throw error;
              }
            }}
          >
            {errorMessage && (
              <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
                {errorMessage}
              </p>
            )}
            <SubmitButton>Sign In</SubmitButton>
            <p className="text-center text-sm text-muted-foreground">
              {"Don't have an account? "}
              <Link href="/register" className="font-semibold text-foreground">
                Sign up
              </Link>
            </p>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
