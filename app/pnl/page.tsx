'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { CalendarDays, Loader2, Plus, Trash2, X } from 'lucide-react';
import { toPng } from 'html-to-image';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

type DayMode = 'today' | 'custom';
type BackgroundPreset = 'green-glow' | 'blue-gradient' | 'violet-neon';

interface SavedPnlWallet {
  id: string;
  wallet_address: string;
  label: string | null;
  created_at: string;
  updated_at: string;
}

interface SavedPnlBackground {
  id: string;
  name: string | null;
  image_data: string;
  created_at: string;
  updated_at: string;
}

interface PnlMetricResponse {
  totalPnlUsd: number;
  totalPnlPercent: number;
  totalPnlSol: number;
  sells: number;
  tokens: number;
  tokensWithNotional?: number;
  winRate: number;
  volumeUsd: number;
  walletCreatedAt: string | null;
}

interface PnlCardResponse {
  fromMs: number;
  toMs: number;
  selectedWallets: string[];
  metrics: PnlMetricResponse;
}

function getBackgroundStyle(preset: BackgroundPreset): string {
  if (preset === 'blue-gradient') return 'bg-[radial-gradient(circle_at_center,_#2d7dff_0%,_#05203a_55%,_#020617_100%)]';
  if (preset === 'violet-neon') return 'bg-[radial-gradient(circle_at_center,_#a855f7_0%,_#3b0764_50%,_#020617_100%)]';
  return 'bg-[radial-gradient(circle_at_center,_#0eea7b_0%,_#064e3b_45%,_#020617_100%)]';
}

