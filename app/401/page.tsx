import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function UnauthorizedPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background p-4">
      <p className="text-6xl font-bold text-muted-foreground">401</p>
      <h1 className="text-xl font-semibold">Non autorisé</h1>
      <p className="text-center text-muted-foreground">
        Vous devez être connecté pour accéder à cette ressource.
      </p>
      <div className="flex gap-3">
        <Button asChild variant="outline">
          <Link href="/sign-in">Se connecter</Link>
        </Button>
        <Button asChild>
          <Link href="/">Accueil</Link>
        </Button>
      </div>
    </div>
  );
}
