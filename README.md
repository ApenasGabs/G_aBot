# G_aBot - Bot de Ofertas no WhatsApp

Bot de WhatsApp focado em ofertas e cupons, com filtros por usuario, fluxo de sugestoes, painel admin e modulo de Jornal de Ofertas (scraping + PDF + OCR + historico de precos).

Versao atual do projeto: v0.3.3

## Visao Geral

O bot faz 3 frentes principais:

1. Monitoramento de mensagens de grupos/canais para detectar cupons e disparar alertas para quem segue filtros.
2. Atendimento em chat privado com comandos rapidos para filtros, cupons e colaboracao.
3. Operacao do modulo Jornal de Ofertas, com atualizacao automatica e consultas por categoria/termo.

## Stack Atual

- Runtime: Node.js (ESM)
- Bot WhatsApp: @whiskeysockets/baileys
- Banco local: SQLite via better-sqlite3
- Configuracao: dotenv
- Scraping e parsing: axios, cheerio, pdf-parse, pdfjs-dist
- OCR: tesseract.js (fallback) + utilitarios Poppler quando disponiveis
- Utilitarios: qrcode-terminal, link-preview-js
- Processo em producao: PM2 (via ecosystem.config.cjs)

Dependencias em package.json:

- @whiskeysockets/baileys
- better-sqlite3
- dotenv
- link-preview-js
- qrcode-terminal
- cheerio
- axios
- pdf-parse
- tesseract.js
- pdfjs-dist

## Requisitos Para Rodar

## Obrigatorios

- Node.js 20+
- npm ou pnpm
- Acesso ao WhatsApp para escanear QR na primeira execucao

## Recomendados (modulo Jornal)

- Poppler utils no sistema (pdftotext, pdfinfo, pdftoppm) para melhorar extracao/diagnostico de PDF
- CPU e RAM suficientes para OCR quando necessario

## Opcionais

- Ollama local/remoto para parser de cupom com IA
- PM2 para manter processo em producao

## Instalacao e Execucao

1. Instale as dependencias:

```bash
npm install
```

1. Configure variaveis de ambiente:

```bash
cp .env.example .env
```

1. Suba o bot:

```bash
npm start
```

Atalhos uteis:

```bash
npm run dev
npm run check
npm run test
```

Scripts especificos do modulo Jornal:

```bash
npm run check:jornal
npm run test:jornal
npm run build:jornal-categorias
```

PM2:

```bash
npm run pm2:start
npm run pm2:stop
npm run pm2:restart
npm run pm2:logs
npm run pm2:status
```

## Configuracao (.env)

Baseie-se em .env.example. Variaveis principais:

## Bot/Admin

- BOT_ADMIN_GROUP_ID: grupo admin para notificacoes
- BOT_ALLOW_SYSTEM_REBOOT: libera reboot via comando admin sys
- BOT_ALLOW_SUDO_COMMANDS: libera comandos com sudo via admin sys
- BOT_SUDO_PASSWORD: senha para comandos sudo no fluxo admin

## IA (Ollama)

- COUPON_AI_ENABLED
- COUPON_AI_BASE_URL
- COUPON_AI_MODEL
- COUPON_AI_TIMEOUT
- OLLAMA_AUTO_START
- OLLAMA_AUTO_PULL_MODELS
- OLLAMA_FALLBACK_MODELS
- OLLAMA_DEFAULT_INSTANCE
- OLLAMA_LOCAL_START_COMMAND
- OLLAMA_LOCAL_STOP_COMMAND
- OLLAMA_LOCAL_RESTART_COMMAND
- OLLAMA_INSTANCES_JSON

## Jornal/retencao

- JORNAL_SCHEDULER_INTERVAL_MS (intervalo do scheduler)
- JORNAL_PDF_CACHE_TTL_MS (cache de PDF)
- PROCESSED_OFFERS_TTL_DAYS (limpeza de dados processados)

Variaveis de teste do jornal (uso tecnico):

- JORNAL_TEST_PAGE_SAMPLING
- JORNAL_TEST_PAGE_SAMPLING_RETRY_RANDOM
- JORNAL_TEST_GEOMETRIC_FALLBACK

## Estrutura do Projeto (resumo)

```text
G_aBot/
├── gabot_ofertas.js              # bootstrap principal
├── ecosystem.config.cjs          # PM2
├── .env.example
├── src/
│   ├── bot/
│   │   ├── whatsapp.js           # conexao/eventos Baileys
│   │   ├── commands.js           # comandos privados de usuario
│   │   ├── adminCommands.js      # comandos admin
│   │   ├── commandParser.js      # parser moderno (+ - ? ! . g)
│   │   ├── menuTemplates.js      # menus/textos padronizados
│   │   └── ...
│   ├── db/
│   │   ├── schema.js
│   │   ├── repo.js
│   │   ├── offersRepo.js
│   │   └── migrationRunner.js
│   ├── services/
│   │   ├── journalService.js
│   │   ├── journalScheduler.js
│   │   ├── pdfExtractor.js
│   │   ├── couponExtractor.js
│   │   ├── aiCouponParser.js
│   │   └── ...
│   └── config.js
├── auth_info/                    # sessao do WhatsApp (nao versionar)
├── data/
│   ├── bot.db
│   ├── logs/
│   ├── backups/
│   └── pdfs/
└── docs/
```

