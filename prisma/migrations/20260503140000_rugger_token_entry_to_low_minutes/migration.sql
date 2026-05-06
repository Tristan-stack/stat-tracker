-- Durée entrée → creux (klines), en minutes ; renseignée par import / refresh GMGN.
ALTER TABLE "rugger_tokens" ADD COLUMN IF NOT EXISTS "entry_to_low_minutes" DOUBLE PRECISION;
