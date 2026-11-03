
-- Teste de sessoes no D1 local.
-- Nao executar no banco remoto.

-- Usuario ficticio para testes.
INSERT INTO users (
  id,
  email,
  display_name
)
VALUES (
  'usuario-ci-001',
  'sessoes-ci@example.com',
  'Usuario Teste CI'
);

-- Sessao A.
INSERT INTO user_sessions (
  id,
  user_id,
  token_hash,
  expires_at
)
VALUES (
  'sessao-ci-A',
  'usuario-ci-001',
  'hash-ficticio-ci-A',
  '2099-12-31 23:59:59'
);

-- Sessao B.
INSERT INTO user_sessions (
  id,
  user_id,
  token_hash,
  expires_at
)
VALUES (
  'sessao-ci-B',
  'usuario-ci-001',
  'hash-ficticio-ci-B',
  '2099-12-31 23:59:59'
);

-- Revogar somente a sessao A.
UPDATE user_sessions
SET revoked_at = CURRENT_TIMESTAMP
WHERE id = 'sessao-ci-A'
  AND revoked_at IS NULL;
