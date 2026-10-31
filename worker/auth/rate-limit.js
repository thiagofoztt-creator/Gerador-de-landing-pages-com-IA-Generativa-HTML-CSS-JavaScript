
export async function checkAuthRateLimit(request, env, action) {
  if (!env.AUTH_RATE_LIMIT) {
    console.error("AUTH_RATE_LIMIT não configurado.");

    return {
      allowed: false,
      status: 503,
      error: "Autenticação temporariamente indisponível."
    };
  }

  const allowedActions = [
    "register",
    "login",
    "forgot-password"
  ];

  if (!allowedActions.includes(action)) {
    return {
      allowed: false,
      status: 400,
      error: "Operação de autenticação inválida."
    };
  }

  const ip = request.headers.get("CF-Connecting-IP");

  if (!ip) {
    return {
      allowed: false,
      status: 503,
      error: "Não foi possível validar a solicitação."
    };
  }

  try {
    const { success } = await env.AUTH_RATE_LIMIT.limit({
      key: `auth:${action}:${ip}`
    });

    if (!success) {
      return {
        allowed: false,
        status: 429,
        error: "Muitas tentativas. Tente novamente mais tarde."
      };
    }

    return { allowed: true };
  } catch (error) {
    console.error("Falha no limite de autenticação:", error);

    return {
      allowed: false,
      status: 503,
      error: "Autenticação temporariamente indisponível."
    };
  }
}
