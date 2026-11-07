# Projetos D1 por usuario — ativacao controlada

Status: **implementacao em branch de desenvolvimento; D1 remoto nao migrado**.

## Contrato da API

Todas as rotas usam sessao em cookie HTTP-only `__Host-thiagoia_session`.
Nunca aceitam `user_id` enviado pelo cliente. O filtro `user_id` e obrigatorio
nas operacoes de leitura, edicao e exclusao.

- `GET /api/projects`: lista ate 50 metadados por pagina; `nextCursor` para pagina seguinte.
- `POST /api/projects`: cria projeto com `name` (1–80 caracteres) e `html` (1–200000 caracteres).
- `GET /api/projects/:id`: carrega HTML e metadados do projeto do usuario.
- `PUT /api/projects/:id`: atualiza o projeto do usuario.
- `DELETE /api/projects/:id`: exclui projeto do usuario.

POST, PUT e DELETE exigem `Origin` igual a origem da requisicao (protecao CSRF).
Payload JSON limitado a 256 KiB, com leitura incremental; campos desconhecidos
ou `user_id` fornecido pelo cliente sao rejeitados. Projetos alheios retornam 404.
Resposta `Cache-Control: no-store` e `X-Content-Type-Options: nosniff`.

## Antes de liberar

1. Revisar e realizar backup do banco D1 de homologacao.
2. Executar SQL em `migrations/0001_user_projects.sql` **somente no ambiente autorizado**.
3. Confirmar que a tabela `users` e o vinculo `DB` estao corretos.
4. Rodar testes de isolamento e de regressao na CI.
5. Ativar `ENABLE_PROJECTS_D1=true` **somente apos** homologacao.
6. Validar que projetos locais nao sao apagados: migracao deve ser opcional,
   com confirmacao explicita e verificacao de resultado antes de limpar dados.

Enquanto a flag estiver desligada, a API devolve 503 e os projetos locais continuam
funcionando. Nenhuma migracao remota ou importacao automatica faz parte desta entrega.

## Observacoes

A API e uma fundacao para sincronizacao. A interface atual permanece
localStorage; integrar a migracao e a experiencia de sincronizacao sera
a etapa seguinte. O banco nao foi alterado remotamente.
