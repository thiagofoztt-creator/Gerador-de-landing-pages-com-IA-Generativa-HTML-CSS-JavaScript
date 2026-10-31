
import test from "node:test";
import assert from "node:assert/strict";
import {
  hashPassword,
  verifyPassword
} from "./password.js";

test("Senha correta deve ser aceita", async () => {
  const senha = "ThiagoIA-Teste-2026!";
  const resultado = await hashPassword(senha);

  assert.equal(
    await verifyPassword(senha, resultado.password_hash),
    true
  );
});

test("Senha incorreta deve ser rejeitada", async () => {
  const resultado = await hashPassword("SenhaCorreta123!");

  assert.equal(
    await verifyPassword("SenhaErrada123!", resultado.password_hash),
    false
  );
});

test("Hashes devem utilizar salts diferentes", async () => {
  const senha = "ThiagoIA-Teste-2026!";

  const primeiro = await hashPassword(senha);
  const segundo = await hashPassword(senha);

  assert.notEqual(
    primeiro.password_hash,
    segundo.password_hash
  );
});

test("Hash inválido deve ser rejeitado", async () => {
  assert.equal(
    await verifyPassword("SenhaQualquer123!", "hash-invalido"),
    false
  );
});

test("Senha curta deve ser rejeitada", async () => {
  await assert.rejects(
    hashPassword("123456"),
    /Senha fora dos limites permitidos/
  );
});
