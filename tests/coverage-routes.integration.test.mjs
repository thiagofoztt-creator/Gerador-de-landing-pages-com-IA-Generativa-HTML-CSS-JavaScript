
import { afterEach, describe, expect, it, vi } from "vitest";
import worker from "../worker/index.js";
import { hashPassword } from "../worker/auth/password.js";

const BASE = "https://auth-test.example";
const DESC = "Uma landing page para servicos de TI.";
const gate = { limit: vi.fn(async () => ({ success: true })) };
const authEnv = (options = {}) => ({
  DB: {},
  AUTH_RATE_LIMIT: gate,
  TURNSTILE_SECRET_KEY: "chave-ficticia",
  ENABLE_AUTH_REGISTRATION: "true",
  ...options
});
const generateEnv = (options = {}) => ({
  ENABLE_GENERATION: "true",
  GEMINI_API_KEY: "gemini-chave-ficticia",
  LIMITE_GERACAO: gate,
  ...options
});
function req(path, method = "POST", body = {}, headers = {}) {
  const init = { method, headers: {
    Origin: BASE, "Content-Type": "application/json",
    "CF-Connecting-IP": "192.0.2.15", ...headers
  } };
  if (method !== "GET" && method !== "HEAD") {
    init.body = typeof body === "string" ? body : JSON.stringify(body);
  }
  return new Request(BASE + path, init);
}
const run = (path, env, body, headers, method) =>
  worker.fetch(req(path, method ?? "POST", body ?? {}, headers), env);

afterEach(() => { vi.restoreAllMocks(); gate.limit.mockClear(); });

describe("Respostas de erro do Worker sem operacoes externas", () => {
  it.each([
    ["/api/auth/login", 503],
    ["/api/auth/me", 405],
    ["/api/auth/logout", 503],
    ["/api/auth/register", 503]
  ])("rejeita falta de dependencia em %s", async (path, expected) => {
    const response = await run(path, authEnv({ DB: undefined }), {});
    expect(response.status).toBe(expected);
  });

  it("rejeita metodo GET para cadastro, geracao e consulta incorreta de sessao", async () => {
    for (const path of ["/api/auth/register", "/gerar", "/api/auth/me"]) {
      const status = (await worker.fetch(req(path, "GET"), authEnv())).status;
      expect(status).toBe(405);
    }
  });

  it.each(["/api/auth/login", "/api/auth/register"])(
    "limita requisicoes, tipo de conteudo, cabecalho grande e corpo grande em %s",
    async path => {
      const env = authEnv();
      gate.limit.mockResolvedValueOnce({ success: false });
      expect((await run(path, env, {})).status).toBe(429);
      expect((await run(path, env, "qualquer", { "Content-Type": "text/plain" })).status).toBe(415);
      expect((await run(path, env, {}, { "Content-Length": "5000" })).status).toBe(413);
      expect((await run(path, env, "x".repeat(4100))).status).toBe(413);
      expect((await run(path, env, "{malformado")).status).toBe(400);
    }
  );

  it.each(["/api/auth/login", "/api/auth/register"])(
    "rejeita origem externa e erro do Turnstile em %s",
    async path => {
      expect((await run(path, authEnv(), {}, { Origin: "https://externo.example" })).status).toBe(403);
      const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
        Response.json({ success: true, hostname: "auth-test.example", action: "acao-errada" })
      );
      expect((await run(path, authEnv(), { turnstileToken: "token" })).status).toBe(403);
      expect(spy).toHaveBeenCalledTimes(1);
    }
  );

  it("rota de cadastro permanece fechada se o recurso esta desativado", async () => {
    const res = await run("/api/auth/register", authEnv({ ENABLE_AUTH_REGISTRATION: "false" }));
    expect(res.status).toBe(503);
  });

  it("login com Turnstile correto autentica e emite cookie com seguranca", async () => {
    const hash = await hashPassword("SenhaSegura2026!123");
    const db = {
      prepare(sql) {
        if (sql.includes("FROM users")) {
          return { bind: () => ({ first: async () => ({
            id: "usuario123", email: "pessoa@example.com",
            display_name: "Pessoa", password_hash: hash.password_hash
          }) }) };
        }
        if (sql.includes("INSERT INTO user_sessions")) {
          return { bind: () => ({ run: async () => ({ meta: { changes: 1 } }) }) };
        }
        throw new Error("SQL inesperado");
      }
    };
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({ success: true, hostname: "auth-test.example", action: "login" })
    );
    const response = await run("/api/auth/login", authEnv({ DB: db }), {
      email: "pessoa@example.com", password: "SenhaSegura2026!123", turnstileToken: "token"
    });
    expect(response.status).toBe(200);
    expect((await response.json()).usuario.email).toBe("pessoa@example.com");
    expect(response.headers.get("Set-Cookie")).toContain("HttpOnly");
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("login com senha errada nao recebe cookie", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({ success: true, hostname: "auth-test.example", action: "login" })
    );
    const db = { prepare: () => ({ bind: () => ({ first: async () => null }) }) };
    const response = await run("/api/auth/login", authEnv({ DB: db }), {
      email: "pessoa@example.com", password: "senha-incorreta", turnstileToken: "token"
    });
    expect(response.status).toBe(401);
    expect(response.headers.has("Set-Cookie")).toBe(false);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("cadastro com origem e captcha validos cadastra usuario e nao retorna hash", async () => {
    const db = { prepare: () => ({ bind: () => ({}) }), batch: vi.fn(async () => []) };
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({ success: true, hostname: "auth-test.example", action: "register" })
    );
    const response = await run("/api/auth/register", authEnv({ DB: db }), {
      name: "Pessoa", email: "Pessoa@Example.com",
      password: "SenhaSegura2026!123", turnstileToken: "token"
    });
    expect(response.status).toBe(201);
    const payload = await response.json();
    expect(payload.usuario.email).toBe("pessoa@example.com");
    expect(payload.usuario.password_hash).toBeUndefined();
    expect(db.batch).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("consulta de sessao nao revela dados apos erro no D1", async () => {
    const db = { prepare: () => { throw Error("falha privada"); } };
    const response = await worker.fetch(req("/api/auth/me", "GET", null, {
      Cookie: "__Host-thiagoia_session=" + "a".repeat(64)
    }), authEnv({ DB: db }));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      erro: "Autenticação temporariamente indisponível."
    });
  });

  it("logout com falha no banco nao revela detalhes", async () => {
    const db = { prepare: () => { throw Error("falha privada"); } };
    const response = await run("/api/auth/logout", authEnv({ DB: db }), {}, {
      Cookie: "__Host-thiagoia_session=" + "a".repeat(64)
    });
    expect(response.status).toBe(503);
    expect((await response.json()).erro).toBe("Logout temporariamente indisponível.");
  });
});

