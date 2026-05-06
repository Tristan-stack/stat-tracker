-- Cache classification Pump Mayhem (GMGN), TTL par entrée.

CREATE TABLE "gmgn_pump_mayhem_cache" (
    "mint" TEXT NOT NULL,
    "is_pump_mayhem" BOOLEAN NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gmgn_pump_mayhem_cache_pkey" PRIMARY KEY ("mint")
);

CREATE INDEX "gmgn_pump_mayhem_cache_expires_at_idx" ON "gmgn_pump_mayhem_cache"("expires_at");
