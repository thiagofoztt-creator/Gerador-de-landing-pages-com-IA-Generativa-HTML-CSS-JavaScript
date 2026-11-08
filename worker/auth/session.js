
const SESSION_SECONDS = 60 * 60 * 24; // 24 horas
const COOKIE_NAME = "__Host-thiagoia_session";

function toHex(bytes) {
  return Array.from(bytes, byte =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

async function tokenHash(token) {
  const data = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return toHex(new Uint8Array(digest));
}

export async function createSession(db, userId) {
  if (!db || !userId) {
    throw new Error("Dados de sessão inválidos.");
  }

  const token = toHex(
    crypto.getRandomValues(new Uint8Array(32))
  );

  const id = crypto.randomUUID();
  const hash = await tokenHash(token);

  const expiresAt = new Date(
    Date.now() + SESSION_SECONDS * 1000
  ).toISOString();

  await db.prepare(`
    INSERT INTO user_sessions
      (id, user_id, token_hash, expires_at)
    VALUES (?, ?, ?, ?)
  `).bind(id, userId, hash, expiresAt).run();

  return {
    cookie: `${COOKIE_NAME}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_SECONDS}`,
    expiresAt
  };
}

export async function getSession(db, token) {
  if (
    !db ||
    typeof token !== "string" ||
    !/^[0-9a-f]{64}$/.test(token)
  ) {
    return null;
  }

  const hash = await tokenHash(token);

  return db.prepare(`
    SELECT id, user_id, expires_at
    FROM user_sessions
    WHERE token_hash = ?
      AND revoked_at IS NULL
      AND expires_at > ?
    LIMIT 1
  `).bind(hash, new Date().toISOString()).first();
}

export async function revokeSession(db, sessionId) {
  if (!db || !sessionId) return false;

  const result = await db.prepare(`
    UPDATE user_sessions
    SET revoked_at = CURRENT_TIMESTAMP
    WHERE id = ?
      AND revoked_at IS NULL
  `).bind(sessionId).run();

  return (result.meta?.changes || 0) > 0;
}

export function readSessionCookie(request) {
  const cookies = request.headers.get("Cookie") || "";
  const prefix = `${COOKIE_NAME}=`;

  for (const part of cookies.split(";")) {
    const item = part.trim();
    if (item.startsWith(prefix)) {
      return item.slice(prefix.length);
    }
  }

  return null;
}

export function clearSessionCookie() {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}
