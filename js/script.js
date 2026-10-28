
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

  // Impede scripts no conteúdo gerado pela IA.
  preview.setAttribute("sandbox", "");

  botao.addEventListener("click", async () => {
    const descricao = campo.value.trim();

    if (descricao.length < 5 || descricao.length > 500) {
      status.textContent =
        "Digite uma descrição entre 5 e 500 caracteres.";
      return;
    }

    botao.disabled = true;
    status.textContent = "Gerando sua página...";
    resultado.style.display = "none";

    try {
      const resposta = await fetch("/gerar", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ descricao })
      });

      const dados = await resposta.json();

      if (!resposta.ok) {
        throw new Error(dados.erro || "Erro ao gerar página.");
      }

      if (typeof dados.codigo !== "string" || !dados.codigo.trim()) {
        throw new Error("A IA não retornou código válido.");
      }

      preview.srcdoc = dados.codigo;
      resultado.style.display = "block";
      status.textContent = "Página gerada com sucesso!";

    } catch (erro) {
      status.textContent =
        erro.message || "Não foi possível gerar a página.";
      console.error("Erro:", erro);
    } finally {
      botao.disabled = false;
    }
  });
});
