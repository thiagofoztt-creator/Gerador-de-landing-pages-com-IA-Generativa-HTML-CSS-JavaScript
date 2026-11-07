# Projetos por usuario — D1 de homologacao

Status: **API e interface implementadas na branch desenvolvimento-sites-v2; ainda nao ativadas no ambiente remoto.**

## Bancos e isolamento

- `thiagoia-dev`: banco preexistente com usuarios/sessoes e tabela `projects` SEM `revision`. Nao executar a migracao nesse banco.
- `thiagoia-hml`: banco independente criado pelo usuario no Cloudflare. Foram criados manualmente `users`, `user_credentials`, `user_sessions`, `idx_sessions_user`, `projects` (com `revision`) e `idx_projects_user_updated`. A execucao do ultimo indice foi informada como concluida; conferir o schema antes da ativacao.
- A configuracao `wrangler.jsonc` ainda aponta o Preview para `thiagoia-dev`; **nao mudar nem ativar a flag ate a revisao de binding e teste em ambiente Preview**.
- A producao nao tem binding D1 `DB` configurado no painel visto anteriormente. Nao houve alteracao em producao nem merge na `main`.
- A tabela `user_projects` foi descartada do plano: a API e o banco de homologacao usam exclusivamente `projects`. O esquema de referencia para HML fica em `migrations/0001_projects_hml.sql`. **Nao executar esse arquivo no banco antigo.**

## Esquema de homologacao

`projects`: `id`, `user_id`, `name`, `html`, `revision`, `created_at`, `updated_at`.
Chave estrangeira `user_id` referenciando `users(id)`; indice `idx_projects_user_updated` em
`(user_id, updated_at DESC, id DESC)`. A API faz o filtro de `user_id` em todas as operacoes.

## API

Todas as operacoes usam sessao em cookie HttpOnly `__Host-thiagoia_session`.
O servidor determina `user_id`; o cliente nao pode escolher proprietario.

- `GET /api/projects`: lista ate 50 projetos (apenas metadados), com `nextCursor` para a proxima pagina.
- `POST /api/projects`: cria projeto com `name` (1–80 caracteres) e `html` (1–200000 caracteres).
- `GET /api/projects/:id`: carrega HTML e metadados do projeto pertencente ao usuario.
- `PUT /api/projects/:id`: exige `expectedRevision`; impede sobrescrita concorrente com HTTP 409.
- `DELETE /api/projects/:id`: remove somente projeto do proprietario.

POST/PUT/DELETE exigem `Origin` igual a origem da requisicao. JSON limitado
a 256 KiB, com leitura incremental; campos desconhecidos e `user_id` sao rejeitados.
Projetos de outras contas retornam 404.
As respostas usam `Cache-Control: no-store` e `X-Content-Type-Options: nosniff`.

## Interface e dados locais

Em `/projetos.html`, o usuario consulta seus projetos na nuvem manualmente e
pode copiar um projeto local apos confirmacao explicita. O registro no
`localStorage` nao e apagado. Em `/editor.html?cloud=<id>`, o editor busca
o projeto no servidor e salva na nuvem; `?project=<id>` continua local.
Na falha de rede, autenticacao, D1 ou conflito de revisao, nao se substitui
o projeto local. O HTML ainda aberto no editor pode ser salvo por download.

## Passos antes de ativar

1. Conferir no **thiagoia-hml** o resultado de `/tables`, `PRAGMA table_info(projects)`,
   `PRAGMA index_list(projects)`, `PRAGMA foreign_key_list(projects)`.
2. Registrar bookmark e obter backup independente do banco HML antes de alteracoes posteriores.
3. Alterar somente a configuracao Preview para `thiagoia-hml` apos validar os bindings;
   nunca atribuir esse banco a Production sem aprovacao explicita.
4. Criar contas de teste ficticias por fluxo de autenticacao; nunca copiar credenciais reais.
5. Verificar a API com duas contas autenticadas em navegador real (GET/POST/PUT/DELETE,
   isolamento, revogacao, 409), e testar preservacao dos projetos locais.
6. Somente apos homologacao, ativar `ENABLE_PROJECTS_D1=true` no Preview.
   A flag permanece fechada em producao.
7. Antes de qualquer alteracao no `thiagoia-dev`, definir plano distinto de
   migracao com backup e preservacao de dados existentes.

Testes automatizados D1 isolados verificam a estrutura de `projects`,
autenticacao, isolamento, paginacao e revisao. Eles **nao substituem** testes
end-to-end com o D1 remoto.
