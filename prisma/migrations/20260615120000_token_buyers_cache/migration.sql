-- Cache serveur des buyers d'un token (Helius). TTL par entrée, clé (mint, buyer_limit).
-- Permet à une analyse partielle (budget Hobby / tier Helius gratuit) de reprendre sur
-- relance sans retaper le provider. Faits on-chain partagés → non scopé par user.

CREATE TABLE "token_buyers_cache" (
    "token_mint" TEXT NOT NULL,
    "buyer_limit" INTEGER NOT NULL,
    "buyers_json" TEXT NOT NULL,
    "fetched_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "token_buyers_cache_pkey" PRIMARY KEY ("token_mint","buyer_limit")
);

CREATE INDEX "token_buyers_cache_expires_at_idx" ON "token_buyers_cache"("expires_at");