describe("Protecoes de entrada da geracao de HTML", () => {
  it("impede geracao desativada e chave Gemini ausente", async () => {
    expect((await run("/gerar", generateEnv({ ENABLE_GENERATION: "false" }))).status).toBe(503);
    expect((await run("/gerar", generateEnv({ GEMINI_API_KEY: undefined }))).status).toBe(503);
  });
  it("rejeita content-type e tamanho de requisicao sem chamar a IA", async () => {
    expect((await run("/gerar", generateEnv(), "x", { "Content-Type": "text/plain" })).status).toBe(415);
    expect((await run("/gerar", generateEnv(), {}, { "Content-Length": "5000" })).status).toBe(413);
    expect((await run("/gerar", generateEnv(), "x".repeat(4100))).status).toBe(413);
    expect((await run("/gerar", generateEnv(), "{invalid")).status).toBe(400);
  });
  it.each([
    {}, { descricao: null }, { descricao: "x" }, { descricao: "z".repeat(501) }
  ])("exige descricao entre 5 e 500 caracteres", async body => {
    expect((await run("/gerar", generateEnv(), body)).status).toBe(400);
  });
  it("rejeita limite indisponivel e Turnstile sem segredo", async () => {
    expect((await run("/gerar", generateEnv({ LIMITE_GERACAO: null }), { descricao: DESC })).status).toBe(503);
    expect((await run("/gerar", generateEnv(), { descricao: DESC, turnstileToken: "token" })).status).toBe(503);
  });
  it("rejeita controle de cota diaria indisponivel apos Turnstile valido", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({ success: true, hostname: "auth-test.example" })
    );
    const response = await run("/gerar", generateEnv({
      TURNSTILE_SECRET_KEY: "ficticio"
    }), { descricao: DESC, turnstileToken: "token" });
    expect(response.status).toBe(503);
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
