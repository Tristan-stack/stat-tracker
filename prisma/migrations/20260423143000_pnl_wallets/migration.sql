CREATE TABLE IF NOT EXISTS "pnl_wallets" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
  "user_id" TEXT NOT NULL,
  "wallet_address" TEXT NOT NULL,
  "label" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "pnl_wallets_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "pnl_wallets_user_id_wallet_address_key"
  ON "pnl_wallets" ("user_id", "wallet_address");
CREATE INDEX IF NOT EXISTS "pnl_wallets_user_id_idx"
  ON "pnl_wallets" ("user_id");

ALTER TABLE "pnl_wallets"
  ADD CONSTRAINT "pnl_wallets_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

