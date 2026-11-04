
import { describe, it, expect } from "vitest";
import { env } from "cloudflare:workers";

describe("Cota diaria - Durable Object SQLite real", () => {
  it("permite 50 reservas e bloqueia a 51", async () => {
    // Objeto isolado dos contadores reais do sistema.
    const contador = env.COTA_DIARIA.getByName(
      "teste-integracao-limite-50"
    );

    // Executar 50 reservas reais no Durable Object.
    for (let i = 1; i <= 50; i++) {
      const resultado = await contador.reservar();

      expect(resultado.permitido).toBe(true);
      expect(resultado.utilizadas).toBe(i);
      expect(resultado.limite).toBe(50);
    }

    // A 51a reserva deve ser rejeitada.
    const bloqueada = await contador.reservar();

    expect(bloqueada.permitido).toBe(false);
    expect(bloqueada.utilizadas).toBe(50);
    expect(bloqueada.limite).toBe(50);

    // Uma nova tentativa tambem deve ser rejeitada.
    const novamenteBloqueada = await contador.reservar();

    expect(novamenteBloqueada.permitido).toBe(false);
    expect(novamenteBloqueada.utilizadas).toBe(50);
  });
});
