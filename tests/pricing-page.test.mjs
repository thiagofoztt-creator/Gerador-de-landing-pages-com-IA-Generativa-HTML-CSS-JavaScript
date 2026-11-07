import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PLANOS } from "../worker/billing/plans.js";

const pricing = readFileSync(new URL("../public/planos/index.html", import.meta.url), "utf8");
const homepage = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");

test("mostra os tres planos nas mesmas faixas do catalogo", () => {
  for (const plan of PLANOS) {
    const pretty = (plan.monthlyPriceCents / 100).toFixed(2).replace(".", ",");
    assert.match(pricing, new RegExp(plan.name, "i"));
    assert.ok(pricing.includes(pretty), "Preco ausente para " + plan.id);
    assert.ok(pricing.includes("<strong>" + plan.monthlyCredits + "</strong>"), "Creditos ausentes: " + plan.id);
  }
});

test("informa que pagamentos e assinaturas estao indisponiveis", () => {
  assert.match(pricing, /Assinaturas ainda não disponíveis/);
  assert.equal((pricing.match(/Contratação ainda não disponível/g) ?? []).length, 3);
  assert.doesNotMatch(pricing, /<form[\s>]|checkout|pagar agora|<script/i);
});

test("site principal aponta para planos e nenhum link possui rastreamento chatgpt", () => {
  assert.match(homepage, /href="\/planos\/"/);
  assert.doesNotMatch(pricing + homepage, /utm_source=chatgpt\.com/i);
});

test("pagina nao e indexada antes da integracao comercial", () => {
  assert.match(pricing, /name="robots" content="noindex, follow"/);
});
