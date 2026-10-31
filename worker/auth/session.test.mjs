
import test from "node:test";
import assert from "node:assert/strict";

import {
  createSession,
  getSession,
  revokeSession,
  readSessionCookie,
  clearSessionCookie
} from "./session.js";

function fakeDB() {
  const sessions = new Map();

  return {
    prepare(sql) {
      let args = [];

      const query = {
        bind(...values) {
          args = values;
          return query;
        },

        async run() {
          if (sql.includes("INSERT INTO user_sessions")) {
            const [id, userId, hash, expiresAt] = args;

            sessions.set(hash, {
              id,
              user_id: userId,
              token_hash: hash,
              expires_at: expiresAt,
              revoked_at: null
            });

            return { meta: { changes: 1 } };
          }

          if (sql.includes("UPDATE user_sessions")) {
            const [id] = args;
            const session = [...sessions.values()]
              .find(item => item.id === id && !item.revoked_at);

            if (!session) return { meta: { changes: 0 } };

            session.revoked_at = new Date().toISOString();
            return { meta: { changes: 1 } };
          }

          throw new Error("SQL não esperado.");
        },

        async first() {
          if (!sql.includes("FROM user_sessions")) {
            throw new Error("SQL não esperado.");
          }

          const [hash, now] = args;
          const session = sessions.get(hash);

          if (
            !session ||
            session.revoked_at ||
            session.expires_at <= now
          ) {
            return null;
          }

          return {
            id: session.id,
            user_id: session.user_id,
            expires_at: session.expires_at
          };
        }
      };

      return query;
    },

    sessions
  };
}

test("Criar e identificar sessão", async () => {
  const db = fakeDB();
  const created = await createSession(db, "usuario-teste");

  assert.match(created.cookie, /HttpOnly/);
  assert.match(created.cookie, /Secure/);
  assert.match(created.cookie, /SameSite=Lax/);

  const request = new Request("https://exemplo.com", {
    headers: { Cookie: created.cookie.split(";")[0] }
  });

  const token = readSessionCookie(request);
  const session = await getSession(db, token);

  assert.equal(session.user_id, "usuario-teste");
});

test("Token inválido deve ser rejeitado", async () => {
  const db = fakeDB();
  assert.equal(await getSession(db, "token-invalido"), null);
});

test("Sessão expirada deve ser rejeitada", async () => {
  const db = fakeDB();
  const created = await createSession(db, "usuario-teste");

  const token = created.cookie.split("=")[1].split(";")[0];

  for (const session of db.sessions.values()) {
    session.expires_at = "2020-01-01T00:00:00.000Z";
  }

  assert.equal(await getSession(db, token), null);
});

test("Sessão revogada não deve ser aceita", async () => {
  const db = fakeDB();
  const created = await createSession(db, "usuario-teste");

  const token = created.cookie.split("=")[1].split(";")[0];
  const session = await getSession(db, token);

  assert.equal(await revokeSession(db, session.id), true);
  assert.equal(await getSession(db, token), null);
});

test("Logout deve limpar o cookie", () => {
  const cookie = clearSessionCookie();

  assert.match(cookie, /Max-Age=0/);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /Secure/);
});
