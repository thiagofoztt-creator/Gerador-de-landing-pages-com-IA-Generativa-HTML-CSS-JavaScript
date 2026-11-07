-- MIGRACAO PROPOSTA - NAO EXECUTAR NO BANCO DE PRODUCAO AUTOMATICAMENTE.
-- Aplicar apenas apos backup, homologacao e autorizacao de ativacao da flag.
-- O identificador do usuario vem exclusivamente da sessao no servidor.
CREATE TABLE IF NOT EXISTS user_projects (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
  html TEXT NOT NULL CHECK (length(html) BETWEEN 1 AND 200000),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_user_projects_owner_updated
  ON user_projects(user_id, updated_at DESC, id DESC);
