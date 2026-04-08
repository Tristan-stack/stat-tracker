-- Optional purchase date and Solana mint for GMGN import / sorting
ALTER TABLE "rugger_tokens" ADD COLUMN IF NOT EXISTS "purchased_at" TIMESTAMPTZ;
ALTER TABLE "rugger_tokens" ADD COLUMN IF NOT EXISTS "token_address" TEXT;

CREATE INDEX IF NOT EXISTS "rugger_tokens_rugger_id_purchased_at_idx" ON "rugger_tokens" ("rugger_id", "purchased_at");