function startOfDayMs(date: Date): number {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function endOfDayMs(date: Date): number {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

function formatSignedUsd(value: number): string {
  const sign = value >= 0 ? '+' : '';
  return `${sign}$${Math.abs(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatSignedPercent(value: number): string {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(1)}%`;
}

function truncateWallet(address: string): string {
  if (address.length <= 14) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export default function PnlPage() {
  const [walletInput, setWalletInput] = useState('');
  const [walletLabelInput, setWalletLabelInput] = useState('');
  const [savedWallets, setSavedWallets] = useState<SavedPnlWallet[]>([]);
  const [walletSearchInput, setWalletSearchInput] = useState('');
  const [isWalletsLoading, setIsWalletsLoading] = useState(false);
  const [wallets, setWallets] = useState<string[]>([]);
  const [dayMode, setDayMode] = useState<DayMode>('today');
  const [selectedDay, setSelectedDay] = useState<Date | undefined>(new Date());
  const [backgroundPreset, setBackgroundPreset] = useState<BackgroundPreset>('green-glow');
  const [uploadedBackgroundUrl, setUploadedBackgroundUrl] = useState<string | null>(null);
  const [savedBackgrounds, setSavedBackgrounds] = useState<SavedPnlBackground[]>([]);
  const [isBackgroundsLoading, setIsBackgroundsLoading] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PnlCardResponse | null>(null);
  const cardPreviewRef = useRef<HTMLDivElement | null>(null);

  const resolvedDay = useMemo(() => (dayMode === 'today' ? new Date() : selectedDay), [dayMode, selectedDay]);
  const createdAtText = result?.metrics.walletCreatedAt
    ? new Date(result.metrics.walletCreatedAt).toLocaleDateString('fr-FR', { dateStyle: 'long' })
    : 'inconnue';

  const dayLabel = useMemo(() => {
    if (!resolvedDay) return 'Choisir un jour';
    return format(resolvedDay, 'EEEE, d MMMM yyyy', { locale: fr });
  }, [resolvedDay]);

  const filteredSavedWallets = useMemo(() => {
    const needle = walletSearchInput.trim().toLowerCase();
    if (needle === '') return savedWallets;
    return savedWallets.filter((wallet) => {
      const address = wallet.wallet_address.toLowerCase();
      const label = wallet.label?.toLowerCase() ?? '';
      return address.includes(needle) || label.includes(needle);
    });
  }, [savedWallets, walletSearchInput]);

  const fetchSavedWallets = async () => {
    setIsWalletsLoading(true);
    try {
      const res = await fetch('/api/pnl/wallets');
      const data = (await res.json()) as { wallets?: SavedPnlWallet[] };
      if (res.ok && Array.isArray(data.wallets)) setSavedWallets(data.wallets);
    } finally {
      setIsWalletsLoading(false);
    }
  };

  useEffect(() => {
    void fetchSavedWallets();
  }, []);

  const fetchSavedBackgrounds = async () => {
    setIsBackgroundsLoading(true);
    try {
      const res = await fetch('/api/pnl/backgrounds');
      const data = (await res.json()) as { backgrounds?: SavedPnlBackground[] };
      if (res.ok && Array.isArray(data.backgrounds)) setSavedBackgrounds(data.backgrounds);
    } finally {
      setIsBackgroundsLoading(false);
    }
  };

  useEffect(() => {
    void fetchSavedBackgrounds();
  }, []);

  const addWalletToSelection = (address: string) => {
    const next = address.trim();
    if (next === '') return;
    if (wallets.some((w) => w.toLowerCase() === next.toLowerCase())) {
      return;
    }
    setWallets((prev) => [...prev, next]);
  };

  const saveWallet = async () => {
    setError(null);
    const next = walletInput.trim();
    if (next === '') return;
    const res = await fetch('/api/pnl/wallets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ walletAddress: next, label: walletLabelInput.trim() }),
    });
    const data = (await res.json()) as { wallets?: SavedPnlWallet[]; error?: string };
    if (!res.ok) {
      setError(data.error ?? `Erreur ${res.status}`);
      return;
    }
    if (Array.isArray(data.wallets)) setSavedWallets(data.wallets);
    addWalletToSelection(next);
    setWalletInput('');
    setWalletLabelInput('');
  };

  const removeSavedWallet = async (address: string) => {
    setError(null);
    const res = await fetch('/api/pnl/wallets', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ walletAddress: address }),
    });
    const data = (await res.json()) as { wallets?: SavedPnlWallet[]; error?: string };
    if (!res.ok) {
      setError(data.error ?? `Erreur ${res.status}`);
      return;
    }
    if (Array.isArray(data.wallets)) setSavedWallets(data.wallets);
    setWallets((prev) => prev.filter((w) => w.toLowerCase() !== address.toLowerCase()));
  };

  const removeWallet = (index: number) => {
    setWallets((prev) => prev.filter((_, i) => i !== index));
  };

  const onUploadBackground = (file: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const imageData = typeof reader.result === 'string' ? reader.result : '';
      if (!imageData.startsWith('data:image/')) {
        setError('Format image invalide.');
        return;
      }
      const url = URL.createObjectURL(file);
      setUploadedBackgroundUrl(url);
      setError(null);
      const res = await fetch('/api/pnl/backgrounds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: file.name, imageData }),
      });
      const data = (await res.json()) as { backgrounds?: SavedPnlBackground[]; error?: string };
      if (!res.ok) {
        setError(data.error ?? `Erreur ${res.status}`);
        return;
      }
      if (Array.isArray(data.backgrounds)) setSavedBackgrounds(data.backgrounds);
    };
    reader.readAsDataURL(file);
  };

  const selectSavedBackground = (background: SavedPnlBackground) => {
    setUploadedBackgroundUrl(background.image_data);
  };

  const removeSavedBackground = async (id: string) => {
    setError(null);
    const res = await fetch('/api/pnl/backgrounds', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    const data = (await res.json()) as { backgrounds?: SavedPnlBackground[]; error?: string };
    if (!res.ok) {
      setError(data.error ?? `Erreur ${res.status}`);
      return;
    }
    if (Array.isArray(data.backgrounds)) setSavedBackgrounds(data.backgrounds);
  };

  const generateCard = async () => {
    setError(null);
    setResult(null);
    if (wallets.length === 0) {
      setError('Ajoute au moins un wallet.');
      return;
    }
    if (!resolvedDay) {
      setError('Choisis un jour.');
      return;
    }
    const fromMs = startOfDayMs(resolvedDay);
    const toMs = endOfDayMs(resolvedDay);
    setIsLoading(true);
    try {
      const res = await fetch('/api/pnl/card', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddresses: wallets, fromMs, toMs }),
      });
      const data = (await res.json()) as PnlCardResponse | { error?: string };
      if (!res.ok) {
        setError((data as { error?: string }).error ?? `Erreur ${res.status}`);
        return;
      }
      setResult(data as PnlCardResponse);
    } catch {
      setError('Erreur réseau lors de la génération de la card.');
    } finally {
      setIsLoading(false);
    }
  };

  const downloadCard = async () => {
    if (!cardPreviewRef.current || !result) return;
    setError(null);
    setIsDownloading(true);
    try {
      const dataUrl = await toPng(cardPreviewRef.current, {
        cacheBust: true,
        pixelRatio: 2,
      });
      const fileDate = new Date(result.fromMs).toISOString().slice(0, 10);
      const link = document.createElement('a');
      link.download = `pnl-card-${fileDate}.png`;
      link.href = dataUrl;
      link.click();
    } catch {
      setError('Impossible de télécharger la card pour le moment.');
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="space-y-6 p-6 sm:p-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">PnL Card</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Sélectionne un ou plusieurs wallets, un jour, puis génère une card PnL exportable.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[340px_minmax(0,1fr)]">
        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="text-base">Mes wallets</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Input
                className="font-mono text-sm"
                value={walletInput}
                onChange={(e) => setWalletInput(e.target.value)}
                placeholder="Adresse wallet…"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void saveWallet();
                  }
                }}
              />
              <Input
                value={walletLabelInput}
                onChange={(e) => setWalletLabelInput(e.target.value)}
                placeholder="Label (optionnel)"
              />
              <Button type="button" className="w-full" onClick={() => void saveWallet()}>
                <Plus className="mr-1 size-4" />
                Ajouter dans mes wallets
              </Button>
            </div>

            <div className="space-y-1">
              <Label htmlFor="wallet-search">Rechercher dans mes wallets</Label>
              <Input
                id="wallet-search"
                value={walletSearchInput}
                onChange={(e) => setWalletSearchInput(e.target.value)}
                placeholder="Coller une adresse ou un label…"
                className="font-mono text-xs"
              />
            </div>

            {isWalletsLoading ? (
              <p className="text-sm text-muted-foreground">Chargement…</p>
            ) : savedWallets.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucun wallet enregistré.</p>
            ) : filteredSavedWallets.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucun wallet trouvé pour cette recherche.</p>
            ) : (
              <ul className="max-h-[460px] space-y-2 overflow-auto">
                {filteredSavedWallets.map((wallet) => (
                  <li key={wallet.id} className="rounded-md border bg-muted/20 p-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        {wallet.label && <p className="truncate text-xs font-medium">{wallet.label}</p>}
                        <p className="truncate font-mono text-xs" title={wallet.wallet_address}>
                          {wallet.wallet_address}
                        </p>
                      </div>
                      <div className="flex gap-1">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 px-2"
                          onClick={() => addWalletToSelection(wallet.wallet_address)}
                        >
                          <Plus className="size-3.5" />
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-muted-foreground hover:text-destructive"
                          onClick={() => void removeSavedWallet(wallet.wallet_address)}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </div>
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      ajouté le {new Date(wallet.created_at).toLocaleDateString('fr-FR', { dateStyle: 'short' })}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Builder PnL</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <p className="text-sm font-medium">Wallets sélectionnés</p>
                {wallets.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Ajoute des wallets depuis “Mes wallets”.</p>
                ) : (
                  <ul className="flex flex-wrap gap-2">
                    {wallets.map((wallet, index) => (
                      <li key={`${wallet}-${index}`} className="inline-flex items-center gap-1 rounded-md border bg-muted/30 px-2 py-1 text-xs font-mono">
                        <span title={wallet}>{truncateWallet(wallet)}</span>
                        <button type="button" onClick={() => removeWallet(index)} className="rounded p-0.5 text-muted-foreground hover:bg-background hover:text-foreground">
                          <X className="size-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="rounded-md border bg-muted/20 p-3 space-y-3">
                <p className="text-sm font-medium">Jour du fetch</p>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant={dayMode === 'today' ? 'default' : 'outline'} onClick={() => setDayMode('today')}>
                    Aujourd&apos;hui
                  </Button>
                  <Button type="button" variant={dayMode === 'custom' ? 'default' : 'outline'} onClick={() => setDayMode('custom')}>
                    Choisir un jour
                  </Button>
                </div>
                {dayMode === 'custom' && (
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button type="button" variant="outline" className={cn('w-[280px] justify-start text-left font-normal', !selectedDay && 'text-muted-foreground')}>
                        <CalendarDays className="mr-2 size-4" />
                        {selectedDay ? format(selectedDay, 'd MMM yyyy', { locale: fr }) : 'Sélectionner une date'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar mode="single" selected={selectedDay} onSelect={setSelectedDay} locale={fr} />
                    </PopoverContent>
                  </Popover>
                )}
              </div>

              <div className="space-y-3">
                <p className="text-sm font-medium">Background</p>
                <div className="flex flex-wrap gap-2">
                  {(['green-glow', 'blue-gradient', 'violet-neon'] as const).map((preset) => (
                    <Button key={preset} type="button" variant={backgroundPreset === preset ? 'default' : 'outline'} onClick={() => setBackgroundPreset(preset)}>
                      {preset}
                    </Button>
                  ))}
                </div>
                <div className="space-y-1">
                  <Label htmlFor="pnl-bg-upload">Upload image perso</Label>
                  <Input id="pnl-bg-upload" type="file" accept="image/*" onChange={(e) => onUploadBackground(e.target.files?.[0] ?? null)} />
                </div>
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">Backgrounds enregistrés</p>
                  {isBackgroundsLoading ? (
                    <p className="text-xs text-muted-foreground">Chargement…</p>
                  ) : savedBackgrounds.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Aucun background sauvegardé.</p>
                  ) : (
                    <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                      {savedBackgrounds.map((bg) => (
                        <div key={bg.id} className="space-y-1">
                          <button
                            type="button"
                            onClick={() => selectSavedBackground(bg)}
                            className={cn(
                              'relative aspect-video w-full overflow-hidden rounded-md border',
                              uploadedBackgroundUrl === bg.image_data ? 'ring-2 ring-primary' : ''
                            )}
                            title={bg.name ?? 'Background'}
                          >
                            <img src={bg.image_data} alt={bg.name ?? 'Background'} className="h-full w-full object-cover" />
                          </button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-6 w-full px-0 text-[10px] text-muted-foreground hover:text-destructive"
                            onClick={() => void removeSavedBackground(bg.id)}
                          >
                            Supprimer
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Button type="button" onClick={() => void generateCard()} disabled={isLoading}>
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 size-4 animate-spin" />
                      Génération…
                    </>
                  ) : (
                    'Générer la PnL card'
                  )}
                </Button>
                {result && (
                  <Button type="button" variant="outline" onClick={() => void downloadCard()} disabled={isDownloading}>
                    {isDownloading ? (
                      <>
                        <Loader2 className="mr-2 size-4 animate-spin" />
                        Téléchargement…
                      </>
                    ) : (
                      'Télécharger PNG'
                    )}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {error && <p className="text-sm text-destructive">{error}</p>}

          {result && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Aperçu de la PnL card</CardTitle>
              </CardHeader>
              <CardContent>
                <div ref={cardPreviewRef} className="mx-auto w-full max-w-[760px]">
                  <div
                    className={cn(
                      'relative overflow-hidden rounded-2xl border border-white/10 text-white shadow-2xl',
                      'aspect-video w-full',
                      !uploadedBackgroundUrl && getBackgroundStyle(backgroundPreset)
                    )}
                    style={uploadedBackgroundUrl ? { backgroundImage: `url(${uploadedBackgroundUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}
                  >
                    <div className="absolute inset-0 bg-black/10" />
                    <div className="absolute inset-y-0 left-0 w-[62%] bg-linear-to-r from-black/90 via-black/55 to-transparent" />

                    <div className="relative z-10 flex h-full items-start p-6 sm:p-7">
                      <div className="max-w-[320px] space-y-2.5">
                        <p className="text-xs font-medium text-white/85">All Wallets ({result.selectedWallets.length})</p>
                        <div>
                          <p className="text-lg font-semibold leading-tight">Today&apos;s PnL</p>
                          <p className="text-xs text-white/80">{dayLabel}</p>
                        </div>
                        <p className={cn('text-5xl font-bold leading-none sm:text-6xl', result.metrics.totalPnlUsd >= 0 ? 'text-emerald-300' : 'text-red-300')}>
                          {formatSignedUsd(result.metrics.totalPnlUsd)}
                        </p>
                        <p className="text-lg font-semibold text-white/90 sm:text-2xl">≈ {result.metrics.totalPnlSol.toFixed(4)} SOL</p>
                        <p className={cn('text-3xl font-bold sm:text-4xl', result.metrics.totalPnlPercent >= 0 ? 'text-emerald-300' : 'text-red-300')}>
                          {formatSignedPercent(result.metrics.totalPnlPercent)}
                        </p>
                        <div className="grid grid-cols-2 gap-x-7 gap-y-1.5 pt-1 text-xs sm:text-sm">
                          <p>Sells</p><p className="text-right font-semibold">{result.metrics.sells}</p>
                          <p>Tokens</p><p className="text-right font-semibold">{result.metrics.tokens}</p>
                          <p>Win Rate</p><p className="text-right font-semibold">{result.metrics.winRate.toFixed(1)}%</p>
                          <p>Volume</p><p className="text-right font-semibold">${result.metrics.volumeUsd.toFixed(2)}</p>
                        </div>
                        {typeof result.metrics.tokensWithNotional === 'number' && result.metrics.tokensWithNotional < result.metrics.tokens && (
                          <p className="text-[10px] text-amber-200/90">
                            Notional trouvé pour {result.metrics.tokensWithNotional}/{result.metrics.tokens} tokens.
                          </p>
                        )}
                        <p className="pt-1 text-[11px] text-white/70">Création wallet: {createdAtText}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

