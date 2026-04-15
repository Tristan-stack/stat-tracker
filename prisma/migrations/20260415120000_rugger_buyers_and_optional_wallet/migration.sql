-- Make rugger wallet optional
ALTER TABLE "ruggers"
ALTER COLUMN "wallet_address" DROP NOT NULL;

-- Create table for buyer wallets linked to a rugger
CREATE TABLE IF NOT EXISTS "rugger_buyer_wallets" (
  "id" TEXT NOT NULL,
  "rugger_id" TEXT NOT NULL,
  "wallet_address" TEXT NOT NULL,
  "label" TEXT,
  "notes" TEXT,
  "origin" TEXT NOT NULL DEFAULT 'manual',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "rugger_buyer_wallets_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "rugger_buyer_wallets_rugger_id_wallet_address_key"
ON "rugger_buyer_wallets"("rugger_id", "wallet_address");

CREATE INDEX IF NOT EXISTS "rugger_buyer_wallets_rugger_id_idx"
ON "rugger_buyer_wallets"("rugger_id");

CREATE INDEX IF NOT EXISTS "rugger_buyer_wallets_wallet_address_idx"
ON "rugger_buyer_wallets"("wallet_address");

ALTER TABLE "rugger_buyer_wallets"
ADD CONSTRAINT "rugger_buyer_wallets_rugger_id_fkey"
FOREIGN KEY ("rugger_id") REFERENCES "ruggers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
