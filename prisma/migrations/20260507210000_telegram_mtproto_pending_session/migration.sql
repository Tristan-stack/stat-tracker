-- Session GramJS après sendCode : obligatoire pour que auth.signIn réutilise la même clé MTProto.

ALTER TABLE "telegram_mtproto_login_challenges"
  ADD COLUMN IF NOT EXISTS "encrypted_pending_session" TEXT;
