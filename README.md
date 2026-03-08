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

Na primeira execucao, escaneie o QR code no terminal.

Arquivos gerados em runtime:

- `auth_info/` (sessao Baileys)
- `data/bot.db` (SQLite)

## Comandos do bot (apenas no privado)

- `/` ou `/menu` ou `/ajuda`
- `/cadastro`
- `/add [termo]`
- `/remover [termo]`
- `/meusfiltros` (aliases: `/filtros` e `/meuscadastros`)

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
