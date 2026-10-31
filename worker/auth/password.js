
const ITERATIONS = 600000;
const ALGORITHM = "PBKDF2-SHA256";
const encoder = new TextEncoder();

function toHex(bytes) {
  return Array.from(bytes, b =>
    b.toString(16).padStart(2, "0")
  ).join("");
}

function fromHex(hex) {
  if (!/^[0-9a-f]+$/i.test(hex) || hex.length % 2 !== 0) {
    throw new Error("Formato de hash inválido.");
  }

  return Uint8Array.from(
    hex.match(/.{2}/g),
    b => parseInt(b, 16)
  );
}

async function derive(password, salt, iterations) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );

  return new Uint8Array(
    await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        salt,
        iterations,
        hash: "SHA-256"
      },
      key,
      256
    )
  );
}

export async function hashPassword(password) {
  if (
    typeof password !== "string" ||
    password.length < 12 ||
    encoder.encode(password).length > 256
  ) {
    throw new Error("Senha fora dos limites permitidos.");
  }

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derive(password, salt, ITERATIONS);

  return {
    password_hash: [
      ALGORITHM,
      ITERATIONS,
      toHex(salt),
      toHex(hash)
    ].join("$"),
    password_algorithm: ALGORITHM
  };
}

export async function verifyPassword(password, storedHash) {
  if (typeof password !== "string" ||
      typeof storedHash !== "string") return false;

  try {
    const parts = storedHash.split("$");

    if (parts.length !== 4 || parts[0] !== ALGORITHM) {
      return false;
    }

    const iterations = Number(parts[1]);
    if (iterations !== ITERATIONS) return false;

    const salt = fromHex(parts[2]);
    const expected = fromHex(parts[3]);

    if (salt.length !== 16 || expected.length !== 32) {
      return false;
    }

    const actual = await derive(password, salt, iterations);
    let difference = 0;

    for (let i = 0; i < actual.length; i++) {
      difference |= actual[i] ^ expected[i];
    }

    return difference === 0;
  } catch {
    return false;
  }
}
