CREATE TABLE IF NOT EXISTS "pnl_backgrounds" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
  "user_id" TEXT NOT NULL,
  "name" TEXT,
  "image_data" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "pnl_backgrounds_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "pnl_backgrounds_user_id_idx"
  ON "pnl_backgrounds" ("user_id");

ALTER TABLE "pnl_backgrounds"
  ADD CONSTRAINT "pnl_backgrounds_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

