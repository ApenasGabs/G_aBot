# G_aBot - Bot de Ofertas WhatsApp 🤖

Bot de WhatsApp com **Baileys + SQLite** para monitorar mensagens em grupos e encaminhar **ofertas e cupons** para usuários com filtros cadastrados.

**Versão:** v0.2.0 (Com Redesign de Interface)  
**Status:** 🟢 Pronto para Produção  
**Última Atualização:** 9 de março de 2026

---

## 📋 Requisitos

- **Node.js** 20+
- **npm** ou **pnpm**
- **Ollama** (opcional, para análise com IA)

---

## 🚀 Início Rápido

### 1. Instalar dependências

```bash
npm install
```

### 2. Rodar o bot

```bash
npm start          # Produção
npm run dev        # Desenvolvimento (auto-reload)
npm run check      # Verificar sintaxe
```

### 3. Primeira execução

Na primeira execução, **escaneie o QR code** no terminal com seu WhatsApp.

### 4. Variáveis de ambiente (opcional)

```bash
BOT_ADMIN_GROUP_ID="1203630xxxxxxxxx@g.us" npm start
```

Veja [.env.example](.env.example) para todas as variáveis.

---

## 📁 Estrutura do Projeto

```
G_aBot/
├── 📄 gabot_ofertas.js          # Arquivo principal
├── 📄 ecosystem.config.cjs       # Configuração PM2
│
├── 📂 src/
│   ├── 📂 bot/                   # Lógica do bot WhatsApp
│   │   ├── whatsapp.js          # Conexão Baileys
│   │   ├── commands.js          # Comandos de usuário ✨ ATUALIZADO
│   │   ├── adminCommands.js     # Comandos de admin ✨ ATUALIZADO
│   │   ├── commandParser.js     # ✨ NOVO: Parser moderno
│   │   ├── batchProcessor.js    # ✨ NOVO: Processador de lote
│   │   ├── menuTemplates.js     # ✨ NOVO: 27 templates de UI
│   │   ├── matching.js          # Match entre filtros e mensagens
│   │   └── unmappedMessageHandler.js
│   │
│   ├── 📂 db/
│   │   ├── repo.js              # CRUD de dados
│   │   └── schema.js            # Estrutura do banco
│   │
│   ├── 📂 services/
│   │   ├── couponExtractor.js   # Extração de cupons
│   │   ├── aiCouponParser.js    # Validação com IA
│   │   ├── messageLogger.js     # Log de mensagens
│   │   ├── backupService.js     # Backup automático
│   │   └── ollamaManager.js     # Gerenciamento Ollama
│   │
│   ├── 📂 utils/
│   │   ├── text.js              # Normalização de texto
│   │   └── queue.js             # Fila de envio
│   │
│   └── config.js
│
├── 📂 auth_info/                # Credenciais WhatsApp (gitignored)
├── 📂 data/
│   ├── bot.db                   # Banco SQLite
│   ├── 📂 logs/                 # Logs estruturados
│   └── 📂 backups/              # Backups automáticos
│
├── 📄 BEST_PRACTICES.md         # Guia de padrões de código
├── 📄 OLLAMA_SETUP.md           # Setup de IA local (Ollama)
└── 📄 MODELOS_RECOMENDADOS.md   # Modelos indicados por hardware
```

---

## 🎯 Comandos de Usuário

### ✨ Novos Prefixos (Redesign v0.2.0)

| Prefixo | Função | Exemplo | Suporta Lote? |
|---------|--------|---------|---------------|
| `+` | Adicionar filtro | `+ notebook, mouse` | ✅ Sim |
| `-` | Remover filtro | `- teclado` | ✅ Sim |
| `?` | Buscar cupom | `? amazon` | ✅ Sim |
| `!` | Enviar sugestão | `! melhorar isso` | ❌ Não |
| `.` | Chat com IA | `. qual é melhor?` | ❌ Não |
| `g` | Sugerir grupo | `g chat.whatsapp.com/...` | ❌ Não |

### 📌 Atalhos Rápidos