## Menus e Itens Que o Bot Faz Hoje

## Menu principal (usuario)

Comando: menu ou /menu

Itens do menu atual:

- Filtros: + termo, + termo ate 3500, - termo, limpar, filtros
- Cupons: now, ? loja, seguir loja, lojas, compacto
- Outros: ! texto, g link, /jornal
- Ajuda completa: help

## Menu de ajuda (usuario)

Comando: help ou /help

Abrange:

- Filtros com lote (ex.: + item1, item2)
- Filtros com preco maximo (ex.: + item ate 3500)
- Cupons e lojas seguidas
- Modos de alerta (compacto e detalhado)
- Comandos de colaboracao (! e g)
- Compatibilidade legada (c1..c12, cf, cc, cs e comandos com /)

## Menu admin

Comando: /adm (ou aliases adm*)

Itens do painel admin:

- Gestao de fila: ok [id], no [id], adm2/ok ? para pendencias
- IA/Ollama: ia, ia reset [nome], . [pergunta]
- Sistema: stats, logs, gruposbot, sys help, sys ls, sys bot restart, sys confirmar
- Jornal: jornal ultimas, jornal buscar, jornal historico, jornal observar, jornal termos, jornal status

## Comandos de Usuario (atuais)

## Prefixos rapidos

- - termo: adicionar filtro
- - termo ate 3500 ou + termo <= 3500: filtro com preco maximo
- - termo: remover filtro
- ? loja: buscar cupom por loja
- ! texto: enviar sugestao geral
- g link: sugerir grupo de WhatsApp

## Atalhos/comandos de uso diario

- filtros ou list: listar filtros
- limpar ou /limparfiltros: remover todos os filtros
- now ou cupons: cupons recentes
- seguir [loja]: seguir cupons da loja
- parar [loja]: parar de seguir loja
- lojas: listar lojas seguidas
- alerta compacto ou compacto: modo de alerta resumido
- alerta detalhado ou detalhado: modo completo
- /jornal [query]: consultar ofertas do jornal

## Comandos do Jornal para Usuario (chat privado)

- /jornal: ultimas ofertas
- /jornal categorias: lista categorias
- /jornal categoria [nome|indice]: filtra por categoria
- /jornal [categoria]: atalho para categoria
- /jornal [termo]: busca por nome de produto
- /jornal todas: lista ampliada (ultimos 7 dias)

## Comandos de Admin (atuais)

## Moderacao de sugestoes

- ok g1 / ok s1: aprova sugestao
- no g1 / no s1: rejeita sugestao
- Lote: ok g1,g2,g3 e no s1,s2
- Wildcard: ok g*e no s*

## Operacao e diagnostico

- stats: status geral
- logs: ultimos logs
- gruposbot: grupos onde o bot participa
- sys [acao]: controle de terminal com confirmacao

## IA

- ia: menu/status das instancias
- ia status [nome]
- ia reset [nome]
- . [pergunta]: pergunta direta para IA

## Jornal (admin)

- jornal ultimas [n]
- jornal todas [n]
- jornal categorias
- jornal categoria [nome]
- jornal buscar [termo]
- jornal historico [id]
- jornal observar [termo]
- jornal parar [id]
- jornal termos
- jornal atualizar
- jornal status
- jornal limpar confirmar

## Comandos Legados Mantidos

Compatibilidade ativa com atalhos e comandos antigos:

- c1..c12
- cf1..cf3
- cc1..cc5
- cs1..cs2
- aliases admin adm0..adm20

## Fluxo de Operacao

1. whatsapp.js recebe evento de mensagem.
2. Mensagem privada vai para commandParser.js e commands.js.
3. Mensagem admin cai em adminCommands.js.
4. Mensagens de grupos/canais passam por matching + extracao de cupom.
5. Persistencia em SQLite (repo/offersRepo).
6. Logs estruturados e backup automatico.
7. Scheduler do jornal roda periodicamente e atualiza base de ofertas.

## Banco e Dados Gerados

- data/bot.db: usuarios, filtros, cupons, sugestoes, ofertas/historico
- data/logs: logs por contexto
- data/backups: backups do SQLite
- data/pdfs: PDFs baixados para processamento
- auth_info: credenciais de sessao do WhatsApp

## Documentacao Complementar

- BEST_PRACTICES.md
- OLLAMA_SETUP.md
- MODELOS_RECOMENDADOS.md
- docs/JORNAL_OFERTAS.md

## Troubleshooting Rapido

## QR nao aparece

- confira se o terminal permite renderizacao adequada
- reinicie o processo e verifique se a sessao em auth_info esta consistente

## Jornal sem resultados

- execute jornal atualizar (admin)
- valide conectividade com origem do jornal
- confira logs em data/logs

## IA nao responde

- confirme COUPON_AI_ENABLED=true
- valide COUPON_AI_BASE_URL e modelo
- teste comando admin ia status

## Licenca

MIT
