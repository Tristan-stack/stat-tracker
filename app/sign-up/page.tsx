'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { signUp } from '@/lib/auth-client';

export default function SignUpPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < 8) {
      setError('Le mot de passe doit contenir au moins 8 caractères');
      return;
    }
    setIsLoading(true);
    try {
      const { error: err } = await signUp.email({
        name: name.trim(),
        email: email.trim(),
        password,
        callbackURL: '/',
      });
      if (err) {
        setError(err.message ?? 'Erreur lors de l\'inscription');
        return;
      }
      router.push('/');
      router.refresh();
    } catch {
      setError('Erreur lors de l\'inscription');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <h1 className="text-xl font-semibold">Inscription</h1>
          <p className="text-sm text-muted-foreground">
            StatTracker – Suivi rentabilité tokens
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="signup-name">Nom</Label>
              <Input
                id="signup-name"
                type="text"
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ton nom"
                required
                disabled={isLoading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="signup-email">Email</Label>
              <Input
                id="signup-email"
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
              <Label htmlFor="signup-password">Mot de passe (min. 8 caractères)</Label>
              <Input
                id="signup-password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                disabled={isLoading}
              />
            </div>
            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? 'Inscription…' : 'S\'inscrire'}
            </Button>
          </form>
          <p className="mt-4 text-center text-sm text-muted-foreground">
            Déjà un compte ?{' '}
            <Link href="/sign-in" className="underline hover:text-foreground">
              Se connecter
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
