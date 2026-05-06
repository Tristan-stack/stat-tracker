-- Canaux Telegram PnL (MTProto scrape) et messages persistés pour leaderboard.

CREATE TABLE "telegram_channels" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "label" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "telegram_channels_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "telegram_channels_user_id_username_key" ON "telegram_channels"("user_id", "username");
CREATE INDEX "telegram_channels_user_id_idx" ON "telegram_channels"("user_id");

CREATE TABLE "telegram_pnl_messages" (
    "id" TEXT NOT NULL,
    "channel_id" TEXT NOT NULL,
    "message_id" BIGINT NOT NULL,
    "posted_at" TIMESTAMP(3) NOT NULL,
    "raw_text" TEXT NOT NULL,
    "parser_used" TEXT NOT NULL,
    "token_mint" TEXT,
    "token_name" TEXT,
    "invested_sol" DOUBLE PRECISION,
    "sold_sol" DOUBLE PRECISION,
    "profit_sol" DOUBLE PRECISION,
    "profit_pct" DOUBLE PRECISION,
    "parse_error" TEXT,
    "parsed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "telegram_pnl_messages_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "telegram_pnl_messages_channel_id_message_id_key" ON "telegram_pnl_messages"("channel_id", "message_id");
CREATE INDEX "telegram_pnl_messages_channel_id_posted_at_idx" ON "telegram_pnl_messages"("channel_id", "posted_at");

ALTER TABLE "telegram_channels" ADD CONSTRAINT "telegram_channels_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "telegram_pnl_messages" ADD CONSTRAINT "telegram_pnl_messages_channel_id_fkey"
  FOREIGN KEY ("channel_id") REFERENCES "telegram_channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
