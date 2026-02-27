import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background p-4">
      <p className="text-6xl font-bold text-muted-foreground">404</p>
      <h1 className="text-xl font-semibold">Page introuvable</h1>
      <p className="text-center text-muted-foreground">
        La page que vous recherchez n&apos;existe pas ou a été déplacée.
      </p>
      <Button asChild>
        <Link href="/">Retour à l&apos;accueil</Link>
      </Button>
    </div>
  );
}
