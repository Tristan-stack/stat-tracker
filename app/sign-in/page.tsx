'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { signIn } from '@/lib/auth-client';

function SignInForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl') ?? '/';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      const { error: err } = await signIn.email({
        email: email.trim(),
        password,
        callbackURL: callbackUrl,
      });
      if (err) {
        setError(err.message ?? 'Erreur de connexion');
        return;
      }
      router.push(callbackUrl);
      router.refresh();
    } catch {
      setError('Erreur de connexion');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <h1 className="text-xl font-semibold">Connexion</h1>
        <p className="text-sm text-muted-foreground">
          StatTracker – Suivi rentabilité tokens
        </p>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="signin-email">Email</Label>
            <Input
              id="signin-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@exemple.com"
              required
              disabled={isLoading}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="signin-password">Mot de passe</Label>
            <Input
              id="signin-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={isLoading}
            />
          </div>
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? 'Connexion…' : 'Se connecter'}
          </Button>
        </form>
        <p className="mt-4 text-center text-sm text-muted-foreground">
          Pas de compte ?{' '}
          <Link href="/sign-up" className="underline hover:text-foreground">
            S&apos;inscrire
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}

export default function SignInPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Suspense fallback={<Card className="w-full max-w-sm"><CardHeader><div className="h-8 w-24 animate-pulse rounded bg-muted" /></CardHeader><CardContent><div className="h-10 animate-pulse rounded bg-muted" /></CardContent></Card>}>
        <SignInForm />
      </Suspense>
    </div>
  );
}
