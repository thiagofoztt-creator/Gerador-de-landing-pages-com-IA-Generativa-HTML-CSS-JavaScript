
import { hashPassword } from "./password.js";

const encoder = new TextEncoder();

export async function registerUser(db, input) {
  if (!db) {
    throw new Error("Banco indisponível.");
  }

  const name =
    typeof input?.name === "string"
      ? input.name.trim()
      : "";

  const email =
    typeof input?.email === "string"
      ? input.email.trim().toLowerCase()
      : "";

  const password = input?.password;

  if (name.length < 2 || name.length > 100) {
    return { status: 400, error: "Nome inválido." };
  }

  if (
    email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  ) {
    return { status: 400, error: "E-mail inválido." };
  }

  if (
    typeof password !== "string" ||
    password.length < 12 ||
    encoder.encode(password).length > 256
  ) {
    return {
      status: 400,
      error: "A senha deve ter pelo menos 12 caracteres."
    };
  }

  const id = crypto.randomUUID();

  const { password_hash, password_algorithm } =
    await hashPassword(password);

  try {
    await db.batch([
      db.prepare(`
        INSERT INTO users (id, email, display_name)
        VALUES (?, ?, ?)
      `).bind(id, email, name),

      db.prepare(`
        INSERT INTO user_credentials (
          user_id, password_hash, password_algorithm
        )
        VALUES (?, ?, ?)
      `).bind(id, password_hash, password_algorithm)
    ]);

    return {
      status: 201,
      user: { id, name, email }
    };
  } catch (error) {
    // Não expor detalhes internos do banco ao usuário.
    if (
      String(error?.message || "")
        .includes("UNIQUE constraint failed")
    ) {
      return {
        status: 409,
        error: "Não foi possível concluir o cadastro."
      };
    }

    console.error("Erro interno ao cadastrar usuário.");
    return {
      status: 503,
      error: "Cadastro temporariamente indisponível."
    };
  }
}
