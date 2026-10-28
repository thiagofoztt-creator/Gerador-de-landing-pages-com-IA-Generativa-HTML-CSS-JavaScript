import express from "express";
import cors from "cors";
import "dotenv/config";

console.log("CHAVE:");
console.log(process.env.GROQ_API_KEY ? "Carregada com sucesso" : "Não encontrada");

const app = express();
const PORT = 3000;
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

app.use(cors());
app.use(express.json());
app.use(express.static("./"));

app.post("/gerar", async (req, res) => {
    try {
        const { descricao } = req.body;

        if (!descricao) {
            return res.status(400).json({
                erro: "Descrição não enviada."
            });
        }

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
                        content: `Crie uma landing page profissional e bonita sobre: ${descricao}`
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
