import express from "express";
import cors from "cors";
import "dotenv/config";
import { rateLimit } from "express-rate-limit";
import path from "node:path";
import { fileURLToPath } from "node:url";

console.log("CHAVE:");
console.log(process.env.GROQ_API_KEY ? "Carregada com sucesso" : "Não encontrada");

const app = express();
const PORT = 3000;
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";


app.use(express.json({ limit: "4kb" }));


const limiteGeracao = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    erro: "Limite de 5 solicitações por minuto atingido. Tente novamente mais tarde."
  }
});


const raiz = path.dirname(fileURLToPath(import.meta.url));

// Página principal
app.get("/", (req, res) => {
  res.sendFile(path.join(raiz, "index.html"));
});

// Estilos da aplicação
app.get("/style.css", (req, res) => {
  res.sendFile(path.join(raiz, "style.css"));
});

// JavaScript do frontend
app.get("/js/script.js", (req, res) => {
  res.sendFile(path.join(raiz, "js", "script.js"));
});


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

const descricaoValidada = descricao.trim();


        if (!process.env.GROQ_API_KEY) {
            return res.status(500).json({
                erro: "GROQ_API_KEY não encontrada no arquivo .env."
            });
        }

        const resposta = await fetch(GROQ_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${process.env.GROQ_API_KEY}`
            },
            body: JSON.stringify({
                model: "llama-3.3-70b-versatile",
                temperature: 0.8,
                messages: [
                    {
                        role: "system",
                        content: `
Você é um designer frontend sênior.
Crie uma landing page premium, moderna e responsiva.

Regras obrigatórias:
- Retorne apenas HTML completo
- Não use markdown
- Não escreva blocos com crases
- Não explique nada
- Inclua CSS interno dentro de <style>
- Use header, hero, cards, botões e footer
- Use cores modernas, sombras suaves, bordas arredondadas e responsividade
- Não use imagens quebradas
- Se precisar de imagem, use emojis, ícones, gradientes ou placeholders bonitos em CSS
`
                    },
                    {
                        role: "user",
                        content: `Crie uma landing page profissional e bonita sobre: ${descricaoValidada}`
                    }
                ]
            })
        });

        const dados = await resposta.json();

        if (!resposta.ok) {
            return res.status(500).json({
                erro: dados.error?.message || "Erro ao gerar conteúdo com IA."
            });
        }

        const codigoGerado = dados.choices?.[0]?.message?.content;

        return res.json({
            codigo: codigoGerado || "<h1>Não foi possível gerar o site.</h1>"
        });

    } catch (erro) {
        console.error("Erro no servidor:", erro);

        return res.status(500).json({
            erro: "Erro interno no servidor."
        });
    }
});

app.listen(PORT, () => {
    console.log("Servidor rodando:");
    console.log(`http://localhost:${PORT}`);
});
