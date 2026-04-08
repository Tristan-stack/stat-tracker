-- Libellé affiché séparé de l’identifiant mint (`name`).
ALTER TABLE "rugger_tokens" ADD COLUMN "token_name" TEXT;

-- Imports GMGN : l’ancien `name` était le symbole, `token_address` le mint.
UPDATE "rugger_tokens"
SET "token_name" = "name"
WHERE "token_address" IS NOT NULL AND btrim("token_address") <> '';

UPDATE "rugger_tokens"
SET "name" = btrim("token_address")
WHERE "token_address" IS NOT NULL AND btrim("token_address") <> '';
