-- Favoris tokens PnL par utilisateur et canal Telegram

CREATE TABLE "telegram_pnl_favorites" (
    "id" TEXT NOT NULL DEFAULT (gen_random_uuid()::text),
    "user_id" TEXT NOT NULL,
    "channel_id" TEXT NOT NULL,
    "token_mint" TEXT NOT NULL,
    "token_name" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "telegram_pnl_favorites_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "telegram_pnl_favorites_user_channel_mint_key" UNIQUE ("user_id", "channel_id", "token_mint")
);

CREATE INDEX "telegram_pnl_favorites_user_id_channel_id_idx" ON "telegram_pnl_favorites" ("user_id", "channel_id");

ALTER TABLE "telegram_pnl_favorites" ADD CONSTRAINT "telegram_pnl_favorites_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "telegram_pnl_favorites" ADD CONSTRAINT "telegram_pnl_favorites_channel_id_fkey"
  FOREIGN KEY ("channel_id") REFERENCES "telegram_channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
