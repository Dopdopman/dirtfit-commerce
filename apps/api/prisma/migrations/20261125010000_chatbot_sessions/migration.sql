-- Migration for Phase 11: AI Support Chatbot Sessions & Grounded Messages
CREATE TYPE "ChatMessageRole" AS ENUM ('USER', 'ASSISTANT');

CREATE TYPE "ChatFeedback" AS ENUM ('UP', 'DOWN');

CREATE TYPE "ChatIntent" AS ENUM (
  'POLICY_ORDERING',
  'POLICY_TERMS',
  'POLICY_WARRANTY',
  'RIDER_FIT_ADVICE',
  'CATALOG_PRICING',
  'SHOWROOM_TEST_RIDE',
  'ORDER_STATUS_HELP',
  'OUT_OF_SCOPE'
);

CREATE TABLE "chat_sessions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID,
  "guest_token_hash" VARCHAR(64),
  "locale" VARCHAR(8) NOT NULL DEFAULT 'en',
  "last_active_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "chat_sessions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "chat_messages" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "session_id" UUID NOT NULL,
  "role" "ChatMessageRole" NOT NULL,
  "content" TEXT NOT NULL,
  "intent" "ChatIntent",
  "citations_json" JSONB,
  "recommended_bikes_json" JSONB,
  "provider" VARCHAR(32),
  "latency_ms" INTEGER,
  "feedback" "ChatFeedback",
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "chat_sessions_guest_token_hash_key" ON "chat_sessions"("guest_token_hash");
CREATE INDEX "chat_sessions_user_id_last_active_at_idx" ON "chat_sessions"("user_id", "last_active_at" DESC);
CREATE INDEX "chat_sessions_expires_at_idx" ON "chat_sessions"("expires_at");
CREATE INDEX "chat_messages_session_id_created_at_idx" ON "chat_messages"("session_id", "created_at" ASC);

ALTER TABLE "chat_sessions"
  ADD CONSTRAINT "chat_sessions_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "chat_messages"
  ADD CONSTRAINT "chat_messages_session_id_fkey"
  FOREIGN KEY ("session_id") REFERENCES "chat_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "chat_sessions"
  ADD CONSTRAINT "chk_chat_session_owner"
  CHECK ("user_id" IS NOT NULL OR "guest_token_hash" IS NOT NULL);
