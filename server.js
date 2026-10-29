
import express from "express";
import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { rateLimit } from "express-rate-limit";

const app = express();
// Impedir a divulgação do framework nos cabeçalhos HTTP
app.disable("x-powered-by");

const PORT = process.env.PORT || 3000;

const MODELO = "gemini-2.5-flash";

const GEMINI_URL =
  `https://generativelanguage.googleapis.com/v1beta/models/${MODELO}:generateContent`;

const raiz = path.dirname(fileURLToPath(import.meta.url));

app.use(express.json({ limit: "4kb" }));

// Limitar requisições para reduzir abusos
const limiteGeracao = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    erro: "Limite de solicitações atingido. Tente novamente mais tarde."
  }
});

// Arquivos públicos autorizados
app.get("/", (req, res) => {
  res.sendFile(path.join(raiz, "index.html"));
});

app.get("/style.css", (req, res) => {
  res.sendFile(path.join(raiz, "style.css"));
});

app.get("/js/script.js", (req, res) => {
  res.sendFile(path.join(raiz, "js", "script.js"));
});

// API de geração com Google Gemini
app.post("/gerar", limiteGeracao, async (req, res) => {
  try {
    const descricao = req.body?.descricao;

    if (
      typeof descricao !== "string" ||
      descricao.trim().length < 5 ||
      descricao.trim().length > 500
    ) {
      return res.status(400).json({
        erro: "A descrição deve conter entre 5 e 500 caracteres."
      });
    }

    if (!process.env.GEMINI_API_KEY) {
      console.error("GEMINI_API_KEY não configurada.");

      return res.status(503).json({
        erro: "Serviço de IA indisponível."
      });
    }

    const prompt = `
Você é um desenvolvedor frontend e designer UI/UX experiente.

Crie uma landing page profissional, moderna e responsiva.

REGRAS:
- Retorne um documento HTML completo.
- Inclua o CSS dentro de <style>.
- Não utilize JavaScript.
- Não inclua scripts externos.
- Não utilize iframes.
- Não use imagens ou recursos externos.
- Utilize gradientes, ícones CSS e elementos visuais modernos.
- Crie header, hero, cards, botões e footer.
- Utilize design responsivo.
- Não utilize blocos Markdown.
- Retorne somente HTML válido.

DESCRIÇÃO DO USUÁRIO:
${descricao.trim()}
`;

    const resposta = await fetch(GEMINI_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": process.env.GEMINI_API_KEY
      },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: prompt }]
          }
        ],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 8192
        }
      }),
      signal: AbortSignal.timeout(60000)
    });

    const dados = await resposta.json();

    if (!resposta.ok) {
      console.error("Erro Gemini HTTP:", resposta.status);

      return res.status(
        resposta.status === 429 ? 429 : 502
      ).json({
        erro: resposta.status === 429
          ? "Limite da API Gemini atingido."
          : "Falha na comunicação com a IA."
      });
    }

    let codigoGerado = (
      dados.candidates?.[0]?.content?.parts || []
    )
      .map(parte => parte.text || "")
      .join("")
      .trim();

    // Remover eventuais marcadores Markdown
    
codigoGerado = codigoGerado.trim();

if (codigoGerado.startsWith("```")) {
  const quebra = codigoGerado.indexOf("\n");

  if (quebra !== -1) {
    const linguagem = codigoGerado
      .slice(3, quebra)
      .trim()
      .toLowerCase();

    if (linguagem === "" || linguagem === "html") {
      codigoGerado = codigoGerado.slice(quebra + 1).trim();
    }
  }
}

if (codigoGerado.endsWith("```")) {
  codigoGerado = codigoGerado.slice(0, -3).trim();
}


    if (
      !codigoGerado ||
      !/<html[\s>]/i.test(codigoGerado)
    ) {
      return res.status(502).json({
        erro: "A IA não retornou uma página HTML completa."
      });
    }

    return res.json({
      codigo: codigoGerado
    });

  } catch (erro) {
    console.error("Erro no servidor:", erro.message);

    return res.status(500).json({
      erro: "Não foi possível gerar a página."
    });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor disponível na porta ${PORT}`);
  console.log(`Modelo configurado: ${MODELO}`);
});
