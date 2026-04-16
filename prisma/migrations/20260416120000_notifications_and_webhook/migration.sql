-- CreateTable: notifications (in-app alerts for watchlist buys)
CREATE TABLE IF NOT EXISTS "notifications" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "user_id" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'watchlist_buy',
    "wallet_address" TEXT NOT NULL,
    "wallet_label" TEXT,
    "token_address" TEXT,
    "token_symbol" TEXT,
    "amount_sol" DECIMAL(18, 9),
    "tx_signature" TEXT NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "notifications_user_wallet_tx_key" ON "notifications"("user_id", "wallet_address", "tx_signature");
CREATE INDEX IF NOT EXISTS "notifications_user_id_read_at_idx" ON "notifications"("user_id", "read_at");
CREATE INDEX IF NOT EXISTS "notifications_user_id_created_at_idx" ON "notifications"("user_id", "created_at");

ALTER TABLE "notifications"
  ADD CONSTRAINT "notifications_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: helius_webhook_sync (single-row tracker of the global Helius webhook)
CREATE TABLE IF NOT EXISTS "helius_webhook_sync" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "webhook_id" TEXT NOT NULL,
    "last_synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "address_count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "helius_webhook_sync_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "helius_webhook_sync_webhook_id_key" ON "helius_webhook_sync"("webhook_id");
