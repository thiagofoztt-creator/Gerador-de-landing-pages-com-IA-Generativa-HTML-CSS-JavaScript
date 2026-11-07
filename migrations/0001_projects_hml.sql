-- Esquema de referencia do D1 de homologacao thiagoia-hml.
-- NAO executar automaticamente no thiagoia-dev nem em Production.
-- Criado manualmente no Console e validado por testes com D1 isolado.
-- Sempre conferir o schema antes de usar: IF NOT EXISTS nao corrige tabelas divergentes.
CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
    html TEXT NOT NULL CHECK (length(html) BETWEEN 1 AND 200000),
    revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_projects_user_updated
ON projects (user_id, updated_at DESC, id DESC);
