'use client';

import { useCallback, useMemo, useState } from 'react';
import { Bot, Send, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import type { AiChatMessage, AiStrategyPayload, RuggerAiChatResponse } from '@/types/ai';

interface RuggerAiAssistantProps {
  ruggerId: string;
  tokenCount: number;
}

const STARTER_PROMPTS = [
  'Donne-moi une stratégie pour maximiser le taux de réussite.',
  "Quels filtres d'entrée me conseilles-tu aujourd'hui ?",
  'Y a-t-il une rupture de tendance récente sur ce rugger ?',
];

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('fr-FR');
}

export default function RuggerAiAssistant({ ruggerId, tokenCount }: RuggerAiAssistantProps) {
  const [messages, setMessages] = useState<AiChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [strategy, setStrategy] = useState<AiStrategyPayload | null>(null);
  const [source, setSource] = useState<'gemini' | 'fallback' | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canSend = draft.trim() !== '' && !isSending && tokenCount > 0;

  const handleSend = useCallback(
    async (value: string) => {
      const userText = value.trim();
      if (userText === '' || isSending || tokenCount <= 0) return;
      const nextUserMessage: AiChatMessage = { role: 'user', content: userText };
      const nextMessages = [...messages, nextUserMessage];
      setMessages(nextMessages);
      setDraft('');
      setIsSending(true);
      setError(null);
      try {
        const response = await fetch('/api/ai/rugger-chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ruggerId,
            messages: nextMessages.slice(-10),
          }),
        });
        if (!response.ok) {
          setError("L'agent IA n'a pas pu répondre pour le moment.");
          return;
        }
        const data = (await response.json()) as RuggerAiChatResponse;
        setMessages((prev) => [...prev, { role: 'assistant', content: data.answer }]);
        setStrategy(data.strategy);
        setSource(data.context.source);
        setGeneratedAt(data.context.generatedAt);
      } catch {
        setError("Erreur réseau pendant la génération de la réponse IA.");
      } finally {
        setIsSending(false);
      }
    },
    [isSending, messages, ruggerId, tokenCount]
  );

  const strategyFilters = useMemo(() => {
    if (!strategy) return [];
    const filters: string[] = [];
    if (strategy.suggestedFilters.entryMcapMin != null) {
      filters.push(`MCAP entrée min: ${Math.round(strategy.suggestedFilters.entryMcapMin)}`);
    }
    if (strategy.suggestedFilters.entryMcapMax != null) {
      filters.push(`MCAP entrée max: ${Math.round(strategy.suggestedFilters.entryMcapMax)}`);
    }
    if (strategy.suggestedFilters.minHighPercent != null) {
      filters.push(`High minimum: ${Math.round(strategy.suggestedFilters.minHighPercent)}%`);
    }
    if (strategy.suggestedFilters.maxLossPercent != null) {
      filters.push(`Perte max acceptée: ${Math.round(strategy.suggestedFilters.maxLossPercent)}%`);
    }
    if (strategy.suggestedFilters.recentWindowDays != null) {
      filters.push(`Fenêtre récente: ${strategy.suggestedFilters.recentWindowDays} jours`);
    }
    if ((strategy.suggestedFilters.avoidStatuses ?? []).length > 0) {
      filters.push(`Statuts à éviter: ${strategy.suggestedFilters.avoidStatuses?.join(', ')}`);
    }
    return filters;
  }, [strategy]);

  return (
    <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
      <Card>
        <CardHeader className="space-y-2">
          <div className="flex items-center gap-2">
            <Bot className="size-4 text-primary" />
            <h3 className="text-base font-semibold">Chat IA rugger</h3>
          </div>
          <p className="text-xs text-muted-foreground">
            Discussion rapide basée sur les tokens du rugger courant ({tokenCount} token{tokenCount > 1 ? 's' : ''}).
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="h-64 space-y-2 overflow-y-auto rounded-md border bg-muted/20 p-3">
            {messages.length === 0 ? (
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>Exemples:</p>
                <div className="flex flex-wrap gap-2">
                  {STARTER_PROMPTS.map((item) => (
                    <button
                      key={item}
                      type="button"
                      className="rounded-full border px-2 py-1 text-xs hover:bg-muted"
                      onClick={() => void handleSend(item)}
                      disabled={tokenCount <= 0 || isSending}
                    >
                      {item}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((item, index) => (
                <div
                  key={`${item.role}-${index}`}
                  className={`rounded-md px-3 py-2 text-sm ${
                    item.role === 'user' ? 'ml-auto max-w-[85%] bg-primary text-primary-foreground' : 'max-w-[90%] bg-background'
                  }`}
                >
                  {item.content}
                </div>
              ))
            )}
            {isSending && <p className="text-xs text-muted-foreground">Analyse en cours…</p>}
          </div>
          {error && (
            <p className="text-xs text-destructive" role="alert">
              {error}
            </p>
          )}
          {tokenCount <= 0 && (
            <p className="text-xs text-amber-700 dark:text-amber-400">
              Ajoute des tokens au rugger pour activer les recommandations IA.
            </p>
          )}
          <div className="flex gap-2">
            <Input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder='Ex: "Quel setup me donne le meilleur hit rate sur 14 jours ?"'
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  void handleSend(draft);
                }
              }}
            />
            <Button type="button" size="icon" onClick={() => void handleSend(draft)} disabled={!canSend}>
              <Send className="size-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="space-y-2">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary" />
            <h3 className="text-base font-semibold">Stratégie conseillée</h3>
          </div>
          <p className="text-xs text-muted-foreground">
            Proposition dynamique selon les points d&apos;entrée, highs/lows et la tendance récente.
          </p>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {!strategy ? (
            <p className="rounded-md border border-dashed bg-muted/20 p-3 text-muted-foreground">
              Lance une première question dans le chat pour générer une stratégie.
            </p>
          ) : (
            <>
              <div className="rounded-md border bg-muted/20 p-3">
                <p className="font-medium">{strategy.recommendedStrategy}</p>
              </div>
              {strategyFilters.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Filtres suggérés</p>
                  <ul className="space-y-1">
                    {strategyFilters.map((item) => (
                      <li key={item} className="rounded bg-muted/30 px-2 py-1 text-xs">
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {strategy.trendShiftWarning && (
                <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs">
                  {strategy.trendShiftWarning}
                </p>
              )}
              {strategy.riskNotes.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Notes de risque</p>
                  <ul className="space-y-1">
                    {strategy.riskNotes.map((item) => (
                      <li key={item} className="text-xs text-muted-foreground">
                        - {item}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="text-[11px] text-muted-foreground">
                Confiance: {strategy.confidence} · Valide jusqu&apos;à {formatDate(strategy.validUntil)}
                {generatedAt ? ` · Générée ${formatDate(generatedAt)}` : ''}
                {source ? ` · Source: ${source}` : ''}
              </div>
            </>
          )}
          <p className="text-[11px] text-muted-foreground">
            Les recommandations IA sont des aides à la décision et ne constituent pas un conseil financier.
          </p>
        </CardContent>
      </Card>
    </section>
  );
}
