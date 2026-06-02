'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { endOfDay, startOfDay } from 'date-fns';
import type { DateRange } from 'react-day-picker';
import { Loader2, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import DurationSelector from '@/components/pnl/DurationSelector';
import PnlWalletManager from '@/components/pnl/PnlWalletManager';
import PnlCardCustomizer from '@/components/pnl/PnlCardCustomizer';
import PnlResultCard from '@/components/pnl/PnlResultCard';
import {
  DEFAULT_PNL_CARD_SETTINGS,
  getPnlCardSettings,
  savePnlCardSettings,
} from '@/lib/pnl/card-settings-storage';
import { combineResults } from '@/lib/pnl/combine-results';
import { extractDominantColor, type DominantColor } from '@/lib/pnl/extract-dominant-color';
import type {
  PnlBackground,
  PnlBackgroundMeta,
  PnlCardSettings,
  PnlComputeResponse,
  PnlMethod,
  PnlRangePreset,
  PnlWallet,
} from '@/types/pnl';

const PRESET_MS: Record<Exclude<PnlRangePreset, 'custom'>, number> = {
  '1d': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
};

export default function PnlPage() {
  const [wallets, setWallets] = useState<PnlWallet[]>([]);
  const [backgrounds, setBackgrounds] = useState<PnlBackgroundMeta[]>([]);
  const [settings, setSettings] = useState<PnlCardSettings>(DEFAULT_PNL_CARD_SETTINGS);
  const [preset, setPreset] = useState<PnlRangePreset>('7d');
  const [method, setMethod] = useState<PnlMethod>('gmgn');
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const [results, setResults] = useState<Record<string, PnlComputeResponse>>({});
  const [computing, setComputing] = useState(false);
  const [singleCard, setSingleCard] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Cache des images de fond chargées à la demande (id → data URL).
  const [bgImages, setBgImages] = useState<Record<string, string>>({});
  const bgLoadingRef = useRef<Set<string>>(new Set());

  // Couleur dominante de l'image de fond sélectionnée (pour la carte verticale).
  const [dominantColor, setDominantColor] = useState<DominantColor | null>(null);

  // Chargement initial.
  useEffect(() => {
    setSettings(getPnlCardSettings());
    void (async () => {
      try {
        const [wRes, bRes] = await Promise.all([
          fetch('/api/pnl/wallets'),
          fetch('/api/pnl/backgrounds'),
        ]);
        if (wRes.ok) {
          const data = (await wRes.json()) as { wallets: PnlWallet[] };
          setWallets(data.wallets);
        }
        if (bRes.ok) {
          const data = (await bRes.json()) as { backgrounds: PnlBackgroundMeta[] };
          setBackgrounds(data.backgrounds);
        }
      } catch {
        // silencieux : l'UI reste utilisable
      }
    })();
  }, []);

  const updateSettings = useCallback((next: PnlCardSettings) => {
    setSettings(next);
    savePnlCardSettings(next);
  }, []);

  // Charge l'image d'un fond (par id) dans le cache si pas déjà en cours.
  const loadBackgroundImage = useCallback((id: string) => {
    if (bgLoadingRef.current.has(id)) return;
    bgLoadingRef.current.add(id);
    void (async () => {
      try {
        const res = await fetch(`/api/pnl/backgrounds/${id}`);
        if (res.ok) {
          const data = (await res.json()) as { background: PnlBackground };
          setBgImages((prev) => ({ ...prev, [id]: data.background.imageData }));
        }
      } finally {
        bgLoadingRef.current.delete(id);
      }
    })();
  }, []);

  // Insère une image déjà connue (ex. juste uploadée) sans refetch.
  const cacheBackgroundImage = useCallback((id: string, imageData: string) => {
    setBgImages((prev) => (prev[id] ? prev : { ...prev, [id]: imageData }));
  }, []);

  // Charge l'image du fond sélectionné si pas encore en cache.
  const selectedBgId = settings.selectedBackgroundId;
  useEffect(() => {
    if (selectedBgId && !bgImages[selectedBgId]) loadBackgroundImage(selectedBgId);
  }, [selectedBgId, bgImages, loadBackgroundImage]);

  const resolveBounds = useCallback((): { fromMs: number; toMs: number } | null => {
    const toMs = Date.now();
    if (preset === 'custom') {
      if (!dateRange?.from || !dateRange?.to) return null;
      const fromMs = startOfDay(dateRange.from).getTime();
      const endMs = endOfDay(dateRange.to).getTime();
      if (fromMs > endMs) return null;
      return { fromMs, toMs: Math.min(endMs, toMs) };
    }
    return { fromMs: toMs - PRESET_MS[preset], toMs };
  }, [preset, dateRange]);

  const handleCompute = useCallback(async () => {
    const bounds = resolveBounds();
    if (!bounds) {
      setError('Sélectionne une plage de dates valide.');
      return;
    }
    if (wallets.length === 0) {
      setError('Ajoute au moins un wallet.');
      return;
    }
    setError(null);
    setComputing(true);
    setResults({});
    try {
      const settled = await Promise.allSettled(
        wallets.map(async (w) => {
          const res = await fetch('/api/pnl/compute', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              walletAddress: w.walletAddress,
              fromMs: bounds.fromMs,
              toMs: bounds.toMs,
              preset,
              method,
            }),
          });
          if (!res.ok) throw new Error(`compute ${w.walletAddress}`);
          return (await res.json()) as PnlComputeResponse;
        })
      );
      const next: Record<string, PnlComputeResponse> = {};
      settled.forEach((s) => {
        if (s.status === 'fulfilled') next[s.value.walletAddress] = s.value;
      });
      setResults(next);
      if (Object.keys(next).length === 0) {
        setError('Aucun résultat : vérifie les wallets ou réessaie.');
      }
    } finally {
      setComputing(false);
    }
  }, [resolveBounds, wallets, preset, method]);

  const selectedBgImage = selectedBgId ? bgImages[selectedBgId] ?? null : null;

  // Extrait la couleur dominante quand l'image de fond change (carte verticale).
  useEffect(() => {
    if (!selectedBgImage) {
      setDominantColor(null);
      return;
    }
    let cancelled = false;
    void extractDominantColor(selectedBgImage).then((dc) => {
      if (!cancelled) setDominantColor(dc);
    });
    return () => {
      cancelled = true;
    };
  }, [selectedBgImage]);

  const walletLabelByAddress = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const w of wallets) map.set(w.walletAddress, w.label);
    return map;
  }, [wallets]);

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-2">
        <TrendingUp className="size-6 text-primary" />
        <h1 className="text-2xl font-bold">PNL</h1>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Wallets</CardTitle>
          </CardHeader>
          <CardContent>
            <PnlWalletManager wallets={wallets} onWalletsChange={setWallets} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Période</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <DurationSelector
              preset={preset}
              onPresetChange={setPreset}
              dateRange={dateRange}
              onDateRangeChange={setDateRange}
            />
            <div className="space-y-1.5">
              <label htmlFor="pnl-method" className="text-sm font-medium">
                Méthode de calcul
              </label>
              <select
                id="pnl-method"
                value={method}
                onChange={(e) => setMethod(e.target.value as PnlMethod)}
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm"
              >
                <option value="gmgn">GMGN (détail par token, winrate)</option>
                <option value="balance_delta">Delta de balance SOL (Helius, on-chain)</option>
              </select>
              {method === 'balance_delta' && (
                <p className="text-[11px] text-muted-foreground">
                  PNL = variation du solde SOL sur la période (frais inclus). Ne valorise pas les
                  tokens encore détenus.
                </p>
              )}
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                className="size-4 accent-primary"
                checked={singleCard}
                onChange={(e) => setSingleCard(e.target.checked)}
              />
              Générer une seule carte (combinée)
            </label>
            <Button type="button" onClick={() => void handleCompute()} disabled={computing}>
              {computing ? <Loader2 className="size-4 animate-spin" /> : <TrendingUp className="size-4" />}
              Calculer le PNL
            </Button>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Personnalisation de la card</CardTitle>
        </CardHeader>
        <CardContent>
          <PnlCardCustomizer
            settings={settings}
            onSettingsChange={updateSettings}
            backgrounds={backgrounds}
            onBackgroundsChange={setBackgrounds}
            bgImages={bgImages}
            onRequestBackgroundImage={loadBackgroundImage}
            onCacheBackgroundImage={cacheBackgroundImage}
          />
        </CardContent>
      </Card>

      {Object.keys(results).length > 0 &&
        (singleCard ? (
          (() => {
            const computed = wallets
              .map((w) => results[w.walletAddress])
              .filter((r): r is PnlComputeResponse => Boolean(r));
            const combined = combineResults(computed);
            if (!combined) return null;
            return (
              <div className="md:max-w-[600px]">
                <PnlResultCard
                  data={combined}
                  settings={settings}
                  backgroundImageData={selectedBgImage}
                  walletLabel={`Total · ${computed.length} wallet${computed.length > 1 ? 's' : ''}`}
                  dominantColor={dominantColor}
                />
              </div>
            );
          })()
        ) : (
          <div className="grid gap-6 md:grid-cols-2">
            {wallets
              .filter((w) => results[w.walletAddress])
              .map((w) => (
                <PnlResultCard
                  key={w.id}
                  data={results[w.walletAddress]}
                  settings={settings}
                  backgroundImageData={selectedBgImage}
                  walletLabel={walletLabelByAddress.get(w.walletAddress) ?? null}
                  dominantColor={dominantColor}
                />
              ))}
          </div>
        ))}
    </div>
  );
}
