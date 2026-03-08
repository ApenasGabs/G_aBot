Perfeito, vamos estruturar o projeto para que você possa passar as instruções mastigadas para outra IA ou para começar a codar no seu `apns-srv`.

Como vamos usar **Baileys** (que é baseado em eventos), a arquitetura será orientada a eventos. O banco de dados ideal para começar de forma leve e rápida é o **SQLite**.

Aqui está o escopo completo para o desenvolvimento:

---

### 1. Modelo de Dados (Esquema SQLite)

Precisamos de três tabelas principais para gerenciar usuários, o que eles buscam e o que o bot já processou (para evitar spam).

```sql
-- Tabela de Usuários: Quem está cadastrado e ativo
CREATE TABLE users (
    chat_id TEXT PRIMARY KEY, -- O número do WhatsApp (ex: 55119... @s.whatsapp.net)
    name TEXT,
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Tabela de Filtros/Keywords: O que cada usuário quer receber
CREATE TABLE keywords (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT,
    term TEXT NOT NULL, -- Ex: "RTX 4060", "fralda pampers", "iphone 15"
    FOREIGN KEY (user_id) REFERENCES users(chat_id)
);

-- Tabela de Cache de Ofertas: Para não enviar a mesma oferta repetida
CREATE TABLE processed_offers (
    hash_id TEXT PRIMARY KEY, -- Um hash MD5 do texto da mensagem
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

```

---

### 2. Lógica de Funcionamento (O "Cérebro")

O bot deve operar em dois fluxos simultâneos:

#### A. Fluxo de Gerenciamento (PV do Bot)

1. **Comando `/cadastro**`: O bot salva o `chat_id` na tabela `users`.
2. **Comando `/add [termo]**`: O bot insere o termo na tabela `keywords` vinculado ao usuário.
3. **Comando `/remover [termo]**`: Deleta o termo específico.
4. **Comando `/meusfiltros**`: Lista tudo que o usuário está monitorando.

#### B. Fluxo de Monitoramento (Grupos)

1. O bot recebe um evento `messages.upsert`.
2. **Verificação**: Se a mensagem vem de um grupo e tem texto:
* Gera um **MD5 Hash** do texto da mensagem.
* Consulta `processed_offers`. Se o hash já existe, **ignora** (evita duplicidade de grupos diferentes).
* Se for nova, salva o hash no banco.


3. **Filtragem**:
* Transforma o texto da oferta em *lowercase*.
* Busca no banco de dados: `SELECT user_id, term FROM keywords`.
* Para cada termo, verifica: `if (textoOferta.includes(term))`.


4. **Disparo**:
* Para cada `user_id` que deu "match", o bot envia a mensagem original (ou copia o texto e formata).



---

### 3. Checklist de Implementação para a IA

Ao pedir para a IA gerar o código, passe estas especificações:

1. **Biblioteca Base**: `baileys` para a conexão com WhatsApp.
2. **Gerenciamento de Estado**: Usar `useMultiFileAuthState` do Baileys para salvar a sessão na pasta `auth_info` (para não precisar ler QR Code toda hora).
3. **Banco de Dados**: Usar a biblioteca `better-sqlite3` ou `sqlite3` para Node.js.
4. **Processamento de Texto**:
* Usar uma função de normalização para remover acentos e caracteres especiais antes de comparar (ex: `nitro` deve dar match em `Nítrô`).
* Implementar um "Debounce" ou fila (Queue) para os disparos, evitando que o WhatsApp bloqueie o bot por enviar 100 mensagens no mesmo segundo.


5. **Segurança**: O bot só deve processar comandos de texto em conversas privadas (DMs), e apenas coletar ofertas em grupos.

### 4. Sugestão de Comando para a outra IA:

> "Crie um bot de WhatsApp usando Node.js e a biblioteca Baileys. O bot deve usar SQLite como banco de dados.
> 1. Implemente o sistema de autenticação persistente.
> 2. Crie comandos de cadastro de palavras-chave para usuários em chats privados.
> 3. Em grupos, o bot deve monitorar todas as mensagens, verificar se o texto contém alguma das palavras-chave cadastradas pelos usuários e, em caso positivo, encaminhar a mensagem para o usuário interessado.
> 4. Evite duplicidade de mensagens usando um sistema de hash para mensagens já processadas."
> 
> 

