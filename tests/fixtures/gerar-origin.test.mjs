import { describe, it, expect, vi } from "vitest";

import worker from "../worker/index.js";

const origem = "https://preview.example";

function ambienteTeste() {
  return {
    ENABLE_GENERATION: "true",
    GEMINI_API_KEY: "chave-ficticia-para-testes"
  };
}

describe("Protecao de origem da rota /gerar", () => {
  it("bloqueia origem externa", async () => {
    const resposta = await worker.fetch(
      new Request(`${origem}/gerar`, {
        method: "POST",
        headers: {
          Origin: "https://externo.example",
          "Content-Type": "text/plain"
        },
        body: "teste"
      }),
      ambienteTeste()
    );

    expect(resposta.status).toBe(403);
    expect(await resposta.json()).toEqual({
      erro: "Origem não autorizada."
    });
  });

  it("bloqueia requisicao sem Origin", async () => {
    const resposta = await worker.fetch(
      new Request(`${origem}/gerar`, {
        method: "POST",
        headers: {
          "Content-Type": "text/plain"
        },
        body: "teste"
      }),
      ambienteTeste()
    );

    expect(resposta.status).toBe(403);
  });

  it("permite origem legitima e valida o conteudo", async () => {
    const resposta = await worker.fetch(
      new Request(`${origem}/gerar`, {
        method: "POST",
        headers: {
          Origin: origem,
          "Content-Type": "text/plain"
        },
        body: "teste"
      }),
      ambienteTeste()
    );

    expect(resposta.status).toBe(415);
    expect(await resposta.json()).toEqual({
      erro: "Envie um JSON válido."
      
  it("bloqueia geracao sem token Turnstile", async () => {
    let chamadasLimite = 0;

    const env = {
      ...ambienteTeste(),
      LIMITE_GERACAO: {
        limit: async () => {
          chamadasLimite++;
          return { success: true };
        }
      }
    };

    const resposta = await worker.fetch(
      new Request(`${origem}/gerar`, {
        method: "POST",
        headers: {
          Origin: origem,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          descricao: "Criar uma landing page de tecnologia"
        })
      }),
      env
    );

    expect(resposta.status).toBe(403);

    expect(await resposta.json()).toEqual({
      erro: "Verificação de segurança obrigatória."
    });

    expect(chamadasLimite).toBe(1);
  });
    
  it("bloqueia token Turnstile invalido", async () => {
    const fetchOriginal = globalThis.fetch;

    const fetchSimulado = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          success: false,
          hostname: "preview.example"
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json"
          }
        }
      );
    });

    globalThis.fetch = fetchSimulado;

    try {
      const env = {
        ...ambienteTeste(),
        TURNSTILE_SECRET_KEY: "segredo-ficticio",
        LIMITE_GERACAO: {
          limit: async () => ({ success: true })
        }
      };

      const resposta = await worker.fetch(
        new Request(`${origem}/gerar`, {
          method: "POST",
          headers: {
            Origin: origem,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            descricao: "Criar um site de tecnologia",
            turnstileToken: "token-invalido-ficticio"
          })
        }),
        env
      );

      expect(resposta.status).toBe(403);

      expect(await resposta.json()).toEqual({
        erro: "Verificação de segurança inválida ou expirada."
      });

      expect(fetchSimulado).toHaveBeenCalledTimes(1);

      expect(fetchSimulado.mock.calls[0][0]).toBe(
        "https://challenges.cloudflare.com/turnstile/v0/siteverify"
      );
    } finally {
      globalThis.fetch = fetchOriginal;
      vi.restoreAllMocks();
    }
  });

    });
  });
});
