
import { verifyPassword } from "./password.js";
import { createSession } from "./session.js";

export async function loginUser(db, input) {
  if (!db) {
    return { status: 503, error: "Serviço indisponível." };
  }

  const email =
    typeof input?.email === "string"
      ? input.email.trim().toLowerCase()
      : "";

  const password = input?.password;

  if (
    !email ||
    email.length > 254 ||
    typeof password !== "string" ||
    password.length > 256
  ) {
    return {
      status: 400,
      error: "Dados de acesso inválidos."
    };
  }

  try {
    const user = await db.prepare(`
      SELECT
        u.id,
        u.email,
        u.display_name,
        c.password_hash
      FROM users u
      JOIN user_credentials c ON c.user_id = u.id
      WHERE u.email = ?
      LIMIT 1
    `).bind(email).first();

    if (
      !user ||
      !(await verifyPassword(password, user.password_hash))
    ) {
      return {
        status: 401,
        error: "E-mail ou senha inválidos."
      };
    }

    const session = await createSession(db, user.id);

    return {
      status: 200,
      user: {
        id: user.id,
        email: user.email,
        name: user.display_name
      },
      cookie: session.cookie
    };
  } catch (error) {
    console.error("Falha interna no login.");

    return {
      status: 503,
      error: "Login temporariamente indisponível."
    };
  }
}
