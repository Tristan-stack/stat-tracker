import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function ForbiddenPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background p-4">
      <p className="text-6xl font-bold text-muted-foreground">403</p>
      <h1 className="text-xl font-semibold">Accès interdit</h1>
      <p className="text-center text-muted-foreground">
        Vous n&apos;avez pas les droits pour accéder à cette ressource.
      </p>
      <Button asChild>
        <Link href="/">Retour à l&apos;accueil</Link>
      </Button>
    </div>
  );
}
