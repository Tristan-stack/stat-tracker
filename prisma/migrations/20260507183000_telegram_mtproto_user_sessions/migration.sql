-- Sessions MTProto utilisateur et flux login serverless-safe (OTP + débit SMS).

CREATE TABLE "telegram_mtproto_sessions" (
    "user_id" TEXT NOT NULL,
    "encrypted_payload" TEXT NOT NULL,
    "phone_hint" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "telegram_mtproto_sessions_pkey" PRIMARY KEY ("user_id")
);

CREATE TABLE "telegram_mtproto_login_challenges" (
    "user_id" TEXT NOT NULL,
    "phone_e164" TEXT NOT NULL,
    "phone_code_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "telegram_mtproto_login_challenges_pkey" PRIMARY KEY ("user_id")
);

CREATE TABLE "telegram_mtproto_sendcode_logs" (
    "id" TEXT NOT NULL DEFAULT (gen_random_uuid()::text),
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "telegram_mtproto_sendcode_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "telegram_mtproto_sendcode_logs_user_id_created_at_idx"
  ON "telegram_mtproto_sendcode_logs"("user_id", "created_at");

ALTER TABLE "telegram_mtproto_sessions"
  ADD CONSTRAINT "telegram_mtproto_sessions_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "telegram_mtproto_login_challenges"
  ADD CONSTRAINT "telegram_mtproto_login_challenges_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "telegram_mtproto_sendcode_logs"
  ADD CONSTRAINT "telegram_mtproto_sendcode_logs_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
