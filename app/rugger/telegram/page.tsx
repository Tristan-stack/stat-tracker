'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import Link from 'next/link';
import { ArrowLeft, Loader2, Star, Trophy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DatePicker } from '@/components/ui/date-picker';
import RuggerTelegramLeaderboard, { type TelegramLeaderSortBy } from '@/components/rugger/RuggerTelegramLeaderboard';
import type { TelegramChannelRow, TelegramLeaderboardRow } from '@/types/telegram';
import { formatMintShort } from '@/lib/token-display';
import { iso2ToFlagEmoji, MTPROTO_COUNTRY_DIALS } from '@/lib/rugger-telegram/mtproto-country-dials';
import { composeE164FromIsoAndNational } from '@/lib/rugger-telegram/mtproto-phone';
import { cn } from '@/lib/utils';
import { readNdjsonStream } from '@/lib/http/stream';
import { apiGet, apiPost, apiDelete, ApiError } from '@/lib/api-client';

function errMsg(e: unknown, fallback: string): string {
  return e instanceof ApiError ? e.message : fallback;
}

type ChannelDto = Omit<TelegramChannelRow, 'created_at'> & { createdAt: string };

type TelegramFavoriteRow = {
  mint: string;
  token_name: string | null;
};

function mapChannel(row: TelegramChannelRow): ChannelDto {
  return {
    id: row.id,
    username: row.username,
    label: row.label,
    createdAt: row.created_at,
  };
}

function parseHHmm(hhmm: string): { h: number; m: number } | null {
  const parts = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!parts) return null;
  const h = Number(parts[1]);
  const mi = Number(parts[2]);
  if (!Number.isFinite(h) || !Number.isFinite(mi) || h < 0 || h > 23 || mi < 0 || mi > 59) return null;
  return { h, m: mi };
}

type TelegramScrapeStreamProgress = {
  fetched: number;
  persisted: number;
  parsedRegex: number;
  parsedGemini: number;
  failed: number;
  maxMessages: number;
  /** 0–100 : borne supérieure = budget messages Telegram (limite envoyée après `start`). */
  pct: number;
};

/** Pourcentage d’« avancement » : budget télégram jusqu’à TELEGRAM_SCRAPE_MAX_MESSAGES, puis 100 % à la fin. */
function scrapeStreamPct(fetched: number, maxMessages: number, finished: boolean): number {
  if (finished) return 100;
  if (!Number.isFinite(maxMessages) || maxMessages <= 0 || !Number.isFinite(fetched) || fetched <= 0) return 1;
  return Math.min(99, Math.ceil((fetched / maxMessages) * 100));
}

/** Combine jour calendaire du DatePicker et heure locale (début = 0 ms de la minute, fin inclusive = 999 ms si endOfMinute). */
function composeLocalDateWithClock(calendarDay: Date, hhmm: string, endOfMinute: boolean): Date | null {
  const t = parseHHmm(hhmm);
  if (!t) return null;
  return new Date(
    calendarDay.getFullYear(),
    calendarDay.getMonth(),
    calendarDay.getDate(),
    t.h,
    t.m,
    endOfMinute ? 59 : 0,
    endOfMinute ? 999 : 0
  );
}

/**
 * Une ou plusieurs journées — même canal, bornes inclusives côté `to` jusqu’à la seconde 59 ou 999 ms.
 */
function buildRangeMulti(
  startDay: Date,
  startHHmm: string,
  endDay: Date,
  endHHmm: string
): { fromIso: string; toIso: string } | { error: string } {
  const from = composeLocalDateWithClock(startDay, startHHmm, false);
  const to = composeLocalDateWithClock(endDay, endHHmm, true);
  if (!from || !to) {
    const fromOk = parseHHmm(startHHmm);
    const toOk = parseHHmm(endHHmm);
    if (!fromOk || !toOk) return { error: 'Heures au format HH:mm (24 h).' };
    return { error: 'Heures invalides (minute 00–59, heure 00–23).' };
  }
  if (from.getTime() > to.getTime())
    return { error: 'La date/heure de début doit être avant la fin.' };
  return { fromIso: from.toISOString(), toIso: to.toISOString() };
}

