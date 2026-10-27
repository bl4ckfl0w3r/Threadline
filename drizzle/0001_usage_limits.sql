CREATE TABLE usage_buckets (
  bucket TEXT PRIMARY KEY NOT NULL,
  used INTEGER NOT NULL DEFAULT 0,
  expires_at INTEGER NOT NULL
);
CREATE INDEX usage_buckets_expiry ON usage_buckets (expires_at);
