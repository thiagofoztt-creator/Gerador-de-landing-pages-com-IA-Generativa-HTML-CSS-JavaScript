
import { describe, it, expect } from "vitest";
import { env } from "cloudflare:test";

describe("Integracao D1 - Autenticacao", () => {
  it("deve disponibilizar o banco D1 isolado", async () => {
    expect(env.DB).toBeDefined();

    const resultado = await env.DB
      .prepare("SELECT 1 AS conectado")
      .first();

    expect(resultado).not.toBeNull();
    expect(resultado.conectado).toBe(1);
  });
});
