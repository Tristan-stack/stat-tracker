'use client';

import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { Token } from '@/types/token';

function parseDecimal(value: string): number {
  const normalized = value.trim().replace(',', '.');
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}

export interface TokenFormProps {
  onAdd: (token: Token) => void;
}

export function TokenForm({ onAdd }: TokenFormProps) {
  const [name, setName] = useState('');
  const [entryPrice, setEntryPrice] = useState('');
  const [high, setHigh] = useState('');
  const [low, setLow] = useState('');
  const [targetExitPercent, setTargetExitPercent] = useState('');

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const entry = parseDecimal(entryPrice);
      const h = parseDecimal(high);
      const l = parseDecimal(low);
      const target = parseDecimal(targetExitPercent);
      if (entry <= 0 || target < 0) return;
      const token: Token = {
        id: crypto.randomUUID(),
        name: name.trim() || `Token ${Date.now()}`,
        entryPrice: entry,
        high: h,
        low: l,
        targetExitPercent: target,
      };
      onAdd(token);
      setName('');
      setEntryPrice('');
      setHigh('');
      setLow('');
      setTargetExitPercent('');
    },
    [entryPrice, high, low, name, onAdd, targetExitPercent]
  );

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-xl border bg-card p-4 shadow sm:gap-6 sm:p-6 lg:p-8">
      <h2 className="text-lg font-semibold">Nouveau token</h2>
      <div className="grid gap-4 sm:gap-6 sm:grid-cols-2 lg:grid-cols-6">
        <div className="space-y-2.5">
          <Label htmlFor="name">Nom (optionnel)</Label>
          <Input
            id="name"
            placeholder="ex. TOKEN_A"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="entry">Prix d&apos;entrée</Label>
          <Input
            id="entry"
            inputMode="decimal"
            placeholder="3.7"
            value={entryPrice}
            onChange={(e) => setEntryPrice(e.target.value)}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="high">Plus haut</Label>
          <Input
            id="high"
            inputMode="decimal"
            placeholder="22"
            value={high}
            onChange={(e) => setHigh(e.target.value)}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="low">Plus bas</Label>
          <Input
            id="low"
            inputMode="decimal"
            placeholder="2.2"
            value={low}
            onChange={(e) => setLow(e.target.value)}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="target">Objectif sortie %</Label>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Input
              id="target"
              inputMode="decimal"
              placeholder="100"
              value={targetExitPercent}
              onChange={(e) => setTargetExitPercent(e.target.value)}
              required
              className="sm:max-w-[120px]"
            />
            <div className="flex flex-wrap gap-2">
              {['70', '80', '90', '100'].map((value) => (
                <Button
                  key={value}
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setTargetExitPercent(value)}
                >
                  {value} %
                </Button>
              ))}
            </div>
          </div>
        </div>
        <div className="flex items-end">
          <Button type="submit" className="w-full sm:w-auto">
            Ajouter
          </Button>
        </div>
      </div>
    </form>
  );
}