| Comando | Função |
|---------|--------|
| `list` ou `filtros` | Listar seus filtros ativos |
| `now` ou `cupons` | Ver cupons recentes |
| `seguir [loja]` | Receber alertas da loja |
| `parar [loja]` | Parar de receber alertas |
| `lojas` | Ver lojas que você segue |
| `help` | Ver guia completo |
| `/menu` | Menu principal |

### 🔄 Comandos Legacy (ainda funcionam 100%)

```
c1-12             # Sequencial global
cf1, cf2, cf3     # Filtros
cc1-5             # Cupons
cs1, cs2          # Sugestões

/add, /remover, /meusfiltros, /cupons, etc.
```

---

## 👮 Comandos de Admin

### ✨ Novos Comandos Simplificados

| Comando | Função | Exemplos |
|---------|--------|----------|
| `ok [id]` | Aprovar sugestão | `ok g1` ou `ok g1,g2,g3` ou `ok g*` |
| `no [id]` | Rejeitar sugestão | `no s1` ou `no s*` |
| `stats` | Status do bot | `stats` |
| `ia` | Menu Ollama | `ia` |
| `ia reset [modelo]` | Reiniciar modelo | `ia reset ollama` |

### 🎛️ Menu Admin

```
/adm                      # Menu principal
ok [id]                   # Aprovar (novo)
no [id]                   # Rejeitar (novo)
stats                     # Status (novo)
ia                        # Menu IA (novo)
adm2 ou /adm sugestoes   # Listar sugestões (legacy)
```

---

## 📊 Exemplos de Uso

### Usuário Comum

**Antes (Antigo):**
```
c3 notebook
c3 mouse
c3 teclado
```

**Depois (Novo):**
```
+ notebook, mouse, teclado
```

### Administrador

**Antes (Antigo):**
```
adm5 g1
adm5 g2
adm5 g3
```

**Depois (Novo - com lote):**
```
ok g1,g2,g3
```

**Depois (Novo - com wildcard):**
```
ok g*     # Aprova TODOS os grupos
no s*     # Rejeita TODAS as sugestões gerais
```

---

## 🔧 Responsabilidades dos Módulos

### `src/bot/` - Núcleo do Bot

| Arquivo | Responsabilidade |
|---------|------------------|
| **whatsapp.js** | Inicializa Baileys, gerencia eventos (mensagens, conexão) |
| **commands.js** | Processa comandos de usuários com novos prefixos |
| **adminCommands.js** | Comandos de admin com novos atalhos simplificados |
| **commandParser.js** | ✨ NEW: Parse moderno com suporte a prefixos |
| **batchProcessor.js** | ✨ NEW: Processa lotes com vírgula e wildcards |
| **menuTemplates.js** | ✨ NEW: 27 templates de mensagem centralizados |
| **matching.js** | Valida match entre filtros e mensagens |
| **unmappedMessageHandler.js** | Armazena mensagens desconhecidas |

### `src/db/` - Persistência

- **repo.js**: Operações CRUD (Repository pattern)
- **schema.js**: Estrutura das tabelas (users, keywords, coupons, logs)

### `src/services/` - Integrações Externas

- **couponExtractor.js**: Extrai cupons via regex
- **aiCouponParser.js**: Valida cupons com IA (Ollama)
- **messageLogger.js**: Log estruturado em JSON
- **backupService.js**: Backup automático do banco
- **ollamaManager.js**: Gerencia servidor Ollama

### `src/utils/` - Utilitários

- **text.js**: Normalização, hash, detecção de tipos
- **queue.js**: Fila com throttle para envio

---

## 📚 Documentação Essencial

- [BEST_PRACTICES.md](BEST_PRACTICES.md) - Padrões de código e manutenção.
- [OLLAMA_SETUP.md](OLLAMA_SETUP.md) - Instalação e configuração do Ollama.
- [MODELOS_RECOMENDADOS.md](MODELOS_RECOMENDADOS.md) - Escolha de modelos conforme hardware.

---

## ⚙️ Configuração

### Variáveis de Ambiente

Crie um arquivo `.env` com base em `.env.example`:

```env
# Opcional - ID do grupo admin para notificações
BOT_ADMIN_GROUP_ID=XXXXXXXXXXXX@g.us

# Opcional - Porta do Ollama
OLLAMA_PORT=11434
OLLAMA_HOST=http://localhost:11434
```