export default function RuggerTelegramPage() {
  const [channels, setChannels] = useState<ChannelDto[]>([]);
  const [isLoadingChannels, setIsLoadingChannels] = useState(true);
  const [newChannelUsername, setNewChannelUsername] = useState('https://t.me/rugpilotprofits');
  const [newChannelLabel, setNewChannelLabel] = useState('RugPilot profits');
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);

  const [rangeStartDay, setRangeStartDay] = useState<Date | undefined>(() => new Date());
  const [rangeEndDay, setRangeEndDay] = useState<Date | undefined>(() => new Date());
  const [startTime, setStartTime] = useState('00:00');
  const [endTime, setEndTime] = useState('23:59');

  const [sortBy, setSortBy] = useState<TelegramLeaderSortBy>('profitSol');
  const [dir, setDir] = useState<'asc' | 'desc'>('desc');

  /** Filtre client après chargement : POST `/mayhem-resolve` (cache GMGN), sans refetch SQL. */
  const [excludePumpMayhem, setExcludePumpMayhem] = useState(false);

  const [rows, setRows] = useState<TelegramLeaderboardRow[]>([]);
  const [isLoadingBoard, setIsLoadingBoard] = useState(false);
  const [boardError, setBoardError] = useState<string | null>(null);
  const [boardMayhemHint, setBoardMayhemHint] = useState<string | null>(null);

  const [mayhemByMint, setMayhemByMint] = useState<Record<string, boolean>>({});
  const [mayhemSkippedNoApiKey, setMayhemSkippedNoApiKey] = useState(false);
  const [mayhemResolveCap, setMayhemResolveCap] = useState(100);
  const [isMayhemResolving, setIsMayhemResolving] = useState(false);

  const [isScraping, setIsScraping] = useState(false);
  const [scrapeProgress, setScrapeProgress] = useState<TelegramScrapeStreamProgress | null>(null);
  const [scrapeSummary, setScrapeSummary] = useState<string | null>(null);
  const [scrapeError, setScrapeError] = useState<string | null>(null);

  /** Favoris par canal Telegram (persistés serveur Postgres). */
  const [telegramFavorites, setTelegramFavorites] = useState<TelegramFavoriteRow[]>([]);
  const [isFavoritesLoading, setIsFavoritesLoading] = useState(false);
  const [favoriteCopiedMint, setFavoriteCopiedMint] = useState<string | null>(null);

  const favoriteMintSet = useMemo(() => new Set(telegramFavorites.map((f) => f.mint)), [telegramFavorites]);

  const reloadTelegramFavorites = useCallback(async () => {
    if (!selectedChannelId) {
      setTelegramFavorites([]);
      return;
    }
    setIsFavoritesLoading(true);
    try {
      const data = await apiGet<{ favorites?: Array<{ mint: string; tokenName: string | null }> }>(
        `/api/rugger-telegram/favorites?channelId=${encodeURIComponent(selectedChannelId)}`
      );
      setTelegramFavorites(
        (data.favorites ?? []).map((f) => ({ mint: f.mint.trim(), token_name: f.tokenName }))
      );
    } catch {
      setTelegramFavorites([]);
    } finally {
      setIsFavoritesLoading(false);
    }
  }, [selectedChannelId]);

  const loadChannels = useCallback(async () => {
    setIsLoadingChannels(true);
    try {
      const data = await apiGet<{ channels: TelegramChannelRow[] }>('/api/rugger-telegram/channels');
      const mapped = data.channels.map(mapChannel);
      setChannels(mapped);
      setSelectedChannelId((current) =>
        current && mapped.some((c) => c.id === current) ? current : mapped[0]?.id ?? null
      );
    } catch {
      /* ignore */
    } finally {
      setIsLoadingChannels(false);
    }
  }, []);

  const [mtprotoConnected, setMtprotoConnected] = useState<boolean | null>(null);
  const [mtprotoPhoneHint, setMtprotoPhoneHint] = useState<string | undefined>();
  const [mtprotoCountryIso, setMtprotoCountryIso] = useState('FR');
  const [mtprotoLoginNational, setMtprotoLoginNational] = useState('');
  const [mtprotoLoginCode, setMtprotoLoginCode] = useState('');
  const [mtprotoLoginPassword, setMtprotoLoginPassword] = useState('');
  const [mtprotoLoginPhase, setMtprotoLoginPhase] = useState<'phone' | 'code'>('phone');
  const [mtprotoLoginBusy, setMtprotoLoginBusy] = useState(false);
  const [mtprotoLoginError, setMtprotoLoginError] = useState<string | null>(null);

  const refreshMtprotoStatus = useCallback(async () => {
    try {
      const data = await apiGet<{ connected?: boolean; phoneHint?: string }>('/api/rugger-telegram/mtproto/status');
      setMtprotoConnected(Boolean(data.connected));
      setMtprotoPhoneHint(typeof data.phoneHint === 'string' ? data.phoneHint : undefined);
    } catch {
      setMtprotoConnected(false);
    }
  }, []);

  useEffect(() => {
    void refreshMtprotoStatus();
  }, [refreshMtprotoStatus]);

  const mtprotoComposedE164 = useMemo(
    () => composeE164FromIsoAndNational(mtprotoCountryIso, mtprotoLoginNational),
    [mtprotoCountryIso, mtprotoLoginNational]
  );

  useEffect(() => {
    if (mtprotoConnected === true) void loadChannels();
  }, [mtprotoConnected, loadChannels]);

  const handleMtprotoDisconnect = useCallback(async () => {
    setMtprotoLoginError(null);
    try {
      await apiDelete('/api/rugger-telegram/mtproto/session');
      setMtprotoLoginPhase('phone');
      setMtprotoCountryIso('FR');
      setMtprotoLoginNational('');
      setMtprotoLoginCode('');
      setMtprotoLoginPassword('');
      setChannels([]);
      setSelectedChannelId(null);
      await refreshMtprotoStatus();
    } catch {
      setMtprotoLoginError('Impossible de supprimer la session Telegram pour le moment.');
    }
  }, [refreshMtprotoStatus]);

  const handleMtprotoSendCode = useCallback(async () => {
    setMtprotoLoginError(null);
    setMtprotoLoginBusy(true);
    try {
      const phoneE164 = mtprotoComposedE164;
      if (!phoneE164) {
        setMtprotoLoginError('Choisis un pays et un numéro valide (tu peux aussi coller un +33… complet dans le second champ).');
        return;
      }
      await apiPost('/api/rugger-telegram/mtproto/send-code', { phone: phoneE164 });
      setMtprotoLoginPhase('code');
      setMtprotoLoginCode('');
      setMtprotoLoginPassword('');
    } catch (e) {
      setMtprotoLoginError(errMsg(e, 'Impossible d’envoyer le code Telegram.'));
    } finally {
      setMtprotoLoginBusy(false);
    }
  }, [mtprotoComposedE164]);

  const handleMtprotoComplete = useCallback(async () => {
    setMtprotoLoginError(null);
    setMtprotoLoginBusy(true);
    try {
      await apiPost('/api/rugger-telegram/mtproto/complete', {
        code: mtprotoLoginCode.trim(),
        password: mtprotoLoginPassword.trim() || undefined,
      });
      await refreshMtprotoStatus();
      setMtprotoLoginPhase('phone');
      setMtprotoCountryIso('FR');
      setMtprotoLoginNational('');
      setMtprotoLoginCode('');
      setMtprotoLoginPassword('');
    } catch (e) {
      setMtprotoLoginError(errMsg(e, 'Connexion Telegram refusée.'));
    } finally {
      setMtprotoLoginBusy(false);
    }
  }, [mtprotoLoginCode, mtprotoLoginPassword, refreshMtprotoStatus]);

  useEffect(() => {
    void reloadTelegramFavorites();
  }, [reloadTelegramFavorites]);

  const range = useMemo(() => {
    if (!rangeStartDay || !rangeEndDay) return null;
    return buildRangeMulti(rangeStartDay, startTime, rangeEndDay, endTime);
  }, [rangeStartDay, rangeEndDay, startTime, endTime]);

  const rangeLabel =
    range && !('error' in range)
      ? `${format(new Date(range.fromIso), 'd MMM yyyy HH:mm', { locale: fr })} → ${format(new Date(range.toIso), 'd MMM yyyy HH:mm', { locale: fr })}`
      : null;

  const displayRows = useMemo(() => {
    if (!excludePumpMayhem) return rows;
    if (mayhemSkippedNoApiKey) return rows;
    const head = rows.slice(0, mayhemResolveCap);
    const tail = rows.slice(mayhemResolveCap);
    const keptHead = head.filter((r) => mayhemByMint[r.token_mint] !== true);
    return [...keptHead, ...tail];
  }, [
    excludePumpMayhem,
    mayhemSkippedNoApiKey,
    mayhemByMint,
    mayhemResolveCap,
    rows,
  ]);

  const loadLeaderboard = useCallback(async () => {
    if (!selectedChannelId || !range || 'error' in range) {
      setRows([]);
      return;
    }
    setIsLoadingBoard(true);
    setBoardError(null);
    setBoardMayhemHint(null);
    try {
      const params = new URLSearchParams({
        channelId: selectedChannelId,
        from: range.fromIso,
        to: range.toIso,
        sortBy,
        dir,
      });
      const data = await apiGet<{ rows: TelegramLeaderboardRow[] }>(
        `/api/rugger-telegram/leaderboard?${params.toString()}`
      );
      setRows(data.rows);
      setMayhemByMint({});
      setMayhemSkippedNoApiKey(false);
      setBoardMayhemHint(null);
    } catch (e) {
      setBoardError(errMsg(e, 'Erreur réseau'));
      setRows([]);
    } finally {
      setIsLoadingBoard(false);
    }
  }, [dir, range, selectedChannelId, sortBy]);

  useEffect(() => {
    void loadLeaderboard();
  }, [loadLeaderboard]);

  useEffect(() => {
    if (!excludePumpMayhem) {
      setIsMayhemResolving(false);
      return;
    }
    if (isLoadingBoard || rows.length === 0) return;

    let cancelled = false;
    setIsMayhemResolving(true);
    setBoardMayhemHint(null);

    void (async () => {
      try {
        const mints = rows.map((r) => r.token_mint);
        const payload = await apiPost<{
          skippedNoApiKey?: boolean;
          checked?: number;
          excluded?: number;
          capped?: boolean;
          cap?: number;
          mayhemCacheHits?: number;
          mayhemGmgnCalls?: number;
          mayhemByMint?: Record<string, boolean>;
        }>('/api/rugger-telegram/mayhem-resolve', { mints });

        if (cancelled) return;
        setMayhemByMint(payload.mayhemByMint ?? {});
        setMayhemResolveCap(typeof payload.cap === 'number' ? payload.cap : 100);
        const skipped = payload.skippedNoApiKey === true;
        setMayhemSkippedNoApiKey(skipped);

        if (skipped) {
          setBoardMayhemHint('Filtre Mayhem ignoré : GMGN_API_KEY n’est pas configurée sur le serveur.');
        } else {
          const parts: string[] = [];
          const checked = payload.checked ?? 0;
          const excluded = payload.excluded ?? 0;
          const ch = payload.mayhemCacheHits ?? 0;
          const gm = payload.mayhemGmgnCalls ?? 0;
          parts.push(
            `${excluded} token(s) Pump Mayhem exclus sur ${checked} mint(s) résolu(s) — cache ${ch.toLocaleString('fr-FR')}, appels GMGN ${gm.toLocaleString('fr-FR')}.`
          );
          if (payload.capped === true && typeof payload.cap === 'number') {
            parts.push(
              `Les entrées au-delà du rang ${payload.cap} n’ont pas été vérifiées (variable TELEGRAM_LEADERBOARD_MAYHEM_MAX_MINTS).`
            );
          }
          setBoardMayhemHint(parts.join(' '));
        }
      } catch (e) {
        if (!cancelled) {
          const status = e instanceof ApiError ? e.status : 0;
          setBoardMayhemHint(
            status ? `Filtre Mayhem : erreur (${status}).` : 'Filtre Mayhem : erreur réseau ou réponse invalide.'
          );
        }
      } finally {
        if (!cancelled) setIsMayhemResolving(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [excludePumpMayhem, isLoadingBoard, rows]);

  const toggleFavorite = useCallback(
    async (row: TelegramLeaderboardRow) => {
      const mint = row.token_mint.trim();
      if (!selectedChannelId || mint === '') return;
      const tn = row.token_name?.trim();
      const already = favoriteMintSet.has(mint);
      try {
        if (already) {
          const params = new URLSearchParams({ channelId: selectedChannelId, mint });
          await apiDelete(`/api/rugger-telegram/favorites?${params.toString()}`);
        } else {
          await apiPost('/api/rugger-telegram/favorites', {
            channelId: selectedChannelId,
            tokenMint: mint,
            tokenName: tn && tn !== '' ? tn : null,
          });
        }
        await reloadTelegramFavorites();
      } catch {
        // réseau
      }
    },
    [favoriteMintSet, reloadTelegramFavorites, selectedChannelId]
  );

  const removeFavoriteMint = useCallback(
    async (mintRaw: string) => {
      const mint = mintRaw.trim();
      if (!selectedChannelId || mint === '') return;
      try {
        const params = new URLSearchParams({ channelId: selectedChannelId, mint });
        await apiDelete(`/api/rugger-telegram/favorites?${params.toString()}`);
        await reloadTelegramFavorites();
      } catch {
        //
      }
    },
    [reloadTelegramFavorites, selectedChannelId]
  );

  const handleFavoriteCopyMint = useCallback(async (mint: string) => {
    await navigator.clipboard.writeText(mint);
    setFavoriteCopiedMint(mint);
    setTimeout(() => setFavoriteCopiedMint((prev) => (prev === mint ? null : prev)), 1500);
  }, []);

  const handleSortChange = useCallback(
    (key: TelegramLeaderSortBy) => {
      setSortBy((prev) => {
        if (prev === key) {
          setDir((d) => (d === 'desc' ? 'asc' : 'desc'));
          return prev;
        }
        setDir('desc');
        return key;
      });
    },
    []
  );

  const handleAddChannel = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      try {
        await apiPost('/api/rugger-telegram/channels', {
          username: newChannelUsername,
          label: newChannelLabel.trim() || null,
        });
        setNewChannelUsername('');
        setNewChannelLabel('');
        await loadChannels();
      } catch {
        /* username invalide / canal déjà enregistré */
      }
    },
    [loadChannels, newChannelLabel, newChannelUsername]
  );

  const handleDeleteChannel = useCallback(
    async (id: string) => {
      if (!window.confirm('Supprimer ce canal et ses messages stockés ?')) return;
      try {
        await apiDelete(`/api/rugger-telegram/channels/${id}`);
        if (selectedChannelId === id) setSelectedChannelId(null);
        await loadChannels();
      } catch {
        /* ignore */
      }
    },
    [loadChannels, selectedChannelId]
  );

  const handleScrape = useCallback(async () => {
    setScrapeError(null);
    setScrapeSummary(null);
    setScrapeProgress(null);
    if (!selectedChannelId) {
      setScrapeError('Choisis un canal.');
      return;
    }
    if (!range || 'error' in range) {
      setScrapeError(range?.error ?? 'Date ou heures invalides');
      return;
    }
    setIsScraping(true);
    try {
      const response = await fetch('/api/rugger-telegram/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/x-ndjson' },
        body: JSON.stringify({
          channelId: selectedChannelId,
          from: range.fromIso,
          to: range.toIso,
          stream: true,
        }),
      });

      const contentType = response.headers.get('content-type') ?? '';

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
        setScrapeError(typeof payload?.error === 'string' ? payload.error : `Erreur ${response.status}`);
        return;
      }

      if (!response.body || !contentType.includes('ndjson')) {
        setScrapeError('Flux de progression scrape indisponible (NDJSON attendu).');
        return;
      }

      const numLine = (v: unknown): number => {
        const x = Number(v);
        return Number.isFinite(x) ? x : 0;
      };

      let lastMaxMessages = 25000;
      const scrapeDonePayload = { current: null as Record<string, unknown> | null };
      let streamFatal: string | null = null;

      const applyTick = (
        fetched: number,
        persisted: number,
        parsedRegex: number,
        parsedGemini: number,
        failed: number,
        maxMessagesConfigured: number,
        finished: boolean
      ) => {
        lastMaxMessages = maxMessagesConfigured;
        setScrapeProgress({
          fetched,
          persisted,
          parsedRegex,
          parsedGemini,
          failed,
          maxMessages: maxMessagesConfigured,
          pct: scrapeStreamPct(fetched, maxMessagesConfigured, finished),
        });
      };

      const handleEvent = (ev: Record<string, unknown>) => {
        const t = typeof ev.type === 'string' ? ev.type : '';
        if (t === 'start' && typeof ev.maxMessages === 'number') {
          lastMaxMessages = ev.maxMessages;
          applyTick(0, 0, 0, 0, 0, lastMaxMessages, false);
          return;
        }
        if (t === 'tick') {
          applyTick(
            numLine(ev.fetched),
            numLine(ev.persisted),
            numLine(ev.parsedRegex),
            numLine(ev.parsedGemini),
            numLine(ev.failed),
            numLine(ev.maxMessagesConfigured) || lastMaxMessages,
            false
          );
          return;
        }
        if (t === 'done' && ev.ok === true) {
          scrapeDonePayload.current = ev;
          const max = numLine(ev.maxMessagesConfigured) || lastMaxMessages;
          applyTick(
            numLine(ev.fetched),
            numLine(ev.persisted),
            numLine(ev.parsedRegex),
            numLine(ev.parsedGemini),
            numLine(ev.failed),
            max,
            true
          );
          return;
        }
        if (t === 'error') {
          const msg = typeof ev.error === 'string' ? ev.error : 'telegram_scrape_failed';
          const detail = typeof ev.detail === 'string' ? ` (${ev.detail})` : '';
          streamFatal = `${msg}${detail}`;
        }
      };

      await readNdjsonStream(response.body, (raw) => handleEvent(raw as Record<string, unknown>));

      if (streamFatal !== null) {
        setScrapeError(streamFatal);
        return;
      }

      const summaryPayload = scrapeDonePayload.current;
      if (!summaryPayload) {
        setScrapeError('Scrape terminé sans résumé.');
        return;
      }

      const fetched = typeof summaryPayload.fetched === 'number' ? summaryPayload.fetched : null;
      const parsedRegex = typeof summaryPayload.parsedRegex === 'number' ? summaryPayload.parsedRegex : null;
      const parsedGemini = typeof summaryPayload.parsedGemini === 'number' ? summaryPayload.parsedGemini : null;
      const failed = typeof summaryPayload.failed === 'number' ? summaryPayload.failed : null;
      const persisted = typeof summaryPayload.persisted === 'number' ? summaryPayload.persisted : null;
      const summaryLines: string[] = [];
      summaryLines.push(
        fetched != null
          ? `${fetched} messages parcourus · regex ${parsedRegex ?? '—'} · Gemini ${parsedGemini ?? '—'} · échecs ${failed ?? '—'} · enregistrés ${persisted ?? '—'}`
          : 'Scrape terminé'
      );
      const warn = typeof summaryPayload.warning === 'string' ? summaryPayload.warning : '';
      if (warn) summaryLines.push(`Attention : ${warn}`);
      setScrapeSummary(summaryLines.join('\n'));
      await loadLeaderboard();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setScrapeError(message || 'Erreur réseau pendant le scrape.');
    } finally {
      setIsScraping(false);
      setScrapeProgress(null);
    }
  }, [loadLeaderboard, range, selectedChannelId]);

  return (
    <div className="min-w-0 space-y-8 overflow-x-hidden p-6 sm:p-8">
      <header className="space-y-3">
        <Link href="/rugger" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" />
          Retour aux ruggers
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 flex-wrap items-start gap-3">
            <Trophy className="mt-1 size-8 shrink-0 text-primary" aria-hidden />
            <div className="min-w-0 space-y-1">
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Leaderboard Telegram PnL</h1>
              <p className="max-w-2xl text-muted-foreground">
                Récupère les messages PnL d’un canal Telegram sur la période choisie, puis affiche un classement des tokens
                par profit. Connexion avec <span className="font-medium text-foreground">ton Telegram</span> : seuls les canaux
                auxquels tu as déjà accès dans l’app Telegram peuvent être lus.
              </p>
            </div>
          </div>
          {mtprotoConnected === true ? (
            <div className="flex shrink-0 flex-col items-stretch gap-2 sm:items-end">
              <p className="max-w-[16rem] text-right text-xs text-muted-foreground">
                {mtprotoPhoneHint ? `Compte Telegram : ${mtprotoPhoneHint}` : 'Telegram relié'}
              </p>
              <Button variant="outline" size="sm" type="button" onClick={() => void handleMtprotoDisconnect()}>
                Déconnexion Telegram
              </Button>
              {mtprotoLoginError ? <p className="text-right text-xs text-destructive">{mtprotoLoginError}</p> : null}
            </div>
          ) : null}
        </div>
      </header>

      {mtprotoConnected === null ? (
        <div className="flex items-center gap-3 rounded-xl border bg-card p-8 text-muted-foreground">
          <Loader2 className="size-6 shrink-0 animate-spin" aria-hidden />
          <p className="text-sm">Vérification du lien Telegram…</p>
        </div>
      ) : !mtprotoConnected ? (
        <section className="mx-auto max-w-lg space-y-5 rounded-xl border bg-card p-6 shadow-sm sm:p-8">
          <div className="space-y-2">
            <h2 className="text-lg font-semibold tracking-tight">Connecter Telegram</h2>
            <p className="text-sm text-muted-foreground">
              Choisis ton pays (indicatif + drapeau), puis ton numéro sans l’indicatif — ou colle un numéro complet avec{' '}
              <code className="rounded bg-muted px-1">+</code> dans le second champ. Tu recevras un code Telegram associé
              uniquement à ton compte StatTracker. Si ta session est protégée par une authentification à deux facteurs,
              renseigne le mot de passe 2FA avec le même code à l’étape suivante.
            </p>
          </div>
          {mtprotoLoginError ? (
            <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {mtprotoLoginError}
            </p>
          ) : null}
          {mtprotoLoginPhase === 'phone' ? (
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <div className="space-y-1 sm:w-[min(100%,280px)] sm:shrink-0">
                  <Label htmlFor="mtproto-country">Pays</Label>
                  <select
                    id="mtproto-country"
                    className={cn(
                      'h-10 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs'
                    )}
                    value={mtprotoCountryIso}
                    onChange={(event) => setMtprotoCountryIso(event.target.value)}
                  >
                    {MTPROTO_COUNTRY_DIALS.map((c) => (
                      <option key={c.iso2} value={c.iso2}>
                        {iso2ToFlagEmoji(c.iso2)} {c.nameFr} ({c.dial})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="min-w-0 flex-1 space-y-1">
                  <Label htmlFor="mtproto-national">Numéro</Label>
                  <Input
                    id="mtproto-national"
                    inputMode="tel"
                    autoComplete="tel-national"
                    placeholder={
                      mtprotoCountryIso === 'FR'
                        ? '6 12 34 56 78 ou 06…'
                        : 'Sans indicatif pays'
                    }
                    value={mtprotoLoginNational}
                    onChange={(event) => setMtprotoLoginNational(event.target.value)}
                  />
                  {mtprotoComposedE164 ? (
                    <p className="text-xs tabular-nums text-muted-foreground">
                      <span className="mr-1" aria-hidden>
                        {iso2ToFlagEmoji(mtprotoCountryIso)}
                      </span>
                      Envoyé à Telegram :{' '}
                      <span className="font-medium text-foreground">{mtprotoComposedE164}</span>
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Tu peux coller un numéro international complet commençant par <code className="rounded bg-muted px-1">+</code>{' '}
                      dans le champ ci-dessus.
                    </p>
                  )}
                </div>
              </div>
              <Button
                type="button"
                disabled={mtprotoLoginBusy || !mtprotoComposedE164}
                onClick={() => void handleMtprotoSendCode()}
              >
                {mtprotoLoginBusy ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" aria-hidden /> Envoi…
                  </>
                ) : (
                  'Envoyer le code Telegram'
                )}
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="space-y-1">
                <Label htmlFor="mtproto-code">Code reçu</Label>
                <Input
                  id="mtproto-code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="12345"
                  value={mtprotoLoginCode}
                  onChange={(event) => setMtprotoLoginCode(event.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="mtproto-twofa">Mot de passe 2FA (si activé)</Label>
                <Input
                  id="mtproto-twofa"
                  type="password"
                  autoComplete="current-password"
                  placeholder="Mot de passe cloud Telegram"
                  value={mtprotoLoginPassword}
                  onChange={(event) => setMtprotoLoginPassword(event.target.value)}
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  disabled={mtprotoLoginBusy || !mtprotoLoginCode.trim()}
                  onClick={() => void handleMtprotoComplete()}
                >
                  {mtprotoLoginBusy ? (
                    <>
                      <Loader2 className="mr-2 size-4 animate-spin" aria-hidden /> Connexion…
                    </>
                  ) : (
                    'Valider et ouvrir le leaderboard'
                  )}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={mtprotoLoginBusy}
                  onClick={() => {
                    setMtprotoLoginPhase('phone');
                    setMtprotoLoginCode('');
                    setMtprotoLoginPassword('');
                    setMtprotoLoginError(null);
                  }}
                >
                  Modifier le numéro
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Pour un nouveau code, reviens modifier le numéro puis renvoie (max.&nbsp;3 envois/heure ; respecte Telegram).
              </p>
            </div>
          )}
        </section>
      ) : (
        <>
      <section className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-3 rounded-xl border bg-card p-4 shadow-sm sm:p-5">
          <h2 className="text-sm font-semibold">Canaux</h2>
          {isLoadingChannels ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden /> Chargement…
            </p>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="tg-channel-select">Canal suivre</Label>
              <select
                id="tg-channel-select"
                className={cn(
                  'h-10 w-full rounded-md border border-input bg-background px-3 text-sm'
                )}
                value={selectedChannelId ?? ''}
                onChange={(e) => setSelectedChannelId(e.target.value || null)}
              >
                <option value="" disabled>Sélectionne un canal…</option>
                {channels.map((c) => (
                  <option key={c.id} value={c.id}>
                    @{c.username} {c.label ? `— ${c.label}` : ''}
                  </option>
                ))}
              </select>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!selectedChannelId}
                  onClick={() => selectedChannelId && void handleDeleteChannel(selectedChannelId)}
                >
                  Supprimer le canal sélectionné
                </Button>
              </div>
            </div>
          )}

          <form onSubmit={handleAddChannel} className="mt-4 flex flex-col gap-3 rounded-lg border border-dashed p-3">
            <p className="text-xs font-medium text-muted-foreground">Ajouter un canal</p>
            <div className="space-y-1">
              <Label htmlFor="tg-new-channel">Lien ou @username</Label>
              <Input
                id="tg-new-channel"
                value={newChannelUsername}
                onChange={(e) => setNewChannelUsername(e.target.value)}
                placeholder="https://t.me/moncanal ou @slug"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="tg-new-label">Libellé (optionnel)</Label>
              <Input
                id="tg-new-label"
                value={newChannelLabel}
                onChange={(e) => setNewChannelLabel(e.target.value)}
                placeholder="Nom affiché"
              />
            </div>
            <Button type="submit" size="sm" className="self-start">
              Enregistrer
            </Button>
          </form>
        </div>

        <div className="space-y-3 rounded-xl border bg-card p-4 shadow-sm sm:p-5">
          <h2 className="text-sm font-semibold">Plage &amp; scrape</h2>
          <div className="space-y-4">
            <div>
              <p className="mb-2 text-xs font-medium text-muted-foreground">Début</p>
              <div className="flex flex-wrap items-end gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Date</Label>
                  <DatePicker value={rangeStartDay} onChange={setRangeStartDay} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="tg-from" className="text-xs">
                    Heure (HH:mm)
                  </Label>
                  <Input
                    id="tg-from"
                    className="w-[100px]"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    placeholder="00:00"
                  />
                </div>
              </div>
            </div>
            <div>
              <p className="mb-2 text-xs font-medium text-muted-foreground">Fin</p>
              <div className="flex flex-wrap items-end gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Date</Label>
                  <DatePicker value={rangeEndDay} onChange={setRangeEndDay} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="tg-to" className="text-xs">
                    Heure (HH:mm)
                  </Label>
                  <Input
                    id="tg-to"
                    className="w-[100px]"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    placeholder="23:59"
                  />
                </div>
              </div>
            </div>
          </div>
          {rangeLabel ? <p className="text-xs text-muted-foreground">Plage active : {rangeLabel}</p> : null}
          <p className="text-xs text-muted-foreground">
            Sur un canal très actif ou une très longue plage, ajoute{' '}
            <code className="rounded bg-muted px-1">TELEGRAM_SCRAPE_MAX_MESSAGES</code> (ex.{' '}
            <code className="rounded bg-muted px-1">50000</code>) ; défaut environ 25000 passages Telegram avant arrêt si besoin.

          </p>

          {range && 'error' in range ? (
            <p className="text-sm text-destructive">{range.error}</p>
          ) : null}

          <Button
            type="button"
            onClick={() => void handleScrape()}
            disabled={mtprotoConnected !== true || isScraping || !selectedChannelId}
          >
            {isScraping ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" aria-hidden /> Scrape…
              </>
            ) : (
              'Scraper Telegram'
            )}
          </Button>

          {isScraping ? (
            <div className="space-y-2 pt-2" aria-live="polite">
              {scrapeProgress == null ? (
                <p className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="size-3.5 shrink-0 animate-spin" aria-hidden />
                  Connexion Telegram et démarrage du scrape…
                </p>
              ) : (
                <>
                  <div
                    className="relative h-2.5 w-full overflow-hidden rounded-full bg-muted"
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={scrapeProgress.pct}
                    aria-valuetext={`${scrapeProgress.fetched} messages parcourus sur un budget maximal de ${scrapeProgress.maxMessages}`}
                  >
                    <div
                      className="h-full rounded-full bg-primary transition-[width] duration-150 ease-linear"
                      style={{ width: `${scrapeProgress.pct}%` }}
                    />
                  </div>
                  <p className="text-xs tabular-nums text-muted-foreground">
                    <span className="font-medium text-foreground">{scrapeProgress.fetched.toLocaleString('fr-FR')}</span>{' '}
                    messages parcourus ·{' '}
                    <span className="font-medium text-foreground">
                      {scrapeProgress.persisted.toLocaleString('fr-FR')}
                    </span>{' '}
                    enregistrés · regex{' '}
                    <span className="text-foreground">{scrapeProgress.parsedRegex}</span>, Gemini{' '}
                    <span className="text-foreground">{scrapeProgress.parsedGemini}</span>, échecs{' '}
                    <span className="text-foreground">{scrapeProgress.failed}</span>
                    {' · '}
                    plafond itérations Telegram {scrapeProgress.maxMessages.toLocaleString('fr-FR')}
                  </p>
                </>
              )}
            </div>
          ) : null}

          {scrapeSummary ? <p className="text-sm text-muted-foreground">{scrapeSummary}</p> : null}
          {scrapeError ? <p className="text-sm text-destructive">{scrapeError}</p> : null}
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-lg font-semibold tracking-tight">Classement</h2>
          {isLoadingBoard ? (
            <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden />
          ) : null}
        </div>
        {excludePumpMayhem && isMayhemResolving ? (
          <div className="space-y-1.5 rounded-lg border bg-card px-3 py-2.5 shadow-sm">
            <div
              className="relative h-2 w-full overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-valuetext="Vérification des mints via GMGN en cours"
              aria-busy="true"
            >
              <div className="absolute inset-y-0 w-[38%] rounded-full bg-primary animate-telegram-mayhem-bar" />
            </div>
            <p className="text-xs text-muted-foreground">
              Vérification Pump Mayhem (GMGN) — chaque mint est contrôlé, cela peut prendre une minute…
            </p>
          </div>
        ) : null}
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed bg-muted/20 px-3 py-2">
          <input
            id="tg-exclude-pump-mayhem"
            type="checkbox"
            className="size-4 shrink-0 rounded border-input accent-primary"
            checked={excludePumpMayhem}
            onChange={(e) => setExcludePumpMayhem(e.target.checked)}
          />
          <Label htmlFor="tg-exclude-pump-mayhem" className="cursor-pointer text-sm font-normal leading-snug">
            Masquer les tokens <span className="font-medium">Pump Mayhem</span> (GMGN en arrière-plan, sans recharger le
            classement SQL)
          </Label>
        </div>
        {boardError ? <p className="text-sm text-destructive">{boardError}</p> : null}
        {boardMayhemHint ? <p className="text-xs text-muted-foreground">{boardMayhemHint}</p> : null}

        {!selectedChannelId ? (
          <p className="text-sm text-muted-foreground">
            Sélectionne un canal pour enregistrer des favoris — ils sont synchronisés sur ton compte (base de données).
          </p>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-[1fr,minmax(240px,300px)]">
          <div className="min-w-0 space-y-2">
            <RuggerTelegramLeaderboard
              rows={displayRows}
              sortBy={sortBy}
              dir={dir}
              onSortChange={handleSortChange}
              favoriteMintSet={favoriteMintSet}
              onToggleFavorite={selectedChannelId ? toggleFavorite : undefined}
            />
          </div>

          {selectedChannelId ? (
            <aside
              className="h-fit space-y-2 rounded-xl border bg-card p-3 shadow-sm lg:sticky lg:top-20"
              aria-label="Liste des tokens favoris"
            >
              <h3 className="flex flex-wrap items-center gap-2 text-sm font-semibold tracking-tight">
                Favoris
                <span className="tabular-nums text-muted-foreground">({telegramFavorites.length})</span>
                {isFavoritesLoading ? (
                  <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground" aria-hidden />
                ) : null}
              </h3>
              <p className="text-[11px] leading-snug text-muted-foreground">
                Enregistrés en base pour ce canal et ton compte (tous navigateurs / appareils). Clique ★ sur une ligne
                pour ajouter ou retirer.
              </p>
              {telegramFavorites.length === 0 ? (
                <p className="text-xs text-muted-foreground">Aucun favori pour l’instant.</p>
              ) : (
                <ul className="max-h-[min(60vh,28rem)] space-y-0 divide-y divide-border overflow-y-auto rounded-md border border-border bg-muted/20">
                  {telegramFavorites.map((fav) => (
                    <li key={fav.mint} className="flex flex-wrap items-start gap-2 p-2.5">
                      <button
                        type="button"
                        className="-m-1 inline-flex size-8 shrink-0 items-center justify-center rounded-md text-foreground hover:bg-muted hover:text-foreground"
                        aria-label="Retirer des favoris"
                        onClick={() => removeFavoriteMint(fav.mint)}
                      >
                        <Star className="size-4 fill-foreground text-foreground" />
                      </button>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-medium">{fav.token_name?.trim() || '—'}</p>
                        <button
                          type="button"
                          className={cn(
                            'mt-0.5 cursor-pointer border-0 bg-transparent p-0 font-mono text-[12px] text-muted-foreground',
                            favoriteCopiedMint === fav.mint && 'text-primary'
                          )}
                          title={`${fav.mint} — copier`}
                          onClick={() => void handleFavoriteCopyMint(fav.mint)}
                        >
                          {favoriteCopiedMint === fav.mint ? '✓ Copié' : formatMintShort(fav.mint)}
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </aside>
          ) : null}
        </div>
      </section>
        </>
      )}
    </div>
  );
}
