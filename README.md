# G_aBot

Bot de WhatsApp com Baileys + SQLite para monitorar mensagens em grupos e encaminhar ofertas para usuarios com filtros cadastrados.

## Requisitos

- Node.js 20+
- npm

## Instalar

```bash
npm install
```

## Rodar local

```bash
npm start
```

Para receber sugestoes de grupos em um grupo de administracao, configure:

```bash
BOT_ADMIN_GROUP_ID="1203630xxxxxxxxx@g.us" npm start
```

Na primeira execucao, escaneie o QR code no terminal.

Arquivos gerados em runtime:

- `auth_info/` (sessao Baileys)
- `data/bot.db` (SQLite)

## Comandos do bot (apenas no privado)

**Filtros de ofertas:**
- `/cadastro` - ativa seu cadastro
- `/add [termo]` - adiciona um filtro
- `/remover [termo]` - remove um filtro
- `/meusfiltros` (aliases: `/filtros`, `/meuscadastros`) - lista seus filtros

**Cupons:**
- `/cupons` - lista cupons recentes (🔥 menos de 30min, ⏰ menos de 2h, 🧊 mais de 24h)
- `/cupom [loja]` - busca cupons de uma loja específica
- `/seguircupom [loja]` - cadastra interesse em cupons de uma loja
- `/pararcupom [loja]` - remove interesse em cupons de uma loja
- `/meuscupons` - lista lojas que você segue

**Outros:**
- `/` ou `/menu` ou `/ajuda` - mostra menu de comandos
- `/sugerirgrupo [link-do-grupo]` - sugere grupo para monitoramento

## Regras de funcionamento

- Comandos sao processados somente em conversa privada.
- Em grupos, o bot monitora mensagens de texto.
- Cada mensagem e normalizada e hashada (MD5) para evitar duplicidade.
- Quando um termo cadastrado der match, o bot envia alerta no privado via fila (throttle).

## PM2

Iniciar:

```bash
npm run pm2:start
```

Status:

```bash
npm run pm2:status
```

Logs:

```bash
npm run pm2:logs
```

Parar:

```bash
npm run pm2:stop
```

## Utilitarios

Validar sintaxe:

```bash
npm run check
```
