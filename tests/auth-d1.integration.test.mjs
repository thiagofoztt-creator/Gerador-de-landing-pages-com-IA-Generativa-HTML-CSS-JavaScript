
import { describe, it, expect } from "vitest";
import { env } from "cloudflare:test";

import schema from "./fixtures/auth_schema.sql?raw";

import { registerUser } from "../worker/auth/register.js";
import { loginUser } from "../worker/auth/login.js";

import {
  getSession,
  revokeSession
} from "../worker/auth/session.js";

describe("Integracao real com D1 isolado", () => {
  it("valida cadastro, login, sessao e revogacao", async () => {
    const db = env.DB;

    // 1. Confirmar banco de testes
    expect(db).toBeDefined();

    const conexao = await db
      .prepare("SELECT 1 AS conectado")
      .first();

    expect(conexao.conectado).toBe(1);

    // 2. Criar estrutura SQL no D1 isolado
    await db.exec(schema);

    // 3. Cadastrar usuario ficticio
    const email = "integracao-d1@example.com";
    const password = "SenhaTesteD1Segura2026!";

    const cadastro = await registerUser(db, {
      name: "Usuario Teste D1",
      email,
      password
    });

    expect(cadastro.status).toBe(201);
    expect(cadastro.user.email).toBe(email);

    // 4. Confirmar credencial armazenada
    const credencial = await db.prepare(`
      SELECT password_hash
      FROM user_credentials
      WHERE user_id = ?
    `).bind(cadastro.user.id).first();

    expect(credencial).not.toBeNull();
    expect(credencial.password_hash).not.toBe(password);

    // 5. Realizar login
    const login = await loginUser(db, {
      email,
      password
    });

    expect(login.status).toBe(200);
    expect(login.user.id).toBe(cadastro.user.id);

    expect(login.cookie).toContain("HttpOnly");
    expect(login.cookie).toContain("Secure");

    // 6. Recuperar token da sessao
    const token = login.cookie
      .split(";")[0]
      .split("=")[1];

    expect(token).toMatch(/^[0-9a-f]{64}$/);

    // 7. Confirmar sessao ativa
    const sessao = await getSession(db, token);

    expect(sessao).not.toBeNull();
    expect(sessao.user_id).toBe(cadastro.user.id);

    // 8. Revogar sessao
    const revogada = await revokeSession(
      db,
      sessao.id
    );

    expect(revogada).toBe(true);

    // 9. Confirmar revogacao no D1
    const registro = await db.prepare(`
      SELECT revoked_at
      FROM user_sessions
      WHERE id = ?
    `).bind(sessao.id).first();

    expect(registro.revoked_at).not.toBeNull();

    // 10. Impedir reutilizacao do token
    const sessaoRevogada = await getSession(db, token);

    expect(sessaoRevogada).toBeNull();
  });
});
