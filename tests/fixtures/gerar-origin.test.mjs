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
    
  it("bloqueia Turnstile de outro dominio", async () => {
    const fetchOriginal = globalThis.fetch;

    const fetchSimulado = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          success: true,
          hostname: "outro-dominio.example"
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
            descricao: "Criar uma landing page de tecnologia",
            turnstileToken: "token-ficticio"
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
    
  it("bloqueia geracao quando Turnstile esta indisponivel", async () => {
    const fetchOriginal = globalThis.fetch;

    const fetchSimulado = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          erro: "Servico temporariamente indisponivel"
        }),
        {
          status: 503,
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
            descricao: "Criar uma landing page de tecnologia",
            turnstileToken: "token-ficticio"
          })
        }),
        env
      );

      expect(resposta.status).toBe(502);

      expect(await resposta.json()).toEqual({
        erro: "Não foi possível verificar o Turnstile."
      });

      // Somente a tentativa de verificar o Turnstile.
      // Nenhuma requisicao ao Gemini deve acontecer.
      expect(fetchSimulado).toHaveBeenCalledTimes(1);

      expect(fetchSimulado.mock.calls[0][0]).toBe(
        "https://challenges.cloudflare.com/turnstile/v0/siteverify"
      );
    } finally {
      globalThis.fetch = fetchOriginal;
      vi.restoreAllMocks();
    }
  });
    
  it("bloqueia geracao quando Turnstile falha na conexao", async () => {
    const fetchOriginal = globalThis.fetch;

    const fetchSimulado = vi.fn(async () => {
      throw new TypeError("Falha de conexao simulada");
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
            descricao: "Criar uma landing page de tecnologia",
            turnstileToken: "token-ficticio"
          })
        }),
        env
      );

      // O Worker deve falhar de forma segura.
      expect(resposta.status).toBe(500);

      expect(await resposta.json()).toEqual({
        erro: "Não foi possível gerar a página."
      });

      // Apenas a chamada de verificacao Turnstile.
      expect(fetchSimulado).toHaveBeenCalledTimes(1);

      expect(fetchSimulado.mock.calls[0][0]).toBe(
        "https://challenges.cloudflare.com/turnstile/v0/siteverify"
      );
    } finally {
      globalThis.fetch = fetchOriginal;
      vi.restoreAllMocks();
    }
  });
    
  it("bloqueia geracao quando rate limit e atingido", async () => {
    let chamadasLimite = 0;

    const env = {
      ...ambienteTeste(),
      LIMITE_GERACAO: {
        limit: async ({ key }) => {
          chamadasLimite++;

          expect(key).toBe("landing-pages-global");

          return { success: false };
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

    expect(resposta.status).toBe(429);

    expect(await resposta.json()).toEqual({
      erro: "Limite de 20 requisições por minuto atingido."
    });

    expect(chamadasLimite).toBe(1);
  });
    
  it("bloqueia geracao quando a cota diaria acaba", async () => {
    const fetchOriginal = globalThis.fetch;

    const fetchSimulado = vi.fn(async (url) => {
      if (
        url ===
        "https://challenges.cloudflare.com/turnstile/v0/siteverify"
      ) {
        return new Response(
          JSON.stringify({
            success: true,
            hostname: "preview.example"
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json"
            }
          }
        );
      }

      throw new Error("Chamada externa inesperada");
    });

    globalThis.fetch = fetchSimulado;

    let chamadasReserva = 0;

    try {
      const env = {
        ...ambienteTeste(),
        TURNSTILE_SECRET_KEY: "segredo-ficticio",
        LIMITE_GERACAO: {
          limit: async () => ({ success: true })
        },
        COTA_DIARIA: {
          getByName: (name) => {
            expect(name).toBe("gerador-global");

            return {
              reservar: async () => {
                chamadasReserva++;

                return {
                  permitido: false,
                  utilizadas: 50,
                  limite: 50
                };
              }
            };
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
            descricao: "Criar uma landing page de tecnologia",
            turnstileToken: "token-ficticio"
          })
        }),
        env
      );

      expect(resposta.status).toBe(429);

      expect(await resposta.json()).toEqual({
        erro: "Limite diário de 50 gerações atingido."
      });

      expect(chamadasReserva).toBe(1);

      // Apenas Turnstile; nenhuma chamada ao Gemini.
      expect(fetchSimulado).toHaveBeenCalledTimes(1);
      expect(fetchSimulado.mock.calls[0][0]).toBe(
        "https://challenges.cloudflare.com/turnstile/v0/siteverify"
      );
    } finally {
      globalThis.fetch = fetchOriginal;
      vi.restoreAllMocks();
    }
  
  it("confirma reserva quando Gemini gera HTML valido", async () => {
    const reservaId = crypto.randomUUID();

    const contador = {
      reservar: vi.fn(async () => ({
        permitido: true,
        reservaId,
        utilizadas: 1,
        limite: 50
      })),
      confirmar: vi.fn(async () => ({
        confirmada: true
      })),
      cancelar: vi.fn(async () => ({
        cancelada: true
      }))
    };

    const env = {
      ...ambienteTeste(),
      TURNSTILE_SECRET_KEY: "segredo-ficticio",
      LIMITE_GERACAO: {
        limit: async () => ({ success: true })
      },
      COTA_DIARIA: {
        getByName: () => contador
      }
    };

    const fetchSimulado = vi.spyOn(globalThis, "fetch")
      .mockImplementation(async (endereco) => {
        if (String(endereco).includes("siteverify")) {
          return Response.json({
            success: true,
            hostname: "preview.example"
          });
        }

        if (String(endereco).includes("generateContent")) {
          return Response.json({
            candidates: [{
              content: {
                parts: [{
                  text: "<html><body>Site de teste</body></html>"
                }]
              }
            }]
          });
        }

        throw new Error("Endereco externo inesperado");
      });

    try {
      const resposta = await worker.fetch(
        new Request(`${origem}/gerar`, {
          method: "POST",
          headers: {
            Origin: origem,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            descricao: "Criar um site de tecnologia",
            turnstileToken: "token-ficticio"
          })
        }),
        env
      );

      expect(resposta.status).toBe(200);

      const dados = await resposta.json();

      expect(dados.codigo).toContain("<html>");
      expect(dados.codigo).toContain("</html>");

      expect(contador.reservar).toHaveBeenCalledTimes(1);
      expect(contador.confirmar).toHaveBeenCalledWith(reservaId);
      expect(contador.cancelar).not.toHaveBeenCalled();
      expect(fetchSimulado).toHaveBeenCalledTimes(2);
    } finally {
      vi.restoreAllMocks();
    }
  });

  it("cancela reserva quando Gemini retorna erro HTTP", async () => {
    const reservaId = crypto.randomUUID();

    const contador = {
      reservar: vi.fn(async () => ({
        permitido: true,
        reservaId,
        utilizadas: 1,
        limite: 50
      })),
      confirmar: vi.fn(async () => ({
        confirmada: true
      })),
      cancelar: vi.fn(async () => ({
        cancelada: true
      }))
    };

    const env = {
      ...ambienteTeste(),
      TURNSTILE_SECRET_KEY: "segredo-ficticio",
      LIMITE_GERACAO: {
        limit: async () => ({ success: true })
      },
      COTA_DIARIA: {
        getByName: () => contador
      }
    };

    const fetchSimulado = vi.spyOn(globalThis, "fetch")
      .mockImplementation(async (endereco) => {
        if (String(endereco).includes("siteverify")) {
          return Response.json({
            success: true,
            hostname: "preview.example"
          });
        }

        if (String(endereco).includes("generateContent")) {
          return Response.json(
            { error: { status: "UNAVAILABLE" } },
            { status: 503 }
          );
        }

        throw new Error("Endereco externo inesperado");
      });

    try {
      const resposta = await worker.fetch(
        new Request(`${origem}/gerar`, {
          method: "POST",
          headers: {
            Origin: origem,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            descricao: "Criar um site de tecnologia",
            turnstileToken: "token-ficticio"
          })
        }),
        env
      );

      expect(resposta.status).toBe(502);

      expect(await resposta.json()).toEqual({
        erro: "Falha na comunicação com a IA."
      });

      expect(contador.reservar).toHaveBeenCalledTimes(1);
      expect(contador.confirmar).not.toHaveBeenCalled();
      expect(contador.cancelar).toHaveBeenCalledWith(reservaId);
      expect(fetchSimulado).toHaveBeenCalledTimes(2);
    } finally {
      vi.restoreAllMocks();
    }
  });
});