### PM2 (Produção)

```bash
npm run pm2:start      # Iniciar
npm run pm2:stop       # Parar
npm run pm2:restart    # Reiniciar
npm run pm2:logs       # Ver logs
npm run pm2:status     # Ver status
```

---

## 🎬 Fluxo de Operação

```
WhatsApp (Baileys)
       ↓
whatsapp.js (Event Handler)
       ↓
    [Tipo de Mensagem?]
       ├→ Privado → commandParser.js → commands.js
       ├→ Grupo → matching.js → couponExtractor.js → Usuário
       └→ Admin → adminCommands.js
       ↓
    [Valida & Database]
       ↓
    [Log & Backup]
       ↓
    Resposta para usuário
```

---

## 🔗 Fluxo de Novos Comandos (v0.2.0)

```
Entrada: "+ notebook, mouse, teclado"
    ↓
commandParser.js (Detecta prefixo "+")
    ↓
batchProcessor.js (Split por vírgula)
    ↓
Processa cada item via repo.js
    ↓
menuTemplates.js (Formata resposta)
    ↓
Retorna: "✅ 3 filtro(s) adicionado(s)"
```

---

## 📊 Arquivos de Dados

### `auth_info/` (Gitignored)
Credenciais do Baileys (não commitr!)

### `data/bot.db`
Banco de dados SQLite com:
- Usuários e filtros
- Cupons encontrados
- Histórico de sugestões

### `data/logs/`
Logs estruturados em JSON (auditoria)

### `data/backups/`
Backups automáticos diários

---

## 🚀 Deploy em Produção

### Com PM2

```bash
# Instalar PM2 globalmente
npm install -g pm2

# Iniciar com PM2
npm run pm2:start

# Ver logs em tempo real
npm run pm2:logs

# Restartar automaticamente
pm2 startup
pm2 save
```

### Com Docker (Opcional)

```bash
docker build -t gabot .
docker run -d --name gabot gabot
```

---

## 🐛 Troubleshooting

### "QR Code não aparece"
- Verifique se terminal suporta imagens (iTerm2, Windows Terminal)
- Tente em outro terminal

### "Bot desconecta frequently"
- Aumente timeout em `config.js`
- Verifique conexão de internet
- Veja `/data/logs/` para detalhes

### "Cupons não são encontrados"
- Verifique regex em `couponExtractor.js`
- Teste com mensagens conhecidas
- Habilite modo debug em `config.js`

---

## 📈 Estatísticas do Projeto

| Métrica | Valor |
|---------|-------|
| Arquivos de Código | 13 |
| Funcções Exportadas | 100+ |
| Linha de Código | 5000+ |
| Documentação | Enxuta e objetiva |
| Status | 🟢 Produção |

---

## 📝 Changelog

### v0.2.0 (9 Mar 2026) - ✨ REDESIGN
- ✨ Novos prefixos: +, -, ?, !, ., g
- ✨ Suporte a lote (vírgula-separado)
- ✨ Wildcards para admin (ok g*, no s*)
- ✨ 27 templates de UI centralizados
- ✨ Parser moderno (commandParser.js)
- ✨ Processador de lote (batchProcessor.js)
- ✅ 100% compatibilidade com legacy
- 📚 Documentação consolidada no README + guias essenciais

### v0.1.0 (Initial)
- Versão inicial com comandos básicos

---

## 🤝 Contribuindo

1. Leia [BEST_PRACTICES.md](BEST_PRACTICES.md)
2. Crie uma branch para sua feature
3. Commit com mensagens claras
4. Abra um PR

---

## 📞 Suporte

- **Dúvida sobre código?** → Veja [BEST_PRACTICES.md](BEST_PRACTICES.md)
- **Configurar IA local?** → Veja [OLLAMA_SETUP.md](OLLAMA_SETUP.md)
- **Bug encontrado?** → Abra uma issue com detalhes

---

## 📄 Licença

MIT - Veja LICENSE para detalhes

---

**Mantido com ❤️ por ApénasGabs**  
Última atualização: 9 de março de 2026 (v0.2.0)
