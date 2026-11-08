-- Dados ficticios: nunca executar no banco de producao.
-- Usar apos criar o esquema de autenticacao e o esquema de planos.
PRAGMA foreign_keys = ON;

INSERT INTO users(id, email, display_name)
VALUES ('billing-ci-user', 'billing-ci@example.test', 'Cliente de teste');

INSERT INTO billing_subscriptions(id, user_id, plan_id, status)
VALUES
  ('billing-ci-sub-1', 'usuario-ci-001', 'inicial', 'active'),
  ('billing-ci-sub-2', 'billing-ci-user', 'profissional', 'active');

INSERT INTO billing_credit_periods
  (id, subscription_id, starts_at, ends_at, credits_total)
VALUES
  ('billing-ci-period-1', 'billing-ci-sub-1',
   '2026-11-01T00:00:00.000Z', '2026-12-01T00:00:00.000Z', 10),
  ('billing-ci-period-2', 'billing-ci-sub-2',
   '2026-11-01T00:00:00.000Z', '2026-12-01T00:00:00.000Z', 40);

-- Reserva atomica condicionada ao saldo disponivel.
UPDATE billing_credit_periods
SET credits_reserved = credits_reserved + 2
WHERE id = 'billing-ci-period-1'
  AND credits_used + credits_reserved + 2 <= credits_total;

-- Confirmacao de uma geracao e liberacao de uma reserva.
UPDATE billing_credit_periods
SET credits_reserved = credits_reserved - 1,
    credits_used = credits_used + 1
WHERE id = 'billing-ci-period-1'
  AND credits_reserved >= 1;

UPDATE billing_credit_periods
SET credits_reserved = credits_reserved - 1
WHERE id = 'billing-ci-period-1'
  AND credits_reserved >= 1;

-- Esta tentativa deve ser bloqueada (saldo restante e 9).
UPDATE billing_credit_periods
SET credits_reserved = credits_reserved + 10
WHERE id = 'billing-ci-period-1'
  AND credits_used + credits_reserved + 10 <= credits_total;
