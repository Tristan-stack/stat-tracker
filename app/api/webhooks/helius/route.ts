import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import type { HeliusEnhancedTransaction } from '@/lib/helius/client';
import { LAMPORTS_PER_SOL } from '@/lib/helius/client';

export const dynamic = 'force-dynamic';

interface WatchlistOwnerRow {
  user_id: string;
  wallet_address: string;
  label: string | null;
}

interface BuyDetected {
  walletAddress: string;
  tokenAddress: string | null;
  amountSol: number | null;
}

function extractBuysFromTx(
  tx: HeliusEnhancedTransaction,
  watchedAddresses: Set<string>
): BuyDetected[] {
  if (tx.type !== 'SWAP') return [];
  const detected: BuyDetected[] = [];
  const seenPerWallet = new Set<string>();

  const swap = tx.events?.swap;
  if (swap?.tokenOutputs?.length) {
    const nativeSol = swap.nativeInput ? Number(swap.nativeInput.amount) / LAMPORTS_PER_SOL : null;
    for (const out of swap.tokenOutputs) {
      const wallet = out.userAccount;
      if (!wallet || !watchedAddresses.has(wallet)) continue;
      if (seenPerWallet.has(wallet)) continue;
      seenPerWallet.add(wallet);
      detected.push({
        walletAddress: wallet,
        tokenAddress: out.mint ?? null,
        amountSol: nativeSol,
      });
    }
  }

  if (detected.length === 0 && tx.tokenTransfers?.length) {
    for (const transfer of tx.tokenTransfers) {
      const wallet = transfer.toUserAccount;
      if (!wallet || !watchedAddresses.has(wallet)) continue;
      if (transfer.tokenAmount <= 0) continue;
      if (seenPerWallet.has(wallet)) continue;
      seenPerWallet.add(wallet);
      detected.push({
        walletAddress: wallet,
        tokenAddress: transfer.mint ?? null,
        amountSol: null,
      });
    }
  }

  return detected;
}

export async function POST(req: NextRequest) {
  const expectedSecret = process.env.HELIUS_WEBHOOK_SECRET;
  if (!expectedSecret) {
    console.error('HELIUS_WEBHOOK_SECRET is not configured; rejecting webhook');
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }

  const providedSecret = req.headers.get('authorization') ?? '';
  if (providedSecret !== expectedSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const txs = Array.isArray(payload)
    ? (payload as HeliusEnhancedTransaction[])
    : [];

  if (txs.length === 0) {
    return NextResponse.json({ ok: true, processed: 0 });
  }

  const candidateAddresses = new Set<string>();
  for (const tx of txs) {
    if (tx.type !== 'SWAP') continue;
    for (const out of tx.events?.swap?.tokenOutputs ?? []) {
      if (out.userAccount) candidateAddresses.add(out.userAccount);
    }
    for (const transfer of tx.tokenTransfers ?? []) {
      if (transfer.toUserAccount) candidateAddresses.add(transfer.toUserAccount);
    }
  }

  if (candidateAddresses.size === 0) {
    return NextResponse.json({ ok: true, processed: 0 });
  }

  const addrList = Array.from(candidateAddresses);
  const placeholders = addrList.map((_, i) => `$${i + 1}`).join(', ');
  const watchRows = await query<WatchlistOwnerRow>(
    `SELECT user_id, wallet_address, label
     FROM watchlist_wallets
     WHERE wallet_address IN (${placeholders})`,
    addrList
  );

  if (watchRows.length === 0) {
    return NextResponse.json({ ok: true, processed: 0 });
  }

  // address -> [{ userId, label }]
  const watchIndex = new Map<string, { userId: string; label: string | null }[]>();
  for (const row of watchRows) {
    const entry = { userId: row.user_id, label: row.label };
    const list = watchIndex.get(row.wallet_address);
    if (list) list.push(entry);
    else watchIndex.set(row.wallet_address, [entry]);
  }

  const watchedSet = new Set(watchIndex.keys());
  let inserted = 0;

  for (const tx of txs) {
    const buys = extractBuysFromTx(tx, watchedSet);
    if (buys.length === 0) continue;
    const occurredAt = new Date(tx.timestamp * 1000).toISOString();

    for (const buy of buys) {
      const subscribers = watchIndex.get(buy.walletAddress) ?? [];
      for (const sub of subscribers) {
        try {
          const res = await query<{ id: string }>(
            `INSERT INTO notifications
               (id, user_id, type, wallet_address, wallet_label,
                token_address, token_symbol, amount_sol, tx_signature, occurred_at)
             VALUES (gen_random_uuid(), $1, 'watchlist_buy', $2, $3, $4, NULL, $5, $6, $7)
             ON CONFLICT (user_id, wallet_address, tx_signature) DO NOTHING
             RETURNING id`,
            [
              sub.userId,
              buy.walletAddress,
              sub.label,
              buy.tokenAddress,
              buy.amountSol,
              tx.signature,
              occurredAt,
            ]
          );
          if (res.length > 0) inserted += 1;
        } catch (err) {
          console.error('Failed to insert notification', { txSig: tx.signature, err });
        }
      }
    }
  }

  return NextResponse.json({ ok: true, processed: inserted });
}
