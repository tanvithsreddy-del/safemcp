-- safemcp Phase 1: creator verification
--
-- One row per (server, github user) verification.
-- Multiple maintainers of the same org repo can each verify.

CREATE TABLE IF NOT EXISTS verifications (
  server_owner       TEXT NOT NULL,
  server_name        TEXT NOT NULL,
  github_user_id     INTEGER NOT NULL,
  github_login       TEXT NOT NULL,
  github_avatar_url  TEXT,
  verified_at        TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (server_owner, server_name, github_user_id)
);

CREATE INDEX IF NOT EXISTS verifications_by_server
  ON verifications(server_owner, server_name);

CREATE INDEX IF NOT EXISTS verifications_by_user
  ON verifications(github_user_id);
