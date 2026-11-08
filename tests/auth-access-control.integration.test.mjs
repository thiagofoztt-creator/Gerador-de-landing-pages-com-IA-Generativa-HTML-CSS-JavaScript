import { describe, expect, it, vi } from "vitest";
import worker from "../worker/index.js";

const ORIGIN = "https://auth-test.example";
const COOKIE = "__Host-thiagoia_session=";

function request(path, cookie) {
  return new Request(ORIGIN + path, {
    method: "GET",
    headers: cookie ? { Cookie: COOKIE + cookie, "X-User-Id": "cliente-atacante" } : {}
  });
}

function bancoSessao(idEsperado, tokenEsperado) {
  const select = vi.fn(sql => {
    let parametros;
    return {
      bind(...valores) {
        parametros = valores;
        return this;
      },
      async first() {
        if (sql.includes("FROM user_sessions")) {
          expect(sql).toContain("revoked_at IS NULL");
          expect(sql).toContain("expires_at > ?");
          const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(tokenEsperado));
          const digest = Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, "0")).join("");
          return parametros[0] === digest
            ? { id: "sessao-ativa", user_id: idEsperado, expires_at: "2099-01-01T00:00:00.000Z" }
            : null;
        }
        if (sql.includes("FROM users")) {
          expect(sql).toContain("WHERE id = ?");
          expect(parametros).toEqual([idEsperado]);
          return { id: idEsperado, email: "proprietario@example.test", display_name: "Proprietario" };
        }
        throw new Error("Consulta SQL nao esperada");
      }
    };
  });
  return { db: { prepare: select }, select };
}

describe("Autorizacao HTTP por sessao do servidor", () => {
  it("recusa consulta de identidade sem cookie antes de ler o banco", async () => {
    const select = vi.fn(() => { throw new Error("D1 nao deve ser consultado"); });
    const resposta = await worker.fetch(request("/api/auth/me"), { DB: { prepare: select } });
    expect(resposta.status).toBe(401);
    expect(select).not.toHaveBeenCalled();
  });

  it("rejeita cookie malformado sem procurar usuarios", async () => {
    const select = vi.fn(() => { throw new Error("D1 nao deve ser consultado"); });
    const resposta = await worker.fetch(request("/api/auth/me", "token-invalido"), { DB: { prepare: select } });
    expect(resposta.status).toBe(401);
    expect(select).not.toHaveBeenCalled();
  });

  it("cookie alterado nao acessa sessao nem dados privados", async () => {
    const tokenValido = "a".repeat(64);
    const { db, select } = bancoSessao("cliente-proprietario", tokenValido);
    const resposta = await worker.fetch(request("/api/auth/me", "b".repeat(64)), { DB: db });
    expect(resposta.status).toBe(401);
    expect(await resposta.json()).toEqual({ erro: "Sessão inválida ou expirada." });
    expect(select).toHaveBeenCalledTimes(1);
  });

  it("ignora ID falso enviado por query e header; usa apenas sessao", async () => {
    const tokenValido = "c".repeat(64);
    const { db, select } = bancoSessao("cliente-proprietario", tokenValido);
    const resposta = await worker.fetch(
      request("/api/auth/me?user_id=cliente-atacante", tokenValido),
      { DB: db }
    );
    expect(resposta.status).toBe(200);
    expect(resposta.headers.get("Cache-Control")).toBe("no-store");
    const corpo = await resposta.json();
    expect(corpo.usuario).toEqual({
      id: "cliente-proprietario",
      email: "proprietario@example.test",
      name: "Proprietario"
    });
    expect(corpo.usuario).not.toHaveProperty("password_hash");
    expect(select).toHaveBeenCalledTimes(2);
  });

  it("nao permite verificar identidades sem banco configurado", async () => {
    const resposta = await worker.fetch(request("/api/auth/me", "a".repeat(64)), {});
    expect(resposta.status).toBe(503);
  });

  it.each([
    ["/api/billing/checkout", "POST"],
    ["/api/billing/subscribe", "POST"],
    ["/api/billing/activate", "POST"]
  ])("recusa rota de compra inexistente %s", async (path, method) => {
    const resposta = await worker.fetch(
      new Request(ORIGIN + path, {
        method,
        headers: { Origin: ORIGIN, "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: "cliente-atacante", plan_id: "agencia", paid: true })
      }),
      {}
    );
    expect(resposta.status).toBe(404);
    expect((await resposta.json()).erro).toBe("Rota não encontrada.");
  });
});
