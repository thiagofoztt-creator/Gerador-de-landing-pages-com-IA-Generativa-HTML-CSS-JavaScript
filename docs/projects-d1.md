# Projetos D1 por usuario — ativacao controlada

Status: **implementacao em branch de desenvolvimento; D1 remoto nao migrado**.

## Contrato da API

Todas as rotas usam sessao em cookie HTTP-only `__Host-thiagoia_session`.
Nunca aceitam `user_id` enviado pelo cliente. O filtro `user_id` e obrigatorio
nas operacoes de leitura, edicao e exclusao.

- `GET /api/projects`: lista ate 50 metadados por pagina; `nextCursor` para pagina seguinte.
- `POST /api/projects`: cria projeto com `name` (1–80 caracteres) e `html` (1–200000 caracteres).
- `GET /api/projects/:id`: carrega HTML e metadados do projeto do usuario.
- `PUT /api/projects/:id`: atualiza o projeto do usuario, exigindo `expectedRevision` para impedir sobrescritas concorrentes (HTTP 409 em conflito).
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

A interface ja tem a area "Projetos na nuvem" (em /projetos.html),
carregada manualmente. Projetos locais nao sao enviados automaticamente:
a copia exige confirmacao individual e nao remove o original. O editor
abre projetos remotos usando `?cloud=<id>`, consulta o HTML no servidor
e salva somente na nuvem. O modo `?project=<id>` continua exclusivamente
local. Faltas de autenticacao, rede ou migracao nao acionam fallback para
outro armazenamento, evitando sobrescritas.

Atualizacoes remotas requerem o `expectedRevision` recebido no GET:
a tabela guarda `revision` inteiro, atualizado atomicamente. Se outra
sessao modificar antes, PUT retorna HTTP 409 sem substituir o HTML.
O editor mantem o texto nao salvo na tela para exportacao manual.

A migracao remota continua pendente e necessita backup e autorizacao.
A feature flag `ENABLE_PROJECTS_D1` nao e alterada automaticamente;
nenhum D1 remoto foi modificado. Usuario nao autenticado recebera
HTTP 401 somente apos a flag estar ativada. Na fase atual, a API fechada
retorna 503 antes de autenticar.

O plano de homologacao deve testar navegador real, backup dos projetos
locais, integracao do login e revisao de comportamento offline. Os
testes automatizados usam D1 isolado e DOM simulado, nao substituindo
testes end-to-end no navegador.
