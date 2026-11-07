import { describe, expect, it } from "vitest";
import worker from "../worker/index.js";

const BASE = "https://preview.example";

describe("Catalogo publico de planos — sem checkout", () => {
  it("devolve os tres planos e seus valores em centavos", async () => {
    const response = await worker.fetch(new Request(BASE + "/api/plans"), {});
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const data = await response.json();
    expect(data).toEqual({
      status: "pre_lancamento",
      checkoutDisponivel: false,
      planos: [
        { id: "inicial", name: "Inicial", monthlyPriceCents: 1990, monthlyCredits: 10 },
        { id: "profissional", name: "Profissional", monthlyPriceCents: 4990, monthlyCredits: 40 },
        { id: "agencia", name: "Agencia", monthlyPriceCents: 11990, monthlyCredits: 100 }
      ]
    });
  });

  it.each(["POST", "PUT", "PATCH", "DELETE"])(
    "recusa metodo %s para impedir compra ou alteracao de planos",
    async method => {
      const response = await worker.fetch(
        new Request(BASE + "/api/plans", {
          method,
          headers: { "Content-Type": "application/json" },
          body: "{}"
        }),
        {}
      );
      expect(response.status).toBe(405);
      expect(await response.json()).toEqual({ erro: "Método não permitido." });
    }
  );

  it("responde HEAD sem expor dados de usuario", async () => {
    const response = await worker.fetch(new Request(BASE + "/api/plans", { method: "HEAD" }), {});
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("");
  });
});
