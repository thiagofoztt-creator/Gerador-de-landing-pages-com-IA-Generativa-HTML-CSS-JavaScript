
import test from "node:test";
import assert from "node:assert/strict";

import { registerUser } from "./register.js";
import { verifyPassword } from "./password.js";

const EMAIL = "cadastro@exemplo.com";
const SENHA = "SenhaSeguraTeste2026!";

function criarBancoSimulado({
  duplicado = false
} = {}) {
  const registros = [];

  return {
    registros,

    db: {
      prepare(sql) {
        return {
          bind(...valores) {
            return { sql, valores };
          }
        };
      },

      async batch(operacoes) {
        if (duplicado) {
          throw new Error(
            "UNIQUE constraint failed: users.email"
          );
        }

        registros.push(...operacoes);

        return operacoes.map(() => ({
          success: true
        }));
      }
    }
  };
}

test("Cadastro válido cria usuário e credencial", async () => {
  const banco = criarBancoSimulado();

  const resultado = await registerUser(banco.db, {
    name: "Usuário Teste",
    email: EMAIL,
    password: SENHA
  });

  assert.equal(resultado.status, 201);
  assert.equal(resultado.user.email, EMAIL);
  assert.equal(banco.registros.length, 2);

  const credencial = banco.registros[1];

  assert.match(
    credencial.sql,
    /INSERT INTO user_credentials/
  );

  const passwordHash = credencial.valores[1];

  assert.notEqual(passwordHash, SENHA);

  assert.equal(
    await verifyPassword(SENHA, passwordHash),
    true
  );
});

test("Cadastro rejeita nome inválido", async () => {
  const banco = criarBancoSimulado();

  const resultado = await registerUser(banco.db, {
    name: "A",
    email: EMAIL,
    password: SENHA
  });

  assert.equal(resultado.status, 400);
  assert.equal(banco.registros.length, 0);
});

test("Cadastro rejeita senha curta", async () => {
  const banco = criarBancoSimulado();

  const resultado = await registerUser(banco.db, {
    name: "Usuário Teste",
    email: EMAIL,
    password: "123"
  });

  assert.equal(resultado.status, 400);
  assert.equal(banco.registros.length, 0);
});

test("Cadastro rejeita e-mail duplicado", async () => {
  const banco = criarBancoSimulado({
    duplicado: true
  });

  const resultado = await registerUser(banco.db, {
    name: "Usuário Teste",
    email: EMAIL,
    password: SENHA
  });

  assert.equal(resultado.status, 409);
  assert.equal(resultado.user, undefined);
});

test("Cadastro impede operação sem banco", async () => {
  await assert.rejects(
    registerUser(null, {
      name: "Usuário Teste",
      email: EMAIL,
      password: SENHA
    }),
    /Banco indisponível/
  );
});
