'use client';

import { Card, CardContent } from '@/components/ui/card';
import { IconNetwork } from '@tabler/icons-react';

interface RuggerNetworkTabProps {
  ruggerId: string;
}

export default function RuggerNetworkTab({ ruggerId: _ruggerId }: RuggerNetworkTabProps) {
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center justify-center gap-3 py-16">
        <IconNetwork className="size-10 text-muted-foreground/50" />
        <p className="text-sm font-medium text-muted-foreground">
          Network Analysis
        </p>
        <p className="text-xs text-muted-foreground/70">
          Analyse des wallets acheteurs par corrélation de tokens et/ou d'adresses mères.
        </p>
      </CardContent>
    </Card>
  );
}
