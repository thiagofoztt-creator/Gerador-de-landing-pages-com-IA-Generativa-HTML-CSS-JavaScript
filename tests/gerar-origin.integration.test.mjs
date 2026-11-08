import { afterEach, describe, expect, it, vi } from "vitest";
import worker from "../worker/index.js";

const ORIGEM = "https://preview.example";
const SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const DESCRICAO = "Criar uma landing page de tecnologia";
const HTML_VALIDO = "<html><body>Site de teste</body></html>";
const ERRO_TURNSTILE = "Verificação de segurança inválida ou expirada.";

afterEach(() => {
  vi.restoreAllMocks();
});

function ambiente(overrides = {}) {
  return {
    ENABLE_GENERATION: "true",
    GEMINI_API_KEY: "chave-ficticia-para-testes",
    LIMITE_GERACAO: {
      limit: vi.fn(async ({ key }) => {
        expect(key).toBe("landing-pages-global");
        return { success: true };
      })
    },
    ...overrides
  };
}

function ambienteComTurnstile(overrides = {}) {
  return ambiente({
    TURNSTILE_SECRET_KEY: "segredo-ficticio",
    ...overrides
  });
}

async function gerar({
  env = ambiente(),
  origin = ORIGEM,
  contentType = "application/json",
  body = { descricao: DESCRICAO, turnstileToken: "token-ficticio" }
} = {}) {
  const headers = { "Content-Type": contentType };
  if (origin !== null) headers.Origin = origin;

  const payload = typeof body === "string" ? body : JSON.stringify(body);
  return worker.fetch(
    new Request(ORIGEM + "/gerar", {
      method: "POST",
      headers,
      body: payload
    }),
    env
  );
}

function simularRede({ respostaTurnstile, respostaGemini } = {}) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async endereco => {
    const url = String(endereco);
    if (url === SITEVERIFY) {
      if (respostaTurnstile instanceof Error) throw respostaTurnstile;
      return respostaTurnstile ?? Response.json({
        success: true,
        hostname: "preview.example"
      });
    }
    if (url.includes("generateContent") && respostaGemini !== undefined) {
      return respostaGemini;
    }
    throw new Error("Chamada externa inesperada: " + url);
  });
}

function contadorTeste({ confirmar = true } = {}) {
  const reservaId = crypto.randomUUID();
  const contador = {
    reservar: vi.fn(async () => ({
      permitido: true,
      reservaId,
      utilizadas: 1,
      limite: 50
    })),
    confirmar: vi.fn(async () => ({ confirmada: confirmar })),
    cancelar: vi.fn(async () => ({ cancelada: true, utilizadas: 0 }))
  };
  return { contador, reservaId };
}

function dadosGemini(html) {
  return Response.json({
    candidates: [{
      content: { parts: [{ text: html }] }
    }]
  });
}

