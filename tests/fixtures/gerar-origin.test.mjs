
import { describe, it, expect } from "vitest";
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
    });
  });
});
