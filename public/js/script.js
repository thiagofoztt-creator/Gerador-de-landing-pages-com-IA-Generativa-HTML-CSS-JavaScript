
document.addEventListener("DOMContentLoaded", () => {
  const botao = document.getElementById("btnGerar");
  const campo = document.getElementById("prompt");
  const status = document.getElementById("status");
  const resultado = document.getElementById("resultado");
  const preview = document.getElementById("preview");

  if (!botao || !campo || !status || !resultado || !preview) {
    console.error("Elementos da interface não encontrados.");
    return;
  }

  // Impede a execução de scripts na prévia gerada.
  preview.setAttribute("sandbox", "");

  botao.addEventListener("click", async () => {
    const descricao = campo.value.trim();

    // Validar a descrição.
    if (descricao.length < 5 || descricao.length > 500) {
      status.textContent =
        "Digite uma descrição entre 5 e 500 caracteres.";
      return;
    }

    // Obter o token Cloudflare Turnstile.
    let turnstileToken = "";

    try {
      turnstileToken = window.turnstile?.getResponse() || "";
    } catch (erro) {
      console.error("Erro no Turnstile:", erro);
    }

    if (!turnstileToken) {
      status.textContent =
        "Conclua a verificação de segurança.";
      return;
    }

    botao.disabled = true;
    status.textContent = "Gerando sua página...";
    resultado.style.display = "none";

    try {
      // Enviar descrição e token ao Cloudflare Worker.
      const resposta = await fetch("/gerar", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          descricao,
          turnstileToken
        })
      });

      const dados = await resposta.json();

      if (!resposta.ok) {
        throw new Error(
          dados.erro || "Erro ao gerar página."
        );
      }

      // Verificar a resposta da IA.
      if (
        typeof dados.codigo !== "string" ||
        !dados.codigo.trim()
      ) {
        throw new Error(
          "A IA não retornou código válido."
        );
      }

      // Mostrar a landing page gerada.
      preview.srcdoc = dados.codigo;
      resultado.style.display = "block";
      status.textContent = "Página gerada com sucesso!";

    } catch (erro) {
      status.textContent =
        erro.message || "Não foi possível gerar a página.";

      console.error("Erro na geração:", erro);

    } finally {
      // Reativar botão.
      botao.disabled = false;

      // Reiniciar o Turnstile para a próxima geração.
      if (window.turnstile) {
        try {
          window.turnstile.reset();
        } catch (erro) {
          console.error("Erro ao reiniciar Turnstile:", erro);
        }
      }
    }
  });
});
