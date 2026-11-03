
import test from "node:test";
import assert from "node:assert/strict";
import { checkAuthRateLimit } from "./rate-limit.js";

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

test("Rate limit permite tentativa de login", async () => {
  const request = new Request("https://exemplo.com", {
    headers: { "CF-Connecting-IP": "192.0.2.10" }
  });

  let chaveRecebida;

  const env = {
    AUTH_RATE_LIMIT: {
      async limit({ key }) {
        chaveRecebida = key;
        return { success: true };
      }
    }
  };

  const resultado = await checkAuthRateLimit(
    request,
    env,
    "login"
  );

  assert.equal(resultado.allowed, true);
  assert.equal(chaveRecebida, "auth:login:192.0.2.10");
});

test("Rate limit bloqueia excesso de tentativas", async () => {
  const request = new Request("https://exemplo.com", {
    headers: { "CF-Connecting-IP": "192.0.2.10" }
  });

  const env = {
    AUTH_RATE_LIMIT: {
      async limit() {
        return { success: false };
      }
    }
  };

  const resultado = await checkAuthRateLimit(
    request,
    env,
    "login"
  );

  assert.equal(resultado.allowed, false);
  assert.equal(resultado.status, 429);
});

test("Rate limit indisponivel impede login", async () => {
  const request = new Request("https://exemplo.com", {
    headers: { "CF-Connecting-IP": "192.0.2.10" }
  });

  const resultado = await checkAuthRateLimit(
    request,
    {},
    "login"
  );

  assert.equal(resultado.allowed, false);
  assert.equal(resultado.status, 503);
});

      - name: Verificar cadastro habilitado no Preview
        shell: bash
        run: |
          BASE="https://desenvolvimento-sites-v2-gerador-de-landing-pages-com-ia.thiagofoztt.workers.dev"

          STATUS=$(curl -sS -o resposta-cadastro.json \
            -w "%{http_code}" \
            --max-time 20 \
            -X POST \
            -H "Origin: https://origem-invalida.example" \
            -H "Content-Type: application/json" \
            --data '{}' \
            "$BASE/api/auth/register")

          echo "HTTP: $STATUS"
          cat resposta-cadastro.json

          test "$STATUS" = "403"
          grep -q "Origem não autorizada" resposta-cadastro.json
});
