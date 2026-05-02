'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { Rugger } from '@/types/rugger';
import type { AiChatMessage, RuggerAiChatResponse } from '@/types/ai';

interface RuggersResponse {
  ruggers: Rugger[];
}

export default function ChatPage() {
  const [ruggers, setRuggers] = useState<Rugger[]>([]);
  const [selectedRuggerId, setSelectedRuggerId] = useState('');
  const [messages, setMessages] = useState<AiChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const selectedRugger = useMemo(
    () => ruggers.find((item) => item.id === selectedRuggerId) ?? null,
    [ruggers, selectedRuggerId]
  );

  useEffect(() => {
    let active = true;
    void (async () => {
      const response = await fetch('/api/ruggers?page=1&pageSize=100');
      if (!response.ok) return;
      const data = (await response.json()) as RuggersResponse;
      if (!active) return;
      setRuggers(data.ruggers);
      if (data.ruggers.length > 0) setSelectedRuggerId(data.ruggers[0].id);
    })();
    return () => {
      active = false;
    };
  }, []);

  const sendMessage = useCallback(async () => {
    const content = draft.trim();
    if (content === '' || !selectedRuggerId || isLoading) return;
    const nextMessages = [...messages, { role: 'user', content } as AiChatMessage];
    setMessages(nextMessages);
    setDraft('');
    setIsLoading(true);
    try {
      const response = await fetch('/api/ai/rugger-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ruggerId: selectedRuggerId, messages: nextMessages.slice(-10) }),
      });
      if (!response.ok) return;
      const data = (await response.json()) as RuggerAiChatResponse;
      setMessages((prev) => [...prev, { role: 'assistant', content: data.answer }]);
    } finally {
      setIsLoading(false);
    }
  }, [draft, isLoading, messages, selectedRuggerId]);

  return (
    <div className="space-y-6 p-6 sm:p-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">AI Chat</h1>
        <p className="text-sm text-muted-foreground">
          Extension globale en préparation. Choisis un rugger pour lancer une discussion IA contextualisée.
        </p>
      </header>

      <Card>
        <CardHeader>
          <h2 className="text-base font-semibold">Rugger cible</h2>
        </CardHeader>
        <CardContent className="space-y-3">
          <select
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={selectedRuggerId}
            onChange={(event) => {
              setSelectedRuggerId(event.target.value);
              setMessages([]);
            }}
          >
            {ruggers.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name ?? item.walletAddress ?? item.id.slice(0, 8)}
              </option>
            ))}
          </select>
          {selectedRugger ? (
            <Link className="inline-flex text-xs text-primary underline underline-offset-2" href={`/rugger/${selectedRugger.id}`}>
              Ouvrir la page Rugger détaillée
            </Link>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="text-base font-semibold">Conversation</h2>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="h-72 space-y-2 overflow-y-auto rounded-md border bg-muted/20 p-3">
            {messages.length === 0 ? (
              <p className="text-sm text-muted-foreground">Commence une discussion pour générer une stratégie.</p>
            ) : (
              messages.map((message, index) => (
                <div
                  key={`${message.role}-${index}`}
                  className={`rounded-md px-3 py-2 text-sm ${
                    message.role === 'user' ? 'ml-auto max-w-[85%] bg-primary text-primary-foreground' : 'max-w-[90%] bg-background'
                  }`}
                >
                  {message.content}
                </div>
              ))
            )}
          </div>
          <div className="flex gap-2">
            <Input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  void sendMessage();
                }
              }}
              placeholder='Ex: "Quels filtres appliquer sur ce rugger cette semaine ?"'
            />
            <Button type="button" onClick={() => void sendMessage()} disabled={isLoading || !selectedRuggerId}>
              {isLoading ? '...' : 'Envoyer'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
