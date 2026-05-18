-- Cache du traçage d'adresses (Address Tracer). Une entrée par (utilisateur, type, start, fenêtre lamports).

CREATE TABLE "address_trace_cache" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "user_id" TEXT NOT NULL,
    "tracer_type" TEXT NOT NULL,
    "start_address" TEXT NOT NULL,
    "min_lamports" BIGINT NOT NULL,
    "max_lamports" BIGINT NOT NULL,
    "journal_json" TEXT NOT NULL,
    "stopped_by" TEXT,
    "resolved_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "address_trace_cache_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "address_trace_cache_user_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "address_trace_cache_uniq" ON "address_trace_cache"("user_id","tracer_type","start_address","min_lamports","max_lamports");
CREATE INDEX "address_trace_cache_user_idx" ON "address_trace_cache"("user_id");
