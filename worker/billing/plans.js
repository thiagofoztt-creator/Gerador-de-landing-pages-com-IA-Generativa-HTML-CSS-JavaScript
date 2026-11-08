// Catalogo comercial proposto. Nao efetua cobranças e nao habilita acesso.
export const PLANOS = Object.freeze([
  Object.freeze({ id: "inicial", name: "Inicial", monthlyPriceCents: 1990, monthlyCredits: 10 }),
  Object.freeze({ id: "profissional", name: "Profissional", monthlyPriceCents: 4990, monthlyCredits: 40 }),
  Object.freeze({ id: "agencia", name: "Agencia", monthlyPriceCents: 11990, monthlyCredits: 100 })
]);

export function consultarPlano(id) {
  if (typeof id !== "string") return null;
  return PLANOS.find(plano => plano.id === id) ?? null;
}
