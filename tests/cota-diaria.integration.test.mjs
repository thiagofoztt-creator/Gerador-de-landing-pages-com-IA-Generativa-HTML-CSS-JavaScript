import { runInDurableObject } from "cloudflare:test";
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

    
  it("nao ultrapassa 50 reservas simultaneas", async () => {
    // Nome exclusivo para nao reutilizar o contador anterior.
    const nome = `teste-concorrencia-${crypto.randomUUID()}`;

    const contador = env.COTA_DIARIA.getByName(nome);

    // Disparar 60 reservas sem aguardar uma por vez.
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

    // O limite nao pode ser ultrapassado.
    expect(permitidas).toHaveLength(50);
    expect(bloqueadas).toHaveLength(10);

    // As reservas aprovadas devem receber
    // numeros unicos de 1 ate 50.
    const numeros = permitidas
      .map((resultado) => resultado.utilizadas)
      .sort((a, b) => a - b);

    expect(numeros).toEqual(
      Array.from({ length: 50 }, (_, i) => i + 1)
    );

    // Uma nova reserva deve continuar bloqueada.
    const tentativaExtra = await contador.reservar();

    expect(tentativaExtra.permitido).toBe(false);
    expect(tentativaExtra.utilizadas).toBe(50);

    
  it("inicia nova cota sem carregar o limite de ontem", async () => {
    const nome = `teste-novo-dia-${crypto.randomUUID()}`;
    const contador = env.COTA_DIARIA.getByName(nome);

    const hoje = new Date().toISOString().slice(0, 10);

    const ontem = new Date(
      Date.now() - 24 * 60 * 60 * 1000
    ).toISOString().slice(0, 10);

    expect(ontem).not.toBe(hoje);

    // Registrar uma cota esgotada no dia anterior.
    await runInDurableObject(contador, (_instancia, state) => {
      state.storage.sql.exec(
        "INSERT INTO cotas (dia, utilizadas) VALUES (?, ?)",
        ontem,
        50
      );
      
  it("impede estornos duplicados e cancelamento de reserva confirmada", async () => {
    const nome = `teste-estornos-${crypto.randomUUID()}`;
    const contador = env.COTA_DIARIA.getByName(nome);

    // Criar uma reserva que sera cancelada.
    const primeira = await contador.reservar();

    expect(primeira.permitido).toBe(true);
    expect(primeira.reservaId).toBeTruthy();
    expect(primeira.utilizadas).toBe(1);

    // Primeiro cancelamento: deve devolver uma unidade.
    const cancelamento = await contador.cancelar(
      primeira.reservaId
    );

    expect(cancelamento.cancelada).toBe(true);
    expect(cancelamento.utilizadas).toBe(0);

    // Segundo cancelamento: nao pode devolver novamente.
    const cancelamentoDuplicado = await contador.cancelar(
      primeira.reservaId
    );

    expect(cancelamentoDuplicado.cancelada).toBe(false);

    // Reserva cancelada nao pode ser confirmada.
    const confirmacaoInvalida = await contador.confirmar(
      primeira.reservaId
    );

    expect(confirmacaoInvalida.confirmada).toBe(false);

    // Criar outra reserva e confirmar.
    const segunda = await contador.reservar();

    expect(segunda.permitido).toBe(true);
    expect(segunda.utilizadas).toBe(1);

    const confirmacao = await contador.confirmar(
      segunda.reservaId
    );

    expect(confirmacao.confirmada).toBe(true);

    // Confirmacao repetida nao deve mudar o estado.
    const confirmacaoDuplicada = await contador.confirmar(
      segunda.reservaId
    );

    expect(confirmacaoDuplicada.confirmada).toBe(false);

    // Uma reserva confirmada nao pode ser cancelada.
    const cancelamentoInvalido = await contador.cancelar(
      segunda.reservaId
    );

    expect(cancelamentoInvalido.cancelada).toBe(false);

    // Nova reserva deve encontrar exatamente
    // uma utilizacao contabilizada.
    const terceira = await contador.reservar();

    expect(terceira.permitido).toBe(true);
    expect(terceira.utilizadas).toBe(2);
    );
  });

    // O dia atual deve comecar com uma nova cota.
    const primeiraReserva = await contador.reservar();

    expect(primeiraReserva.permitido).toBe(true);
    expect(primeiraReserva.utilizadas).toBe(1);
    expect(primeiraReserva.limite).toBe(50);

    // Verificar os dois registros no SQLite real.
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


  });
});
