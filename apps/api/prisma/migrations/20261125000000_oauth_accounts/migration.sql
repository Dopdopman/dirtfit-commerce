-- Expand-and-Contract migration for Phase 10: Google OAuth 2.0 + OIDC Account Linking
CREATE TYPE "OAuthProvider" AS ENUM ('GOOGLE');

ALTER TABLE "users"
  ALTER COLUMN "password_hash" DROP NOT NULL,
  ADD COLUMN "avatar_url" VARCHAR(512);

CREATE TABLE "oauth_accounts" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "provider" "OAuthProvider" NOT NULL,
  "provider_account_id" VARCHAR(128) NOT NULL,
  "provider_email" VARCHAR(255) NOT NULL,
  "email_verified" BOOLEAN NOT NULL DEFAULT true,
  "avatar_url" VARCHAR(512),
  "linked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_used_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "oauth_accounts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "oauth_accounts_user_id_idx" ON "oauth_accounts"("user_id");
CREATE UNIQUE INDEX "oauth_accounts_provider_provider_account_id_key" ON "oauth_accounts"("provider", "provider_account_id");
CREATE UNIQUE INDEX "oauth_accounts_user_id_provider_key" ON "oauth_accounts"("user_id", "provider");

ALTER TABLE "oauth_accounts"
  ADD CONSTRAINT "oauth_accounts_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "oauth_accounts"
  ADD CONSTRAINT "chk_oauth_provider_account_id_non_empty" CHECK (length(trim("provider_account_id")) > 0),
  ADD CONSTRAINT "chk_oauth_provider_email_non_empty" CHECK (length(trim("provider_email")) > 0);
