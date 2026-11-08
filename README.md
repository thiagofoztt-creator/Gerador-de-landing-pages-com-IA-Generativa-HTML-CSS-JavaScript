# 🚀 Gerador de Landing Pages com IA

**Aplicação web para criação automática de landing pages profissionais utilizando Google Gemini e Cloudflare Workers.**

Projeto Full Stack desenvolvido para transformar descrições em linguagem natural em páginas HTML e CSS, com geração por inteligência artificial, prévia visual no navegador e mecanismos de segurança para controlar o consumo da API.

## Desenvolvimento — Versão 2.0

Nova interface do Gerador de Sites com IA.

- Interface visual roxa neon.
- Gemini como IA principal.
- GPT planejado como segunda opção.
- Editor visual em desenvolvimento.
- Ambiente de testes separado da produção.
### 🌐 Demonstração online

**[Acessar o Gerador de Landing Pages com IA](https://gerador-de-landing-pages-com-ia.thiagofoztt.workers.dev/)**

## 📌 Sobre o Projeto

O Gerador de Landing Pages com IA permite que usuários descrevam um site desejado e recebam uma interface gerada automaticamente.

A aplicação utiliza o modelo **Google Gemini 2.5 Flash**, integrado a um backend serverless hospedado no **Cloudflare Workers**.

O projeto contempla geração de interfaces, validação de entradas, proteção contra automações, limitação de requisições e persistência de cotas diárias.

## ✨ Funcionalidades

- ✅ Geração automática de landing pages com inteligência artificial.
- ✅ Criação de HTML5 e CSS3 a partir de descrições em português.
- ✅ Geração de layouts modernos e responsivos.
- ✅ Prévia visual das páginas geradas.
- ✅ Integração com Google Gemini 2.5 Flash.
- ✅ Proteção com Cloudflare Turnstile.
- ✅ Rate Limiting configurado para 20 requisições por minuto.
- ✅ Cota diária global de 50 reservas de geração.
- ✅ Armazenamento persistente com Durable Objects e SQLite.
- ✅ Validação de entradas e tratamento de erros HTTP.
- ✅ Proteção das chaves de API por meio de segredos do Cloudflare.
- ✅ Deploy integrado ao GitHub.

## 🛠️ Tecnologias Utilizadas

### Frontend

- HTML5
- CSS3
- JavaScript Vanilla
- Fetch API
- iframe com sandbox

### Backend e Infraestrutura

- Cloudflare Workers
- Cloudflare Workers Static Assets
- Cloudflare Wrangler
- Cloudflare Durable Objects
- SQLite Storage
- Cloudflare Rate Limiting
- Cloudflare Turnstile

### Inteligência Artificial

- Google Gemini API
- Gemini 2.5 Flash
- Engenharia de prompts
- Geração de código com IA

### Desenvolvimento

- Git
- GitHub
- APIs REST
- JavaScript assíncrono
- Arquitetura serverless

## 🏗️ Arquitetura do Sistema

O projeto utiliza frontend estático integrado a um backend serverless.

```text
            USUÁRIO
               |
               v
       FRONTEND HTML/CSS/JS
               |
               v
       CLOUDFLARE WORKER
               |
      +--------+---------+
      |                  |
      v                  v
  TURNSTILE         RATE LIMITING
      |                  |
      +--------+---------+
               |
               v
         DURABLE OBJECT
         COTA DIÁRIA
               |
               v
        GOOGLE GEMINI API
               |
               v
          HTML + CSS
               |
               v
        PREVIEW NO SITE
```

### Fluxo de funcionamento

1. O usuário informa uma descrição da página desejada.
2. O frontend valida o tamanho da descrição e obtém o token do Turnstile.
3. A solicitação é enviada ao endpoint `/gerar`.
4. O Cloudflare Worker valida a entrada e consulta o controle de requisições.
5. O backend verifica o token Turnstile.
6. O Durable Object reserva uma unidade da cota diária.
7. O Worker envia o prompt ao Gemini.
8. O HTML/CSS retornado é validado e encaminhado ao navegador.
9. O resultado é exibido em uma prévia visual isolada.

## 🤖 Configuração da Inteligência Artificial

Modelo utilizado:

```text
gemini-2.5-flash
```

Parâmetros configurados:

```javascript
generationConfig: {
  temperature: 0.6,
  maxOutputTokens: 16384,
  thinkingConfig: {
    thinkingBudget: 0
  }
}
```

O prompt orienta o modelo a produzir páginas com:

- Cabeçalho e navegação.
- Seção principal com chamada para ação.
- Cards de serviços ou funcionalidades.
- Conteúdo estruturado.
- Identidade visual consistente.
- Rodapé.
- Design responsivo.
- HTML semântico e CSS incorporado.

O código gerado não deve depender de JavaScript ou recursos externos.

A conclusão e a qualidade de cada geração dependem da resposta do modelo e das validações aplicadas.

## 🔒 Segurança e Controle de Consumo

### Cloudflare Turnstile

O frontend obtém um token de verificação que é validado no backend por meio do serviço Siteverify.

A validação verifica o resultado do desafio e o hostname associado ao token.

### Rate Limiting

O Cloudflare Rate Limiting está configurado com:

```text
Limite: 20 requisições
Período: 60 segundos
```

Esse mecanismo ajuda a reduzir o abuso da API, mas não representa uma cota global rigorosa entre todas as regiões da Cloudflare.

### Cota diária global

O projeto utiliza Durable Objects com armazenamento SQLite para controlar o total diário de reservas.

```text
Limite diário: 50 reservas
Contador compartilhado: gerador-global
Reinício: novo dia em UTC
```

Cada reserva autorizada consome uma unidade, mesmo quando uma geração não é concluída com sucesso.

### Proteção das credenciais

As credenciais da API Gemini e do Turnstile são armazenadas como segredos privados no ambiente de execução do Cloudflare.

As chaves não precisam estar presentes no código público do GitHub.

### Outras proteções

- Validação de descrições entre 5 e 500 caracteres.
- Restrição do tamanho das solicitações.
- Tratamento de erros HTTP.
- Controle de ativação por variável de ambiente.
- Prévia de HTML gerado em iframe com sandbox.

Essas medidas reduzem riscos, mas não substituem auditoria contínua de segurança.

## 📂 Estrutura do Projeto

```text
Gerador-de-landing-pages-com-IA/
│
├── public/
│   ├── index.html
│   ├── style.css
│   └── js/
│       └── script.js
│
├── worker/
│   └── index.js
│
├── wrangler.jsonc
├── package.json
├── server.js
├── .gitignore
└── README.md
```

**Principais componentes:**

- `public/index.html`: interface principal.
- `public/style.css`: identidade visual e responsividade.
- `public/js/script.js`: interação com usuário, Turnstile e prévia.
- `worker/index.js`: API Gemini, validações, limites e cota diária.
- `wrangler.jsonc`: configuração de implantação do Cloudflare.
- `server.js`: implementação anterior baseada em Node.js e Express, mantida no repositório.

A versão publicada utiliza o Cloudflare Worker, não o servidor Express antigo.

## 🔌 API de Geração

### Endpoint

```http
POST /gerar
Content-Type: application/json
```

### Exemplo de solicitação

```json
{
  "descricao": "Crie uma landing page moderna para uma empresa de tecnologia",
  "turnstileToken": "TOKEN_VALIDO"
}
```

### Exemplo de resposta

```json
{
  "codigo": "<!DOCTYPE html><html>...</html>"
}
```

A resposta inclui o HTML gerado, com os estilos CSS incorporados.

### Tratamento de erros

| HTTP | Significado |
|---|---|
| 400 | Descrição ou JSON inválido |
| 403 | Verificação Turnstile inválida |
| 413 | Solicitação muito grande |
| 429 | Limite de requisições ou cota atingido |
| 502 | Falha na geração ou validação da resposta |
| 503 | Geração desativada ou configuração indisponível |

## ☁️ Implantação no Cloudflare

O projeto está conectado ao GitHub e utiliza Wrangler para publicar o Worker e os arquivos estáticos.

Comando de implantação:

```bash
npx wrangler deploy
```

Para uma implantação própria, é necessário configurar os bindings definidos no `wrangler.jsonc` e cadastrar os seguintes valores no ambiente de Runtime:

```text
GEMINI_API_KEY
TURNSTILE_SECRET_KEY
ENABLE_GENERATION
```

O valor de `ENABLE_GENERATION` deve permanecer `false` até que as proteções e os limites estejam corretamente configurados.

**Nunca publique as chaves privadas no repositório.**

## 🧪 Testes e Validação

Durante o desenvolvimento foram realizados testes de:

- Publicação pelo GitHub e Cloudflare.
- Carregamento do frontend.
- Validação do Cloudflare Turnstile.
- Comunicação com a API Gemini.
- Geração de HTML e CSS.
- Renderização da prévia.
- Registro da cota diária em SQLite.
- Tratamento de respostas incompletas.
- Diagnóstico por logs do Cloudflare.

Foram observados registros de consumo da cota diária e resultados visuais de geração bem-sucedida.

A validação de responsividade em diferentes dispositivos, o bloqueio efetivo do rate limiting e testes automatizados abrangentes permanecem como melhorias recomendadas.

## 📈 Melhorias Futuras

- Histórico das páginas geradas.
- Exportação de HTML e CSS.
- Download do projeto completo.
- Biblioteca de templates.
- Temas e paletas personalizáveis.
- Ajustes de layout após a geração.
- Indicadores de utilização da API.
- Testes automatizados de frontend e backend.
- Melhorias de acessibilidade.
- Validação automatizada de HTML/CSS.

## 👨‍💻 Autor

**Thiago de Almeida Teles**

Projeto desenvolvido para demonstrar conhecimentos em desenvolvimento web, APIs REST, arquitetura serverless, segurança e Inteligência Artificial Generativa.

**Links:**

- [GitHub](https://github.com/thiagofoztt-creator)
- [LinkedIn](https://www.linkedin.com/in/thiago-de-almeida-teles-9924a13a5)
- [CSS Gerador com IA](https://thiagofoztt-creator.github.io/CSS-Gerador-com-IA/)

---

**Gerador de Landing Pages com IA — Transformando descrições em interfaces web com inteligência artificial.**
