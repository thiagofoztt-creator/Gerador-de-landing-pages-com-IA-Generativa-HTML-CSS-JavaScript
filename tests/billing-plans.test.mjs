import test from "node:test";
import assert from "node:assert/strict";
import { PLANOS, consultarPlano } from "../worker/billing/plans.js";

test("catalogo de planos mensais tem valores em centavos", () => {
  assert.deepEqual(
    PLANOS.map(({ id, monthlyPriceCents, monthlyCredits }) => [
      id, monthlyPriceCents, monthlyCredits
    ]),
    [
      ["inicial", 1990, 10],
      ["profissional", 4990, 40],
      ["agencia", 11990, 100]
    ]
  );
});

test("planos nao permitem mutacao de precos na memoria", () => {
  assert.equal(Object.isFrozen(PLANOS), true);
  for (const p of PLANOS) assert.equal(Object.isFrozen(p), true);
});

test("identificador desconhecido nao recebe assinatura", () => {
  assert.equal(consultarPlano("nao-existe"), null);
  assert.equal(consultarPlano(""), null);
});

test("metadados de pagamento nao sao inferidos do cliente", () => {
  const plano = consultarPlano("profissional");
  assert.deepEqual(
    { id: plano.id, monthlyPriceCents: plano.monthlyPriceCents },
    { id: "profissional", monthlyPriceCents: 4990 }
  );
});
