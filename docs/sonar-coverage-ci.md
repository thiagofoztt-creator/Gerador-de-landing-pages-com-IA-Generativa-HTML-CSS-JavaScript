# Transicao controlada para SonarQube CI + cobertura real

O projeto usa SonarQube Cloud automatic analysis e obtem Quality Gate aprovado.
A analise automatica nao importa relatorios LCOV. O workflow CI com scanner foi
preparado mas permanece **desativado** ate a habilitacao explicita do administrador.

## Estado atual

- O workflow `.github/workflows/test-auth-vitest.yml` gera e valida `coverage/lcov.info`.
- Esse relatorio e disponibilizado como artifact `cobertura-worker-lcov` por 14 dias.
- O workflow `.github/workflows/sonar-coverage-ci.yml` somente roda se a
  variavel de repositorio `SONAR_CI_ENABLED` for exatamente `true`.
- Nenhum segredo e gravado em codigo. Nenhum banco de producao e acessado.

## Como habilitar quando estiver pronto

1. No SonarQube Cloud, confirme a conta com permissao de administrar o projeto.
2. No GitHub, crie a secret **SONAR_TOKEN** em Settings > Secrets and variables >
   Actions > Secrets. Use um token de analise criado no SonarQube Cloud.
3. No SonarQube Cloud, abra o projeto > Administration > Analysis Method e
   desative **Automatic Analysis**.
4. No GitHub, em Settings > Secrets and variables > Actions > Variables, crie
   a variavel `SONAR_CI_ENABLED` com valor `true`.
5. Execute o workflow pelo GitHub Actions (ou atualize o PR #1) e confira o
   resultado e a cobertura importada no painel do SonarQube.
6. Se der erro de acesso, confirme os identificadores de organizacao/projeto e
   as permissoes do token. Evite enviar tokens por mensagem ou commit.

**Atencao:** Se a analise automatica ficar ligada, o SonarQube recusa a
analise do scanner por CI. Nao ligue os dois mecanismos ao mesmo tempo.
Se a nova analise falhar, retorne a variavel a `false` e reative a analise
automatica ate corrigir a configuracao.

## Limites da medicao

Os percentuais de cobertura medidos pelo Vitest diferem dos valores do
SonarQube (que combina linhas e ramificacoes). Os testes precisam ser
ampliados antes de definir limites minimos globais.
