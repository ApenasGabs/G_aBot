# Relatorio de analise dos logs (cupons e interacoes)

Data: 17/04/2026  
Escopo analisado: `data/logs` (grupos, usuarios e diarios)

## 1) Resumo executivo

A analise dos logs mostrou que o principal motivo de "falha" de cupom percebida pelo usuario nao e bug tecnico do bot, e sim:

- cupom esgotado muito rapido;
- cupom com restricao de elegibilidade (Meli+, Prime, somente app, itens selecionados);
- comunicacao incompleta dessas regras na mensagem inicial.

Tambem ha sinais de atrito de interacao:

- repeticao de consultas semelhantes em janelas curtas;
- repeticao de mensagens/campanhas em canais diferentes;
- ruido entre "cupom invalido" e "cupom nao elegivel para meu perfil".

## 2) Evidencias encontradas

### 2.1 Cupons esgotados (falha explicita)

Exemplos reais em logs:

- `data/logs/groups/120363422459412678@g.us.jsonl` (mensagens de esgotado e frustracao)
- `data/logs/groups/120363423552727564@g.us.jsonl` (alertas repetidos de cupom esgotado)
- `data/logs/groups/120363336020038705@newsletter.jsonl` (multiplos cupons esgotados em sequencia)

Padrao observado: a janela de disponibilidade de alguns cupons e curta (minutos), com impacto direto na experiencia.

### 2.2 Restricoes de elegibilidade (falha percebida)

Exemplos:

- cupons marcados como exclusivos para assinantes Meli+;
- cupons exclusivos para Prime;
- cupons com regra "somente app";
- cupons validos apenas para itens/listas selecionadas.

Arquivos com ocorrencias representativas:

- `data/logs/groups/120363422829989243@g.us.jsonl`
- `data/logs/groups/120363424788862120@g.us.jsonl`
- `data/logs/groups/120363027620327191@g.us.jsonl`

### 2.3 Expiracao explicita

- Exemplo de cupom expirado em: `data/logs/groups/120363424459533668@g.us.jsonl`

### 2.4 Atrito de interacao

- Reconsultas de cupons em curto intervalo por usuario/admin sugerem baixa satisfacao com o primeiro retorno.
- Repeticao de blocos de mensagem em grupos/canais aumenta ruido e confusao de contexto.

Arquivo representativo de repeticao de consulta:

- `data/logs/users/250319334297657@lid.jsonl`

## 3) Diagnostico

Problema central: falta de separacao clara entre:

1. cupom realmente invalido/esgotado;
2. cupom valido, mas nao elegivel para aquele usuario (perfil/plataforma/plano);
3. cupom valido somente em condicoes adicionais (app, recorrencia, itens selecionados, limite por CPF).

Sem esse desambiguador, o usuario interpreta tudo como "o bot falhou".

## 4) Melhorias recomendadas (priorizadas)

### Prioridade alta (quick wins)

1. Rotulagem obrigatoria de elegibilidade no proprio texto do cupom
- Prefixos curtos e visiveis: `[MELI+] [PRIME] [APP] [ITENS] [NOVO USUARIO]`.
- Reduz tentativa invalida por falta de contexto.

2. Separar listagem de cupons por elegibilidade no comando
- Exemplo: "sem restricao", "Meli+", "Prime", "somente app".
- Melhora taxa de acerto na primeira tentativa.

3. Mensagem de erro orientada
- Trocar retorno generico por motivo objetivo:
  - "esgotado",
  - "exclusivo Meli+",
  - "somente app",
  - "item nao participante".

4. Anti-duplicacao de disparos
- Evitar republicar o mesmo bloco/cupom em janela curta no mesmo canal.

### Prioridade media

5. Perfil de elegibilidade por usuario
- Salvar preferencias/status (tem Prime? tem Meli+? usa app?) para filtrar resposta automaticamente.

6. Score de risco de esgotamento
- Classificar cupom como "alto risco de esgotar" com base em historico e horario.

7. Alertas preditivos de expirar/esgotar
- Aviso antes de cupom de alta demanda encerrar janela.

8. Painel de monitoramento de qualidade
- KPIs diarios para medir melhoria real.

## 5) KPIs sugeridos

- Taxa de falha percebida por 100 tentativas;
- Percentual de cupons com restricao explicita no texto;
- Tempo medio entre postagem e primeiro "esgotado";
- Taxa de reconsulta em ate 10 minutos;
- Taxa de mensagens duplicadas por grupo/canal.

## 6) Proximos passos tecnicos

1. Criar parser unico de logs para consolidar metricas automaticamente.
2. Gerar CSV diario de KPIs em `data/reports/kpi-cupom-diario.csv`.
3. Padronizar schema de evento para diferenciar:
- `coupon_failed_exhausted`
- `coupon_failed_ineligible`
- `coupon_failed_platform`
- `coupon_success`

---

Se quiser, no proximo passo eu ja implemento o gerador automatico desse relatorio (script Node) para voce rodar diariamente e salvar em `data/reports`.
