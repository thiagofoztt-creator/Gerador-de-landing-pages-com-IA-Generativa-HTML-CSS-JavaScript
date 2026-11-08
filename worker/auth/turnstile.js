
export async function validateAuthTurnstile(
  request,
  env,
  token,
  expectedAction = "register"
) {
  if (!env.TURNSTILE_SECRET_KEY) {
    console.error("Turnstile de autenticação não configurado.");
    return false;
  }

  if (
    typeof token !== "string" ||
    token.length === 0 ||
    token.length > 2048
  ) {
    return false;
  }

  try {
    const url = new URL(request.url);

    const response = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          secret: env.TURNSTILE_SECRET_KEY,
          response: token,
          remoteip:
            request.headers.get("CF-Connecting-IP") ||
            undefined
        }),
        signal: AbortSignal.timeout(10000)
      }
    );

    if (!response.ok) return false;

    const result = await response.json();

    return (
      result.success === true &&
      result.hostname === url.hostname &&
      result.action === expectedAction
    );
  } catch (error) {
    console.error("Falha na validação do Turnstile.");
    return false;
  }
}
