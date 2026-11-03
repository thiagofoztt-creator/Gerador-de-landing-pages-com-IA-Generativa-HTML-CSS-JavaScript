
import test from "node:test";
import assert from "node:assert/strict";

import { registerUser } from "./register.js";
import { loginUser } from "./login.js";
import { getSession, revokeSession } from "./session.js";

function criarBancoSimulado() {
  const usuarios = new Map();
  const credenciais = new Map();
  const sessoes = new Map();

  const db = {
    prepare(sql) {
      let valores = [];

      const consulta = {
        bind(...params) {
          valores = params;
          return consulta;
        },

        async first() {
          if (sql.includes("FROM users")) {
            const usuario = [...usuarios.values()]
              .find(u => u.email === valores[0]);

            if (!usuario) return null;

            return {
              ...usuario,
              password_hash: credenciais.get(usuario.id)
            };
          }

          if (sql.includes("FROM user_sessions")) {
            const sessao = [...sessoes.values()].find(s =>
              s.token_hash === valores[0] &&
              s.revoked_at === null &&
              s.expires_at > valores[1]
            );

            return sessao ?? null;
          }

          throw new Error("Consulta inesperada.");
        },

        async run() {
          if (sql.includes("INSERT INTO user_sessions")) {
            const [id, user_id, token_hash, expires_at] = valores;

            sessoes.set(id, {
              id,
              user_id,
              token_hash,
              expires_at,
              revoked_at: null
            });

            return { meta: { changes: 1 } };
          }

          if (sql.includes("UPDATE user_sessions")) {
            const sessao = sessoes.get(valores[0]);

            if (!sessao || sessao.revoked_at !== null) {
              return { meta: { changes: 0 } };
            }

            sessao.revoked_at = new Date().toISOString();
            return { meta: { changes: 1 } };
          }

          throw new Error("Operação inesperada.");
        }
      };

      return consulta;
    },

    async batch(operacoes) {
      const [usuarioOp, credencialOp] = operacoes;
      const [id, email, display_name] = usuarioOp.valores;
      const [user_id, password_hash] = credencialOp.valores;

      if (usuarios.has(email)) {
        throw new Error("UNIQUE constraint failed: users.email");
      }

      usuarios.set(email, { id, email, display_name });
      credenciais.set(user_id, password_hash);

      return [{ success: true }, { success: true }];
    }
  };

  // Adaptador para simular as operações parametrizadas
  const prepareOriginal = db.prepare.bind(db);

  db.prepare = (sql) => {
    const consulta = prepareOriginal(sql);
    const bindOriginal = consulta.bind.bind(consulta);

    consulta.bind = (...valores) => {
      bindOriginal(...valores);
      consulta.valores = valores;
      consulta.sql = sql;
      return consulta;
    };

    return consulta;
  };

  return db;
}

test("Ciclo completo: cadastro, login, sessão e logout", async () => {
  const db = criarBancoSimulado();

  const email = "integracao@exemplo.com";
  const password = "SenhaDeIntegracao2026!";

  const cadastro = await registerUser(db, {
    name: "Usuário Integração",
    email,
    password
  });

  assert.equal(cadastro.status, 201);

  const login = await loginUser(db, {
    email,
    password
  });

  assert.equal(login.status, 200);
  assert.equal(login.user.email, email);
  assert.match(login.cookie, /HttpOnly/);
  assert.match(login.cookie, /Secure/);

  const token = login.cookie.split(";")[0].split("=")[1];
  const sessao = await getSession(db, token);

  assert.ok(sessao);
  assert.equal(sessao.user_id, cadastro.user.id);

  const revogada = await revokeSession(db, sessao.id);
  assert.equal(revogada, true);

  const sessaoDepoisLogout = await getSession(db, token);
  assert.equal(sessaoDepoisLogout, null);
});