describe("Protecao de origem da rota /gerar", () => {
  it("bloqueia origem externa", async () => {
    const resposta = await gerar({
      origin: "https://externo.example",
      contentType: "text/plain",
      body: "teste"
    });
    expect(resposta.status).toBe(403);
    expect(await resposta.json()).toEqual({ erro: "Origem não autorizada." });
  });

  it("bloqueia requisicao sem Origin", async () => {
    const resposta = await gerar({ origin: null, contentType: "text/plain", body: "teste" });
    expect(resposta.status).toBe(403);
  });

  it("permite origem legitima e valida o conteudo", async () => {
    const resposta = await gerar({ contentType: "text/plain", body: "teste" });
    expect(resposta.status).toBe(415);
    expect(await resposta.json()).toEqual({ erro: "Envie um JSON válido." });
  });

  it("bloqueia geracao sem token Turnstile", async () => {
    const env = ambiente();
    const resposta = await gerar({ env, body: { descricao: DESCRICAO } });
    expect(resposta.status).toBe(403);
    expect(await resposta.json()).toEqual({ erro: "Verificação de segurança obrigatória." });
    expect(env.LIMITE_GERACAO.limit).toHaveBeenCalledTimes(1);
  });

  it.each([
    {
      nome: "token Turnstile invalido",
      turnstile: Response.json({ success: false, hostname: "preview.example" }),
      status: 403,
      erro: ERRO_TURNSTILE
    },
    {
      nome: "Turnstile de outro dominio",
      turnstile: Response.json({ success: true, hostname: "outro-dominio.example" }),
      status: 403,
      erro: ERRO_TURNSTILE
    },
    {
      nome: "Turnstile indisponivel",
      turnstile: Response.json({ erro: "Servico indisponivel" }, { status: 503 }),
      status: 502,
      erro: "Não foi possível verificar o Turnstile."
    },
    {
      nome: "falha na conexao Turnstile",
      turnstile: new TypeError("Falha de conexao simulada"),
      status: 500,
      erro: "Não foi possível gerar a página."
    }
  ])("bloqueia $nome", async ({ turnstile, status, erro }) => {
    const fetchSimulado = simularRede({ respostaTurnstile: turnstile });
    const resposta = await gerar({ env: ambienteComTurnstile() });
    expect(resposta.status).toBe(status);
    expect(await resposta.json()).toEqual({ erro });
    expect(fetchSimulado).toHaveBeenCalledTimes(1);
    expect(fetchSimulado.mock.calls[0][0]).toBe(SITEVERIFY);
  });

  it("bloqueia geracao quando rate limit e atingido", async () => {
    const env = ambiente({
      LIMITE_GERACAO: {
        limit: vi.fn(async ({ key }) => {
          expect(key).toBe("landing-pages-global");
          return { success: false };
        })
      }
    });
    const resposta = await gerar({ env, body: { descricao: DESCRICAO } });
    expect(resposta.status).toBe(429);
    expect(await resposta.json()).toEqual({
      erro: "Limite de 20 requisições por minuto atingido."
    });
    expect(env.LIMITE_GERACAO.limit).toHaveBeenCalledTimes(1);
  });

  it("bloqueia geracao quando a cota diaria acaba", async () => {
    const fetchSimulado = simularRede();
    const reservar = vi.fn(async () => ({
      permitido: false,
      utilizadas: 50,
      limite: 50
    }));
    const env = ambienteComTurnstile({
      COTA_DIARIA: {
        getByName: vi.fn(nome => {
          expect(nome).toBe("gerador-global");
          return { reservar };
        })
      }
    });
    const resposta = await gerar({ env });
    expect(resposta.status).toBe(429);
    expect(await resposta.json()).toEqual({
      erro: "Limite diário de 50 gerações atingido."
    });
    expect(reservar).toHaveBeenCalledTimes(1);
    expect(fetchSimulado).toHaveBeenCalledTimes(1);
    expect(fetchSimulado.mock.calls[0][0]).toBe(SITEVERIFY);
  });

  it.each([
    {
      nome: "HTML valido",
      gemini: dadosGemini(HTML_VALIDO),
      confirmar: true,
      status: 200,
      erro: null,
      confirma: true
    },
    {
      nome: "erro HTTP do Gemini",
      gemini: Response.json({ error: { status: "UNAVAILABLE" } }, { status: 503 }),
      confirmar: true,
      status: 502,
      erro: "Falha na comunicação com a IA.",
      confirma: false
    },
    {
      nome: "HTML incompleto",
      gemini: dadosGemini("<html><body>Pagina incompleta"),
      confirmar: true,
      status: 502,
      erro: "A IA não retornou HTML completo.",
      confirma: false
    },
    {
      nome: "falha na confirmacao da reserva",
      gemini: dadosGemini(HTML_VALIDO),
      confirmar: false,
      status: 500,
      erro: "Não foi possível gerar a página.",
      confirma: true
    }
  ])("controla reserva quando $nome", async ({
    gemini, confirmar, status, erro, confirma
  }) => {
    const { contador, reservaId } = contadorTeste({ confirmar });
    const fetchSimulado = simularRede({ respostaGemini: gemini });
    const env = ambienteComTurnstile({
      COTA_DIARIA: {
        getByName: vi.fn(nome => {
          expect(nome).toBe("gerador-global");
          return contador;
        })
      }
    });
    const resposta = await gerar({ env });
    expect(resposta.status).toBe(status);

    const dados = await resposta.json();
    if (erro === null) {
      expect(dados.codigo).toContain("<html>");
      expect(dados.codigo).toContain("</html>");
    } else {
      expect(dados).toEqual({ erro });
    }

    expect(contador.reservar).toHaveBeenCalledTimes(1);
    if (confirma) {
      expect(contador.confirmar).toHaveBeenCalledWith(reservaId);
    } else {
      expect(contador.confirmar).not.toHaveBeenCalled();
    }
    if (status === 200) {
      expect(contador.cancelar).not.toHaveBeenCalled();
    } else {
      expect(contador.cancelar).toHaveBeenCalledTimes(1);
      expect(contador.cancelar).toHaveBeenCalledWith(reservaId);
    }
    expect(fetchSimulado).toHaveBeenCalledTimes(2);
    expect(fetchSimulado.mock.calls[0][0]).toBe(SITEVERIFY);
  });
});
