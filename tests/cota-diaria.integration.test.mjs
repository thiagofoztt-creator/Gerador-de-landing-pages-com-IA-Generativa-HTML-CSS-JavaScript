
import { runInDurableObject } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import { env } from "cloudflare:workers";

describe("Cota diaria - Durable Object SQLite real", () => {

  it("permite 50 reservas e bloqueia a 51", async () => {
    const nome = `teste-limite-${crypto.randomUUID()}`;
    const contador = env.COTA_DIARIA.getByName(nome);

    for (let i = 1; i <= 50; i++) {
      const resultado = await contador.reservar();

      expect(resultado.permitido).toBe(true);
      expect(resultado.utilizadas).toBe(i);
      expect(resultado.limite).toBe(50);
      expect(resultado.reservaId).toBeTruthy();
    }

    const bloqueada = await contador.reservar();

    expect(bloqueada.permitido).toBe(false);
    expect(bloqueada.utilizadas).toBe(50);
    expect(bloqueada.limite).toBe(50);

    const novamenteBloqueada = await contador.reservar();

    expect(novamenteBloqueada.permitido).toBe(false);
    expect(novamenteBloqueada.utilizadas).toBe(50);
  });

  it("nao ultrapassa 50 reservas simultaneas", async () => {
    const nome = `teste-concorrencia-${crypto.randomUUID()}`;
    const contador = env.COTA_DIARIA.getByName(nome);

    const solicitacoes = Array.from(
      { length: 60 },
      () => contador.reservar()
    );

    const resultados = await Promise.all(solicitacoes);

    const permitidas = resultados.filter(
      (resultado) => resultado.permitido === true
    );

    const bloqueadas = resultados.filter(
      (resultado) => resultado.permitido === false
    );

    expect(permitidas).toHaveLength(50);
    expect(bloqueadas).toHaveLength(10);

    const numeros = permitidas
      .map((resultado) => resultado.utilizadas)
      .sort((a, b) => a - b);

    expect(numeros).toEqual(
      Array.from({ length: 50 }, (_, i) => i + 1)
    );

    const tentativaExtra = await contador.reservar();

    expect(tentativaExtra.permitido).toBe(false);
    expect(tentativaExtra.utilizadas).toBe(50);
  });

  it("inicia nova cota sem carregar o limite de ontem", async () => {
    const nome = `teste-novo-dia-${crypto.randomUUID()}`;
    const contador = env.COTA_DIARIA.getByName(nome);

    const hoje = new Date().toISOString().slice(0, 10);

    const ontem = new Date(
      Date.now() - 24 * 60 * 60 * 1000
    ).toISOString().slice(0, 10);

    expect(ontem).not.toBe(hoje);

    await runInDurableObject(contador, (_instancia, state) => {
      state.storage.sql.exec(
        "INSERT INTO cotas (dia, utilizadas) VALUES (?, ?)",
        ontem,
        50
      );
    });

    const primeiraReserva = await contador.reservar();

    expect(primeiraReserva.permitido).toBe(true);
    expect(primeiraReserva.utilizadas).toBe(1);
    expect(primeiraReserva.limite).toBe(50);

    const registros = await runInDurableObject(
      contador,
      (_instancia, state) => {
        return state.storage.sql.exec(
          "SELECT dia, utilizadas FROM cotas ORDER BY dia"
        ).toArray();
      }
    );

    expect(registros).toEqual([
      { dia: ontem, utilizadas: 50 },
      { dia: hoje, utilizadas: 1 }
    ]);
  });

  it("impede estornos duplicados e cancelamento de reserva confirmada", async () => {
    const nome = `teste-estornos-${crypto.randomUUID()}`;
    const contador = env.COTA_DIARIA.getByName(nome);

    const primeira = await contador.reservar();

    expect(primeira.permitido).toBe(true);
    expect(primeira.reservaId).toBeTruthy();
    expect(primeira.utilizadas).toBe(1);

    const cancelamento = await contador.cancelar(
      primeira.reservaId
    );

    expect(cancelamento.cancelada).toBe(true);
    expect(cancelamento.utilizadas).toBe(0);

    const cancelamentoDuplicado = await contador.cancelar(
      primeira.reservaId
    );

    expect(cancelamentoDuplicado.cancelada).toBe(false);

    const confirmacaoInvalida = await contador.confirmar(
      primeira.reservaId
    );

    expect(confirmacaoInvalida.confirmada).toBe(false);

    const segunda = await contador.reservar();

    expect(segunda.permitido).toBe(true);
    expect(segunda.utilizadas).toBe(1);

    const confirmacao = await contador.confirmar(
      segunda.reservaId
    );

    expect(confirmacao.confirmada).toBe(true);

    const confirmacaoDuplicada = await contador.confirmar(
      segunda.reservaId
    );

    expect(confirmacaoDuplicada.confirmada).toBe(false);

    const cancelamentoInvalido = await contador.cancelar(
      segunda.reservaId
    );

    expect(cancelamentoInvalido.cancelada).toBe(false);

    const terceira = await contador.reservar();

    expect(terceira.permitido).toBe(true);
    expect(terceira.utilizadas).toBe(2);
  });

});
