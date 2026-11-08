
import { afterEach, describe, expect, it, vi } from "vitest";
import { validateAuthTurnstile } from "../worker/auth/turnstile.js";
import { checkAuthRateLimit } from "../worker/auth/rate-limit.js";
import { loginUser } from "../worker/auth/login.js";
import { registerUser } from "../worker/auth/register.js";
import { hashPassword, verifyPassword } from "../worker/auth/password.js";
import { createSession } from "../worker/auth/session.js";
import { consultarPlano, PLANOS } from "../worker/billing/plans.js";

const REQ = () => new Request("https://auth-test.example/api/auth/login", {
  headers: { "CF-Connecting-IP": "192.0.2.1" }
});
const ENV = { TURNSTILE_SECRET_KEY: "segredo-de-teste" };
afterEach(() => vi.restoreAllMocks());

describe("Cobertura das validacoes de seguranca com efeitos externos isolados", () => {
  it("valida configuracao e limites do token de Turnstile antes da rede", async () => {
    const network = vi.spyOn(globalThis, "fetch");
    expect(await validateAuthTurnstile(REQ(), {}, "token", "login")).toBe(false);
    for (const token of [undefined, null, "", 123, "x".repeat(2049)]) {
      expect(await validateAuthTurnstile(REQ(), ENV, token, "login")).toBe(false);
    }
    expect(network).not.toHaveBeenCalled();
  });

  it("confere sucesso, hostname, acao e IP do Turnstile", async () => {
    const network = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({ success: true, hostname: "auth-test.example", action: "login" })
    );
    expect(await validateAuthTurnstile(REQ(), ENV, "token-valido", "login")).toBe(true);
    const [url, opts] = network.mock.calls[0];
    expect(url).toContain("siteverify");
    const payload = JSON.parse(opts.body);
    expect(payload.remoteip).toBe("192.0.2.1");
    expect(payload.secret).toBe("segredo-de-teste");
    expect(payload.response).toBe("token-valido");
  });

  it.each([
    [{ success: false, hostname: "auth-test.example", action: "login" }, false],
    [{ success: true, hostname: "atacante.example", action: "login" }, false],
    [{ success: true, hostname: "auth-test.example", action: "register" }, false],
    [{ success: true, hostname: "auth-test.example", action: "login" }, true]
  ])("rejeita respostas Turnstile com dominio, acao ou resultado incorretos", async (payload, expected) => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json(payload));
    expect(await validateAuthTurnstile(REQ(), ENV, "token", "login")).toBe(expected);
  });

  it("recusa HTTP nao OK, erro de rede e resposta JSON malformada do Turnstile", async () => {
    const network = vi.spyOn(globalThis, "fetch");
    network.mockResolvedValueOnce(Response.json({}, { status: 503 }));
    expect(await validateAuthTurnstile(REQ(), ENV, "token", "login")).toBe(false);
    network.mockRejectedValueOnce(new Error("falha de rede simulada"));
    expect(await validateAuthTurnstile(REQ(), ENV, "token", "login")).toBe(false);
    network.mockResolvedValueOnce(new Response("{invalido", { status: 200 }));
    expect(await validateAuthTurnstile(REQ(), ENV, "token", "login")).toBe(false);
  });

  it("rate limit falha fechado sem binding, acao invalida ou IP ausente", async () => {
    const limiter = { limit: vi.fn(async () => ({ success: true })) };
    expect((await checkAuthRateLimit(REQ(), {}, "login")).status).toBe(503);
    expect((await checkAuthRateLimit(REQ(), { AUTH_RATE_LIMIT: limiter }, "delete")).status).toBe(400);
    expect((await checkAuthRateLimit(new Request(REQ().url), { AUTH_RATE_LIMIT: limiter }, "login")).status).toBe(503);
    expect(limiter.limit).not.toHaveBeenCalled();
  });

  it("rate limit diferencia bloqueio, sucesso e erro interno", async () => {
    const limiter = { limit: vi.fn().mockResolvedValueOnce({ success: false })
      .mockResolvedValueOnce({ success: true }).mockRejectedValueOnce(new Error("falha simulada")) };
    const env = { AUTH_RATE_LIMIT: limiter };
    expect((await checkAuthRateLimit(REQ(), env, "register")).status).toBe(429);
    expect((await checkAuthRateLimit(REQ(), env, "forgot-password")).allowed).toBe(true);
    expect((await checkAuthRateLimit(REQ(), env, "login")).status).toBe(503);
    expect(limiter.limit).toHaveBeenCalledWith({ key: "auth:forgot-password:192.0.2.1" });
  });

  it("catalogo e planos desconhecidos permanecem apenas consulta", () => {
    expect(consultarPlano(null)).toBeNull();
    expect(consultarPlano("inexistente")).toBeNull();
    expect(consultarPlano("profissional")).toEqual(PLANOS[1]);
    expect(Object.isFrozen(PLANOS)).toBe(true);
    expect(Object.isFrozen(PLANOS[0])).toBe(true);
  });

  it("validacoes de login e erros inesperados nao revelam detalhes SQL", async () => {
    expect((await loginUser(null, {})).status).toBe(503);
    for (const input of [{}, { email: "pessoa@example.com", password: "" },
      { email: "pessoa@example.com", password: "x".repeat(260) }]) {
      expect((await loginUser({}, input)).status).toBe(400);
    }
    const db = { prepare: () => { throw new Error("SQL privado"); } };
    expect(await loginUser(db, { email: "pessoa@example.com", password: "SenhaSegura2026!" }))
      .toEqual({ status: 503, error: "Login temporariamente indisponível." });
  });

  it("validacoes de cadastro sao aplicadas antes de tentar gravar no D1", async () => {
    await expect(registerUser(null, {})).rejects.toThrow("Banco indisponível.");
    const db = { batch: vi.fn() };
    const password = "SenhaSeguraParaTeste2026!";
    const valid = { name: "Pessoa Teste", email: "pessoa@example.com", password };
    for (const [input, status] of [
      [{ ...valid, name: "" }, 400],
      [{ ...valid, name: "x".repeat(101) }, 400],
      [{ ...valid, email: "pessoa@@example.com" }, 400],
      [{ ...valid, email: "sem-ponto@exemplo" }, 400],
      [{ ...valid, email: "pessoa @example.com" }, 400],
      [{ ...valid, password: "muito-curta" }, 400],
      [{ ...valid, password: "🍎".repeat(70) }, 400]
    ]) {
      expect((await registerUser(db, input)).status).toBe(status);
    }
    expect(db.batch).not.toHaveBeenCalled();
  });

  it("cadastro traduz erros de unicidade e falhas internas em respostas neutras", async () => {
    const input = { name: "Pessoa", email: "pessoa@example.com", password: "SenhaSegura2026!" };
    const db = { prepare: () => ({ bind: () => ({}) }), batch: vi.fn() };
    db.batch.mockRejectedValueOnce(new Error("UNIQUE constraint failed: users.email"));
    expect(await registerUser(db, input))
      .toEqual({ status: 409, error: "Não foi possível concluir o cadastro." });
    db.batch.mockRejectedValueOnce(new Error("erro SQL confidencial"));
    expect(await registerUser(db, input))
      .toEqual({ status: 503, error: "Cadastro temporariamente indisponível." });
  });

  it("hash e verificacao rejeitam formato, parametros e tamanho adulterados", async () => {
    await expect(hashPassword("curta")).rejects.toThrow("Senha fora dos limites permitidos.");
    expect(await verifyPassword(null, "x")).toBe(false);
    expect(await verifyPassword("senha", 42)).toBe(false);
    expect(await verifyPassword("senha", "invalido")).toBe(false);
    expect(await verifyPassword("senha", "PBKDF2-SHA256$1000$00$00")).toBe(false);
    expect(await verifyPassword("senha", "PBKDF2-SHA256$600000$zz$00")).toBe(false);
    expect(await verifyPassword("senha", "PBKDF2-SHA256$600000$00$00")).toBe(false);
    const hash = await hashPassword("SenhaSeguraParaTeste2026!");
    expect(await verifyPassword("senha-incorreta", hash.password_hash)).toBe(false);
    expect(await verifyPassword("SenhaSeguraParaTeste2026!", hash.password_hash)).toBe(true);
  });

  it("criacao de sessao recusa identificadores ausentes", async () => {
    await expect(createSession(null, "id")).rejects.toThrow("Dados de sessão inválidos.");
    await expect(createSession({}, "")).rejects.toThrow("Dados de sessão inválidos.");
  });
});
