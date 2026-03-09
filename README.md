# G_aBot

Bot de WhatsApp com Baileys + SQLite para monitorar mensagens em grupos e encaminhar ofertas para usuarios com filtros cadastrados.

## 📋 Requisitos

- Node.js 20+
- npm ou pnpm

## 🚀 Instalação e Execução

### Instalar dependências

```bash
npm install
```

### Rodar localmente

```bash
npm start
```

### Modo de desenvolvimento (auto-reload)

```bash
npm run dev
```

### Com variáveis de ambiente

Para receber sugestões de grupos em um grupo de administração:

```bash
BOT_ADMIN_GROUP_ID="1203630xxxxxxxxx@g.us" npm start
```

Na primeira execução, escaneie o QR code no terminal.

### Arquivos gerados em runtime

- `auth_info/` - Sessão Baileys (credenciais do WhatsApp)
- `data/bot.db` - Banco de dados SQLite com filtros e cupons
- `data/logs/` - Logs de eventos (grupos e usuários)
- `data/backups/` - Backup automático do banco de dados

## 📁 Estrutura do Projeto

```
G_aBot/
├── src/
│   ├── bot/                 # Lógica principal do bot WhatsApp
│   │   ├── whatsapp.js     # Inicialização e gerenciamento da conexão Baileys
│   │   ├── commands.js     # Processamento de comandos em privado
│   │   ├── adminCommands.js # Comandos exclusivos de admin
│   │   ├── matching.js     # Busca de matches entre mensagens e filtros
│   │   └── unmappedMessageHandler.js # Armazena mensagens desconhecidas para análise
│   │
│   ├── db/                  # Gerenciamento de banco de dados
│   │   ├── repo.js         # Operações CRUD (Repository pattern)
│   │   └── schema.js       # Inicialização e estrutura do banco
│   │
│   ├── services/            # Serviços e integrações externas
│   │   ├── couponExtractor.js    # Extração de cupons do texto
│   │   ├── aiCouponParser.js     # Parser com IA (Ollama) para validação
│   │   ├── messageLogger.js      # Log estruturado de mensagens
│   │   ├── backupService.js      # Backup automático do banco
│   │   └── ollamaManager.js      # Gerenciamento do servidor Ollama
│   │
│   ├── utils/               # Funções utilitárias
│   │   ├── text.js         # Normalização, hash e detecção de tipos
│   │   └── queue.js        # Fila com throttle para envio de mensagens
│   │
│   └── config.js           # Configuração centralizada (env, paths, constantes)
│
├── gabot_ofertas.js        # Arquivo principal de entrada
├── ecosystem.config.cjs    # Configuração PM2 (produção)
├── package.json            # Dependências e scripts
├── .env.example            # Variáveis de ambiente (modelo)
└── README.md              # Este arquivo
```

## 🔧 Responsabilidades dos Módulos

### `src/bot/` - Núcleo do Bot
- **whatsapp.js**: Inicializa conexão com WhatsApp via Baileys, gerencia eventos (mensagens, conexão, desconexão)
- **commands.js**: Processa comandos de usuários (`/cadastro`, `/add`, `/filtros`, etc.)
- **adminCommands.js**: Comandos restritos a admin do bot
- **matching.js**: Valida se uma mensagem contém palavras-chave do usuário
- **unmappedMessageHandler.js**: Armazena mensagens em privado não reconhecidas para análise

### `src/db/` - Persistência de Dados
- **schema.js**: Define tabelas (usuários, filtros, cupons, logs)
- **repo.js**: Implementa operações no banco de dados (CRUD)

### `src/services/` - Integrações Externas
- **couponExtractor.js**: Extrai cupons e lojas de textos via regex
- **aiCouponParser.js**: Valida e estrutura cupons com IA (Ollama/Modelos locais)
- **messageLogger.js**: Registra mensagens em arquivos JSON (auditoria/debug)
- **backupService.js**: Realiza backup automático periódico do banco
- **ollamaManager.js**: Gerencia ciclo de vida do servidor Ollama

### `src/utils/` - Utilitários
- **text.js**: Normaliza texto, gera MD5 hash, detecta tipo de mensagem
- **queue.js**: Fila com throttle para evitar spam no WhatsApp

## 💬 Comandos do Bot

Todos os comandos funcionam **apenas em conversa privada** com o bot.

### Filtros de Ofertas
- `/cadastro` - Ativa seu cadastro no bot
- `/add [termo]` - Adiciona um filtro (receberá ofertas com esse termo)
- `/remover [termo]` - Remove um filtro existente
- `/meusfiltros` (aliases: `/filtros`, `/meuscadastros`) - Lista todos os seus filtros

### Cupons
- `/cupons` - Lista cupons recentes com indicadores de tempo
  - 🔥 Menos de 30 minutos
  - ⏰ Menos de 2 horas
  - 🧊 Mais de 24 horas
- `/cupom [loja]` - Busca cupons de uma loja específica
- `/seguircupom [loja]` - Cadastra interesse em cupons da loja
- `/pararcupom [loja]` - Remove interesse em cupons da loja
- `/meuscupons` - Lista lojas que você segue

### Outros
- `/` ou `/menu` ou `/ajuda` - Mostra menu completo de comandos
- `/sugerirgrupo [link-do-grupo]` - Sugere um grupo para monitoramento

## ⚙️ Regras de Funcionamento

- **Processamento de comandos**: Apenas em conversa privada com o bot
- **Monitoramento de grupos**: O bot monitora todas as mensagens de texto nos grupos
- **Deduplicação**: Cada mensagem é normalizada e hasheada (MD5) para evitar duplicatas
- **Alertas**: Quando um termo cadastrado é encontrado, o bot envia um alerta em privado através de uma fila (com throttle para evitar spam)
- **Compatibilidade**: O bot funciona com conexão persistente via Baileys (sem necessidade de API oficial)

## 📊 Fluxo de Dados

```
Grupo → Mensagem → Normalizar → Hash (MD5) → Buscar Matches → Alertar Usuário
                                                              ↓
                                                        Fila com Throttle
```

## 🛠️ Gerenciamento em Produção (PM2)

Iniciar o bot com PM2:

```bash
npm run pm2:start
```

Ver status:

```bash
npm run pm2:status
```

Ver logs em tempo real:

```bash
npm run pm2:logs
```

Parar o bot:

```bash
npm run pm2:stop
```

Reiniciar o bot:

```bash
npm run pm2:restart
```

## 🔍 Utilitários

Validar sintaxe do código:

```bash
npm run check
```

## 🌐 Integração com IA (Ollama)

O bot pode utilizar modelos de IA locais via Ollama para análise avançada de cupons e ofertas. Para configurar:

1. Veja [OLLAMA_SETUP.md](OLLAMA_SETUP.md) para instruções de instalação
2. Configure as variáveis de ambiente (`.env`)
3. Consulte [MODELOS_RECOMENDADOS.md](MODELOS_RECOMENDADOS.md) para modelos suited
