-- Modelo de planos e creditos do Thiago IA.
-- NAO aplicar diretamente ao D1 de producao.
-- Aplicar apenas apos revisar o processo de pagamento e de migracao.
-- Valores sao proposta comercial, nao cobrancas ativas.

CREATE TABLE billing_plans (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  monthly_price_cents INTEGER NOT NULL CHECK (monthly_price_cents >= 0),
  monthly_credits INTEGER NOT NULL CHECK (monthly_credits > 0),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1))
);

INSERT INTO billing_plans
  (id, name, monthly_price_cents, monthly_credits)
VALUES
  ('inicial', 'Inicial', 1990, 10),
  ('profissional', 'Profissional', 4990, 40),
  ('agencia', 'Agencia', 11990, 100);

CREATE TABLE billing_subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  plan_id TEXT NOT NULL REFERENCES billing_plans(id),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'active', 'past_due', 'canceled')),
  provider TEXT,
  provider_subscription_id TEXT UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX billing_one_active_subscription_per_user
ON billing_subscriptions(user_id) WHERE status = 'active';

CREATE INDEX billing_subscriptions_user_idx
ON billing_subscriptions(user_id, status);

CREATE TABLE billing_credit_periods (
  id TEXT PRIMARY KEY,
  subscription_id TEXT NOT NULL REFERENCES billing_subscriptions(id),
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  credits_total INTEGER NOT NULL CHECK (credits_total >= 0),
  credits_used INTEGER NOT NULL DEFAULT 0 CHECK (credits_used >= 0),
  credits_reserved INTEGER NOT NULL DEFAULT 0 CHECK (credits_reserved >= 0),
  CHECK (credits_used + credits_reserved <= credits_total),
  CHECK (starts_at < ends_at),
  UNIQUE(subscription_id, starts_at)
);

CREATE INDEX billing_credit_periods_subscription_idx
ON billing_credit_periods(subscription_id, ends_at);

-- Idempotencia futura: eventos de consumo associados a uma solicitacao.
CREATE TABLE billing_credit_events (
  id TEXT PRIMARY KEY,
  period_id TEXT NOT NULL REFERENCES billing_credit_periods(id),
  request_id TEXT NOT NULL,
  event_type TEXT NOT NULL
    CHECK (event_type IN ('reserve', 'consume', 'release')),
  units INTEGER NOT NULL CHECK (units > 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(period_id, request_id, event_type)
);

CREATE INDEX billing_credit_events_period_idx
ON billing_credit_events(period_id);
