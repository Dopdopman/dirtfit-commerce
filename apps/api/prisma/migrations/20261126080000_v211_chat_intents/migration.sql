-- v2.1.1 Additive PostgreSQL Enum expansion for friendly greetings & general purchase intents.
-- Pure DDL only (zero table locks, 100% zero-downtime compatible with running v2.1.0 API containers).
ALTER TYPE "ChatIntent" ADD VALUE IF NOT EXISTS 'GREETING';
ALTER TYPE "ChatIntent" ADD VALUE IF NOT EXISTS 'GENERAL_PURCHASE';
