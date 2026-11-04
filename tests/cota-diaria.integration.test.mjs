
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
    
  it("impede dois estornos simultaneos da mesma reserva", async () => {
    const nome = `teste-estorno-simultaneo-${crypto.randomUUID()}`;
    const contador = env.COTA_DIARIA.getByName(nome);

    // Criar uma reserva pendente.
    const reserva = await contador.reservar();

    expect(reserva.permitido).toBe(true);
    expect(reserva.utilizadas).toBe(1);

    // Tentar cancelar a mesma reserva duas vezes.
    const resultados = await Promise.all([
      contador.cancelar(reserva.reservaId),
      contador.cancelar(reserva.reservaId)
    ]);

    const cancelamentosValidos = resultados.filter(
      (resultado) => resultado.cancelada === true
    );

    const cancelamentosRejeitados = resultados.filter(
      (resultado) => resultado.cancelada === false
    );

    expect(cancelamentosValidos).toHaveLength(1);
    expect(cancelamentosRejeitados).toHaveLength(1);

    // A cota deve ter sido devolvida somente uma vez.
    const novaReserva = await contador.reservar();

    expect(novaReserva.permitido).toBe(true);
    expect(novaReserva.utilizadas).toBe(1);
    ]);
  });
    
  it("impede confirmar e cancelar a mesma reserva simultaneamente", async () => {
    const nome = `teste-disputa-${crypto.randomUUID()}`;
    const contador = env.COTA_DIARIA.getByName(nome);

    // Criar uma reserva pendente.
    const reserva = await contador.reservar();

    expect(reserva.permitido).toBe(true);
    expect(reserva.utilizadas).toBe(1);
    expect(reserva.reservaId).toBeTruthy();

    // Disputar a mesma reserva em paralelo.
    const [confirmacao, cancelamento] = await Promise.all([
      contador.confirmar(reserva.reservaId),
      contador.cancelar(reserva.reservaId)
    ]);

    // Somente uma transicao pode acontecer.
    const totalSucessos =
      Number(confirmacao.confirmada === true) +
      Number(cancelamento.cancelada === true);

    expect(totalSucessos).toBe(1);

    // Consultar o estado persistido no SQLite.
    const estado = await runInDurableObject(
      contador,
      (_instancia, state) => {
        return state.storage.sql.exec(
          "SELECT status FROM reservas WHERE id = ?",
          reserva.reservaId
        ).toArray()[0];
      }
    );

    if (confirmacao.confirmada) {
      expect(estado.status).toBe("confirmada");
    } else {
      expect(estado.status).toBe("cancelada");
    }

    // Conferir que o contador permaneceu consistente.
    const novaReserva = await contador.reservar();

    expect(novaReserva.permitido).toBe(true);

    expect(novaReserva.utilizadas).toBe(
      confirmacao.confirmada ? 2 : 1
    );
  
  it("identifica reserva que permaneceu pendente", async () => {
    const nome = `teste-pendente-${crypto.randomUUID()}`;
    const contador = env.COTA_DIARIA.getByName(nome);

    // Simular uma geracao iniciada.
    const reserva = await contador.reservar();

    expect(reserva.permitido).toBe(true);
    expect(reserva.reservaId).toBeTruthy();

    // Simular interrupcao antes de confirmar ou cancelar.
    // Nenhum dos dois metodos sera chamado.

    // Consultar o estado persistido no SQLite.
    const registro = await runInDurableObject(
      contador,
      (_instancia, state) => {
        return state.storage.sql.exec(
          `SELECT id, dia, status, criada_em
           FROM reservas
           WHERE id = ?`,
          reserva.reservaId
        ).toArray()[0];
      }
    );

    expect(registro).toBeDefined();
    expect(registro.id).toBe(reserva.reservaId);
    expect(registro.status).toBe("reservada");

    // Verificar que a utilizacao ainda esta contabilizada.
    const contadorAtual = await runInDurableObject(
      contador,
      (_instancia, state) => {
        return state.storage.sql.exec(
          "SELECT utilizadas FROM cotas WHERE dia = ?",
          reserva.dia ??
            new Date().toISOString().slice(0, 10)
        ).toArray()[0];
      }
    );

    expect(contadorAtual.utilizadas).toBe(1);
    );
    
  it("identifica somente reservas pendentes antigas", async () => {
    const nome = `teste-antigas-${crypto.randomUUID()}`;
    const contador = env.COTA_DIARIA.getByName(nome);

    // Criar quatro reservas no SQLite real.
    const antiga = await contador.reservar();
    const recente = await contador.reservar();
    const confirmada = await contador.reservar();
    const cancelada = await contador.reservar();

    expect(antiga.permitido).toBe(true);
    expect(recente.permitido).toBe(true);
    expect(confirmada.permitido).toBe(true);
    expect(cancelada.permitido).toBe(true);

    // Concluir duas reservas para testar o filtro.
    const confirmacao = await contador.confirmar(
      confirmada.reservaId
    );

    const cancelamento = await contador.cancelar(
      cancelada.reservaId
    );

    expect(confirmacao.confirmada).toBe(true);
    expect(cancelamento.cancelada).toBe(true);

    // Simular reservas criadas duas horas antes.
    // Nenhuma alteracao no relogio real.
    const duasHorasAtras = new Date(
      Date.now() - 2 * 60 * 60 * 1000
    ).toISOString();

    await runInDurableObject(
      contador,
      (_instancia, state) => {
        for (const id of [
          antiga.reservaId,
          confirmada.reservaId,
          cancelada.reservaId
        ]) {
          state.storage.sql.exec(
            "UPDATE reservas SET criada_em = ? WHERE id = ?",
            duasHorasAtras,
            id
          );
        }
      }
    );

    // Consultar o metodo real de identificacao.
    const resultado = await contador.listarPendentesAntigas();

    expect(resultado.criterioMinutos).toBe(30);
    expect(resultado.totalEncontradas).toBe(1);

    expect(resultado.reservas).toHaveLength(1);
    expect(resultado.reservas[0].id).toBe(
      antiga.reservaId
    );
    expect(resultado.reservas[0].status).toBe(
      "reservada"
    );

    // Garantir que a consulta nao alterou o contador.
    const novaReserva = await contador.reservar();

    expect(novaReserva.permitido).toBe(true);
    expect(novaReserva.utilizadas).toBe(4);
  
  it("identifica corretamente mais de 100 reservas antigas", async () => {
    const nome = `teste-paginacao-${crypto.randomUUID()}`;
    const contador = env.COTA_DIARIA.getByName(nome);

    // Criar 101 registros ficticios diretamente no SQLite.
    await runInDurableObject(
      contador,
      (_instancia, state) => {
        state.storage.sql.exec(`
          WITH RECURSIVE numeros(n) AS (
            SELECT 1
            UNION ALL
            SELECT n + 1 FROM numeros WHERE n < 101
          )
          INSERT INTO reservas (
            id,
            dia,
            status,
            criada_em,
            atualizada_em
          )
          SELECT
            printf('pagina-%03d', n),
            '2020-01-01',
            'reservada',
            '2020-01-01T00:00:00.000Z',
            '2020-01-01T00:00:00.000Z'
          FROM numeros
        `);
      }
    );

    // Com 101 reservas, deve haver outra pagina.
    const primeiraConsulta =
      await contador.listarPendentesAntigas();

    expect(primeiraConsulta.totalEncontradas).toBe(100);
    expect(primeiraConsulta.reservas).toHaveLength(100);
    expect(primeiraConsulta.haMais).toBe(true);

    expect(primeiraConsulta.reservas[0].id)
      .toBe("pagina-001");

    expect(primeiraConsulta.reservas[99].id)
      .toBe("pagina-100");

    // Remover somente o registro ficticio 101.
    await runInDurableObject(
      contador,
      (_instancia, state) => {
        state.storage.sql.exec(
          "DELETE FROM reservas WHERE id = ?",
          "pagina-101"
        );
      }
    );

    // Agora existem exatamente 100 registros.
    const segundaConsulta =
      await contador.listarPendentesAntigas();

    expect(segundaConsulta.totalEncontradas).toBe(100);
    expect(segundaConsulta.reservas).toHaveLength(100);
    expect(segundaConsulta.haMais).toBe(false);
  });
    
  it("pagina 205 reservas sem perder ou duplicar registros", async () => {
    const nome = `teste-cursor-${crypto.randomUUID()}`;
    const contador = env.COTA_DIARIA.getByName(nome);

    // Inserir 205 reservas antigas no SQLite isolado.
    await runInDurableObject(
      contador,
      (_instancia, state) => {
        state.storage.sql.exec(`
          WITH RECURSIVE numeros(n) AS (
            SELECT 1
            UNION ALL
            SELECT n + 1
            FROM numeros
            WHERE n < 205
          )
          INSERT INTO reservas (
            id,
            dia,
            status,
            criada_em,
            atualizada_em
          )
          SELECT
            printf('reserva-%03d', n),
            '2020-01-01',
            'reservada',
            '2020-01-01T00:00:00.000Z',
            '2020-01-01T00:00:00.000Z'
          FROM numeros
        `);
      }
    );

    // Primeira pagina: 100 registros.
    const pagina1 = await contador.listarPendentesAntigas();

    expect(pagina1.totalEncontradas).toBe(100);
    expect(pagina1.haMais).toBe(true);
    expect(pagina1.proximoCursor).not.toBeNull();

    // Segunda pagina: mais 100 registros.
    const pagina2 = await contador.listarPendentesAntigas(
      pagina1.proximoCursor
    );

    expect(pagina2.totalEncontradas).toBe(100);
    expect(pagina2.haMais).toBe(true);
    expect(pagina2.proximoCursor).not.toBeNull();

    // Terceira pagina: cinco registros restantes.
    const pagina3 = await contador.listarPendentesAntigas(
      pagina2.proximoCursor
    );

    expect(pagina3.totalEncontradas).toBe(5);
    expect(pagina3.haMais).toBe(false);
    expect(pagina3.proximoCursor).toBeNull();

    // Reunir as tres paginas.
    const todas = [
      ...pagina1.reservas,
      ...pagina2.reservas,
      ...pagina3.reservas
    ];

    expect(todas).toHaveLength(205);

    // Verificar que nenhum ID foi repetido.
    const ids = todas.map(reserva => reserva.id);
    const idsUnicos = new Set(ids);

    expect(idsUnicos.size).toBe(205);

    // Conferir os limites de cada pagina.
    expect(pagina1.reservas[0].id)
      .toBe("reserva-001");

    expect(pagina1.reservas[99].id)
      .toBe("reserva-100");

    expect(pagina2.reservas[0].id)
      .toBe("reserva-101");

    expect(pagina2.reservas[99].id)
      .toBe("reserva-200");

    expect(pagina3.reservas[0].id)
      .toBe("reserva-201");

    expect(pagina3.reservas[4].id)
      .toBe("reserva-205");

    // Conferir que todos os registros permanecem pendentes.
    expect(
      todas.every(reserva => reserva.status === "reservada")
    ).toBe(true);

    // Conferir que o contador nao foi modificado.
    const cotas = await runInDurableObject(
      contador,
      (_instancia, state) => {
        return state.storage.sql.exec(
          "SELECT COUNT(*) AS total FROM cotas"
        ).toArray();
      }
    );

    expect(cotas[0].total).toBe(0);
  });
});
