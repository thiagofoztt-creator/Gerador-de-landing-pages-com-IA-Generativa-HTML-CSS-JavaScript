
import test from "node:test";
import assert from "node:assert/strict";

import { loginUser } from "./login.js";
import { hashPassword } from "./password.js";

const EMAIL = "teste@exemplo.com";
const SENHA = "SenhaDeTesteSegura2026!";

async function prepararBanco() {
  const credencial = await hashPassword(SENHA);
  let sessoesCriadas = 0;

  const usuario = {
    id: "usuario-teste-1",
    email: EMAIL,
    display_name: "Usuário de Teste",
    password_hash: credencial.password_hash
  };

  const db = {
    prepare(sql) {
      let parametros = [];

      const consulta = {
        bind(...valores) {
          parametros = valores;
          return consulta;
        },

        async first() {
          if (!sql.includes("FROM users")) {
            throw new Error("Consulta inesperada.");
          }

          return parametros[0] === EMAIL ? usuario : null;
        },

        async run() {
          if (!sql.includes("INSERT INTO user_sessions")) {
            throw new Error("Operação inesperada.");
          }

          sessoesCriadas++;
          return { meta: { changes: 1 } };
        }
      };

      return consulta;
    }
  };

  return {
    db,
    quantidadeSessoes: () => sessoesCriadas
  };
}

test("Login válido cria uma sessão", async () => {
  const banco = await prepararBanco();

  const resultado = await loginUser(banco.db, {
    email: EMAIL,
    password: SENHA
  });

  assert.equal(resultado.status, 200);
  assert.equal(resultado.user.email, EMAIL);
  assert.equal(banco.quantidadeSessoes(), 1);
  assert.match(resultado.cookie, /HttpOnly/);
  assert.match(resultado.cookie, /Secure/);
});

test("Senha errada não cria sessão", async () => {
  const banco = await prepararBanco();

  const resultado = await loginUser(banco.db, {
    email: EMAIL,
    password: "SenhaIncorreta2026!"
  });

  assert.equal(resultado.status, 401);
  assert.equal(banco.quantidadeSessoes(), 0);
  assert.equal(resultado.cookie, undefined);
});

test("Usuário inexistente não cria sessão", async () => {
  const banco = await prepararBanco();

  const resultado = await loginUser(banco.db, {
    email: "inexistente@exemplo.com",
    password: SENHA
  });

  assert.equal(resultado.status, 401);
  assert.equal(banco.quantidadeSessoes(), 0);
});

test("Banco indisponível impede login", async () => {
  const resultado = await loginUser(null, {
    email: EMAIL,
    password: SENHA
  });

  assert.equal(resultado.status, 503);
  assert.equal(resultado.cookie, undefined);
});
