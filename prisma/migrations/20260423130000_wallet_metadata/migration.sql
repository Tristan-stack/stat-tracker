CREATE TABLE IF NOT EXISTS "wallet_metadata" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
  "user_id" TEXT NOT NULL,
  "wallet_address" TEXT NOT NULL,
  "created_at" TIMESTAMP(3),
  "creation_source" TEXT NOT NULL DEFAULT 'helius_first_tx',
  "last_fetched_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "inserted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "wallet_metadata_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "wallet_metadata_user_id_wallet_address_key"
  ON "wallet_metadata"("user_id", "wallet_address");
CREATE INDEX IF NOT EXISTS "wallet_metadata_user_id_idx"
  ON "wallet_metadata"("user_id");

ALTER TABLE "wallet_metadata"
  ADD CONSTRAINT "wallet_metadata_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

