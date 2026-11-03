
import { describe, it, expect } from "vitest";
import { env } from "cloudflare:test";
import worker from "../worker/index.js";

import schema from "./fixtures/auth_schema.sql?raw";

import { registerUser } from "../worker/auth/register.js";
import { loginUser } from "../worker/auth/login.js";
import { getSession } from "../worker/auth/session.js";

describe("Integracao real com D1 isolado", () => {
  it("valida cadastro, login, sessao e logout HTTP", async () => {
    const db = env.DB;

    // 1. Confirmar a conexao D1.
    expect(db).toBeDefined();

    const conexao = await db
      .prepare("SELECT 1 AS conectado")
      .first();

    expect(conexao?.conectado).toBe(1);

    // 2. Preparar o esquema SQL.
    const schemaLimpo = schema
      .split("\n")
      .filter((linha) => !linha.trim().startsWith("--"))
      .join("\n");

    const comandos = schemaLimpo
      .split(";")
      .map((comando) => comando.trim())
      .filter(Boolean);

    for (const sql of comandos) {
      try {
        await db.prepare(sql).run();
      } catch (error) {
        console.error(
          "Falha na instrucao SQL:",
          sql.slice(0, 300)
        );
        throw error;
      }
    }

    // 3. Cadastrar um usuario ficticio.
    const email = "integracao-d1@example.com";
    const password = "SenhaTesteD1Segura2026!";

    const cadastro = await registerUser(db, {
      name: "Usuario Teste D1",
      email,
      password
    });

    expect(cadastro.status).toBe(201);
    expect(cadastro.user.email).toBe(email);

    // 4. Confirmar armazenamento protegido da senha.
    const credencial = await db
      .prepare(`
        SELECT password_hash
        FROM user_credentials
        WHERE user_id = ?
      `)
      .bind(cadastro.user.id)
      .first();

    expect(credencial).not.toBeNull();
    expect(credencial.password_hash).not.toBe(password);

    // 5. Realizar login.
    const login = await loginUser(db, {
      email,
      password
    });

    expect(login.status).toBe(200);
    expect(login.user.id).toBe(cadastro.user.id);

    expect(login.cookie).toContain("HttpOnly");
    expect(login.cookie).toContain("Secure");

    // 6. Recuperar o token da sessao.
    const cookieSessao = login.cookie.split(";")[0];

    const token = cookieSessao.substring(
      cookieSessao.indexOf("=") + 1
    );

    expect(token).toMatch(/^[0-9a-f]{64}$/);

    // 7. Confirmar que a sessao esta ativa.
    const sessao = await getSession(db, token);

    expect(sessao).not.toBeNull();
    expect(sessao.user_id).toBe(cadastro.user.id);
    
    // Criar segunda sessao para o mesmo usuario.
    const loginB = await loginUser(db, {
      email,
      password
    });

    expect(loginB.status).toBe(200);

    const cookieB = loginB.cookie.split(";")[0];
    const tokenB = cookieB.substring(
      cookieB.indexOf("=") + 1
    );

    expect(tokenB).not.toBe(token);

    const sessaoB = await getSession(db, tokenB);

    expect(sessaoB).not.toBeNull();
    expect(sessaoB.user_id).toBe(cadastro.user.id);
    expect(sessaoB.id).not.toBe(sessao.id);


    // 8. Executar logout pelo handler HTTP.
    const origem = "https://auth-test.example";

    const respostaLogout = await worker.fetch(
      new Request(`${origem}/api/auth/logout`, {
        method: "POST",
        headers: {
          Origin: origem,
          Cookie: cookieSessao
        }
      }),
      { DB: db }
    );

    expect(respostaLogout.status).toBe(200);

    const corpoLogout = await respostaLogout.json();

    expect(corpoLogout.mensagem).toBe(
      "Sessão encerrada com sucesso."
    );

    // 9. Confirmar que o cookie foi limpo.
    const cookieLimpo = respostaLogout.headers.get(
      "Set-Cookie"
    );

    expect(cookieLimpo).not.toBeNull();
    expect(cookieLimpo).toMatch(/Max-Age=0/i);
    expect(cookieLimpo).toContain("HttpOnly");
    expect(cookieLimpo).toContain("Secure");

    // 10. Confirmar revogacao registrada no D1.
    const registro = await db
      .prepare(`
        SELECT revoked_at
        FROM user_sessions
        WHERE id = ?
      `)
      .bind(sessao.id)
      .first();

    expect(registro).not.toBeNull();
    expect(registro.revoked_at).not.toBeNull();

    // 11. Impedir reutilizacao do token.
    const sessaoRevogada = await getSession(db, token);

    expect(sessaoRevogada).toBeNull();

    // 12. Impedir segundo logout com o mesmo token.
    const segundaResposta = await worker.fetch(
      new Request(`${origem}/api/auth/logout`, {
        method: "POST",
        headers: {
          Origin: origem,
          Cookie: cookieSessao
        }
      }),
      { DB: db }
    );

    expect(segundaResposta.status).toBe(401);

    
    // Confirmar que a segunda sessao continua ativa.
    const sessaoBDepoisLogout = await getSession(
      db,
      tokenB
    );

    expect(sessaoBDepoisLogout).not.toBeNull();
    expect(sessaoBDepoisLogout.id).toBe(sessaoB.id);

    const registroB = await db.prepare(`
      SELECT revoked_at
      FROM user_sessions
      WHERE id = ?
    `).bind(sessaoB.id).first();

    expect(registroB).not.toBeNull();
    expect(registroB.revoked_at).toBeNull();

  });
});
