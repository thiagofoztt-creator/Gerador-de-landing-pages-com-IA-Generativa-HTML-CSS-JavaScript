# Proposta de planos e creditos (ambiente de desenvolvimento)

Os valores sao propostas para futura venda do Thiago IA, **nao sao assinaturas comercialmente ativas**.

| Plano | Valor mensal proposto | Geracoes/mês |
| --- | ---: | ---: |
| Inicial | R$ 19,90 | 10 |
| Profissional | R$ 49,90 | 40 |
| Agencia | R$ 119,90 | 100 |

## Escopo deste primeiro incremento

- Modelo D1 para catalogo, assinaturas, periodos de creditos e eventos auditaveis.
- Restricoes de integridade para impedir saldo negativo, uso alem da franquia e multiplas assinaturas ativas.
- Testes isolados SQL e catalogo JS, sem acessar banco remoto.
- Nenhuma rota de pagamento, assinatura ou ativacao liberada publicamente.

## Regras que faltam implementar antes de vender

1. Confirmar preco/assinatura apenas com notificacao autenticada do provedor de pagamento.
2. Criar um periodo de creditos apenas apos pagamento confirmado; nao confiar em status enviado pelo navegador.
3. Consumir creditos por usuario com atualizacao condicional e idempotencia por request ID.
4. Vincular projetos no D1 ao user_id da sessao validada.
5. Cobrir cancelamento, renovacao, estorno, pagamentos repetidos e concorrencia.
6. Medir custo efetivo da IA e despesas antes de fixar os precos.
7. Configurar banco de producao separado e executar migracoes revisadas com backup.

**Nao executar tests/fixtures/billing_schema.sql nem billing_cycle_test.sql no banco remoto.**
