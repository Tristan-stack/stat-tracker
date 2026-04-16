'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Bell, Check, ExternalLink, Wallet } from 'lucide-react';
import { useSession } from '@/lib/auth-client';

const POLL_INTERVAL_MS = 30_000;
const LIST_LIMIT = 20;

interface NotificationItem {
  id: string;
  type: string;
  walletAddress: string;
  walletLabel: string | null;
  tokenAddress: string | null;
  tokenSymbol: string | null;
  amountSol: number | null;
  txSignature: string;
  occurredAt: string;
  readAt: string | null;
  createdAt: string;
}

interface NotificationsResponse {
  notifications: NotificationItem[];
  unreadCount: number;
}

function formatRelative(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diffSec = Math.max(0, Math.floor((now - then) / 1000));
  if (diffSec < 60) return `il y a ${diffSec}s`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `il y a ${diffMin}min`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `il y a ${diffH}h`;
  const diffD = Math.floor(diffH / 24);
  return `il y a ${diffD}j`;
}

function shortAddr(addr: string): string {
  if (addr.length <= 10) return addr;
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}

function formatSol(amount: number | null): string {
  if (amount === null) return '—';
  if (amount < 0.001) return '<0.001 SOL';
  return `${amount.toFixed(3)} SOL`;
}

export default function NotificationBell() {
  const { data: session } = useSession();
  const isAuth = Boolean(session?.user);

  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchNotifications = useCallback(async () => {
    if (!isAuth) return;
    try {
      const res = await fetch(`/api/notifications?limit=${LIST_LIMIT}`, { cache: 'no-store' });
      if (!res.ok) return;
      const data = (await res.json()) as NotificationsResponse;
      setItems(data.notifications);
      setUnreadCount(data.unreadCount);
    } catch {
      // silently ignore polling errors
    }
  }, [isAuth]);

  useEffect(() => {
    if (!isAuth) return;
    void fetchNotifications();
    pollRef.current = setInterval(() => void fetchNotifications(), POLL_INTERVAL_MS);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = null;
    };
  }, [isAuth, fetchNotifications]);

  useEffect(() => {
    if (isOpen) void fetchNotifications();
  }, [isOpen, fetchNotifications]);

  const markAsRead = useCallback(async (id: string) => {
    setItems((prev) =>
      prev.map((n) => (n.id === id && n.readAt === null ? { ...n, readAt: new Date().toISOString() } : n))
    );
    setUnreadCount((c) => Math.max(0, c - 1));
    try {
      await fetch(`/api/notifications/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ read: true }),
      });
    } catch {
      void fetchNotifications();
    }
  }, [fetchNotifications]);

  const markAllAsRead = useCallback(async () => {
    if (unreadCount === 0) return;
    setIsLoading(true);
    try {
      await fetch('/api/notifications/mark-all-read', { method: 'POST' });
      await fetchNotifications();
    } finally {
      setIsLoading(false);
    }
  }, [unreadCount, fetchNotifications]);

  if (!isAuth) return null;

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative size-8"
          aria-label="Notifications"
        >
          <Bell className="size-4" />
          {unreadCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex min-w-[16px] items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground tabular-nums">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="w-96 p-0">
        <div className="flex items-center justify-between border-b px-4 py-2.5">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold">Notifications</span>
            {unreadCount > 0 && (
              <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-primary">
                {unreadCount} non lue{unreadCount > 1 ? 's' : ''}
              </span>
            )}
          </div>
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={() => void markAllAsRead()}
              disabled={isLoading}
              className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
            >
              Tout marquer lu
            </button>
          )}
        </div>

        <div className="max-h-[420px] overflow-y-auto">
          {items.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
              <Bell className="size-6 text-muted-foreground/50" />
              <p className="text-xs text-muted-foreground">
                Aucune notification pour le moment.
              </p>
              <p className="text-[11px] text-muted-foreground/70">
                Les achats des wallets de ta watchlist apparaîtront ici.
              </p>
            </div>
          ) : (
            <ul className="divide-y">
              {items.map((n) => {
                const isUnread = n.readAt === null;
                const walletDisplay = n.walletLabel ?? shortAddr(n.walletAddress);
                const tokenDisplay = n.tokenSymbol ?? (n.tokenAddress ? shortAddr(n.tokenAddress) : 'un token');
                return (
                  <li
                    key={n.id}
                    className={cn(
                      'group flex gap-3 px-4 py-3 transition-colors hover:bg-muted/50',
                      isUnread && 'bg-primary/5'
                    )}
                  >
                    <div
                      className={cn(
                        'mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full',
                        isUnread ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
                      )}
                    >
                      <Wallet className="size-3.5" />
                    </div>
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="text-xs leading-relaxed">
                        <span className="font-semibold">{walletDisplay}</span>
                        <span className="text-muted-foreground"> a acheté </span>
                        <span className="font-medium">{tokenDisplay}</span>
                        {n.amountSol !== null && (
                          <>
                            <span className="text-muted-foreground"> pour </span>
                            <span className="font-medium tabular-nums">{formatSol(n.amountSol)}</span>
                          </>
                        )}
                      </p>
                      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                        <span className="tabular-nums">{formatRelative(n.occurredAt)}</span>
                        <a
                          href={`https://solscan.io/tx/${n.txSignature}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-0.5 hover:text-foreground"
                        >
                          <ExternalLink className="size-3" />
                          tx
                        </a>
                      </div>
                    </div>
                    {isUnread && (
                      <button
                        type="button"
                        onClick={() => void markAsRead(n.id)}
                        className="self-start rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground group-hover:opacity-100"
                        aria-label="Marquer comme lue"
                      >
                        <Check className="size-3.5" />
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
