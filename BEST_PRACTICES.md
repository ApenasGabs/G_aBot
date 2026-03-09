# 📐 Boas Práticas - GaBot Redesign

**Documento de Boas Práticas** utilizadas na implementação do redesign de interface e comandos.

---

## 1. Estrutura de Código

### 1.1 Organização por Responsabilidade

Cada arquivo tem uma responsabilidade bem definida:

- **`commandParser.js`** → Parsing e normalização de comandos
- **`batchProcessor.js`** → Processamento de operações em lote
- **`menuTemplates.js`** → Templates de mensagens e menus
- **`commands.js`** → Manipuladores de comando privado
- **`adminCommands.js`** → Manipuladores de comando administrativo

### 1.2 Padrão de Importação

```javascript
// ✅ BOM: Imports organizados por categoria
import { parseCommand, normalizeText } from "./commandParser.js";
import { splitByComma, validateBatchSize } from "./batchProcessor.js";
import * as templates from "./menuTemplates.js";
```

### 1.3 Assinatura de Funções Excelentes

```javascript
/**
 * Descrição clara do que a função faz
 * 
 * @async - Indica se é assíncrona
 * @param {Object} options - Objeto com opções nomeadas
 * @param {string} options.text - Texto da entrada
 * @param {Function} options.handler - Função callback
 * @returns {Promise<Object>} Descrição do retorno
 */
export async function myFunction({ text, handler }) {
  // implementação
}
```

**Padrão AppliedNamedParameters**: Sempre usar objeto para parâmetros múltiplos

---

## 2. Normalização e Validação

### 2.1 Normalizar Entrada

```javascript
// ✅ BOM: Normalizar sempre
const trimmed = normalizeText(userInput); // lowercase + trim

// ❌ RUIM: Sem normalização
const commands = trimmed.split(...);
```

### 2.2 Validar Tamanho de Lote

```javascript
// ✅ BOM: Validar antes de processar
const validation = validateBatchSize(argsText, 10);
if (!validation.valid) {
  await reply(`❌ ${validation.error}`);
  return;
}
```

### 2.3 Tratar Erros Graciosamente

```javascript
try {
  // operação
} catch (error) {
  console.error("[CONTEXTO] Descrição do erro:", error);
  await reply("❌ Erro ao processar");
}
```

---

## 3. Padrões de Reação

### 3.1 Feedback Imediato

```javascript
// Usar emojis para feedback rápido antes da resposta completa
const emoji = getReactionEmoji(actionPrefix);
await react(emoji); // mostra ⏳ ou ✅ enquanto processa
```

### 3.2 Mensagens com Estrutura

```javascript
// ✅ BOM: Uso de templates reutilizáveis
await reply(templates.getFilterAddedMessage(item));

// ❌ RUIM: Mensagens hardcoded
await reply("Filtro adicionado!");
```

---

## 4. Processamento em Lote

### 4.1 Suportar Vírgula

```javascript
// Entrada: "notebook, mouse, teclado"
// Saída: ["notebook", "mouse", "teclado"]
const items = splitByComma(text);
```

### 4.2 Suportar Wildcard

```javascript
// Entrada: "ok g*"
// Ação: Aprovar todos os grupos pendentes
if (hasWildcard(pattern)) {
  await handleWildcard(pattern);
}
```

### 4.3 Relatório de Resultados

```javascript
let message = "";
if (successful.length > 0) {
  message += `✅ Sucesso (${successful.length}): ${successful.join(", ")}\n`;
}
if (failed.length > 0) {
  message += `❌ Falhas (${failed.length}): ${failed.join(", ")}`;
}
await reply(message.trim());
```

---

## 5. Padrão Legacy (Compatibilidade)

### 5.1 Manutenção de Aliases Antigos

```javascript
// Manter ambos funcionando
if (actionPrefix === "+") {
  // Novo padrão
} else if (command === "/add") {
  // Padrão legacy
}
```

### 5.2 Tradução Transparente

O novo sistema traduz automaticamente:
- `c1` → `/menu`
- `cf1` → `/add`
- `+ termo` → `/add termo`

---

## 6. Templates de Mensagem

### 6.1 Estrutura Consistente

Todos os templates seguem padrão:

```javascript
export function getMyMessage() {
  return `🎯 *Título*
━━━━━━━━━━━━━━━
• Item 1
• Item 2

_Rodapé informatício_`;
}
```

### 6.2 Parâmetros Dinâmicos

```javascript
export function getFilterAddedMessage(terms) {
  if (Array.isArray(terms)) {
    return `✅ ${terms.length} filtro(s): ${terms.join(", ")}`;
  }
  return `✅ Filtro: ${terms}`;
}
```

---

## 7. Logging e Debug

### 7.1 Logs Descritivos

```javascript
// ✅ BOM: Include contexto
console.log(`[ADMIN CMD] Comando normalizado: "${normalizedCommand}"`);

// ❌ RUIM: Sem contexto
console.log("Processing...");
```

### 7.2 Níveis de Log

```javascript
console.log("[COMANDO]");   // Informativo
console.warn("[AVISO]");    // Atenção
console.error("[ERRO]");    // Crítico
```

---

## 8. Segurança

### 8.1 Validação de Entrada

```javascript
// ✅ BOM: Validar tipo e tamanho
if (!text || typeof text !== "string") {
  return null;
}

if (text.length > 1000) {
  return { error: "Texto muito longo" };
}
```

### 8.2 Sanitização

```javascript
// ✅ BOM: Usar normalizeText para evitar injeção
const safe = normalizeText(userInput);
```

---

## 9. Testes e Verificação

### 9.1 Funções Puras

Prefira funções puras para parsing:

```javascript
// ✅ BOM: Função pura
export function splitByComma(text) {
  return text.split(",").map(x => x.trim()).filter(x => x);
}

// ❌ RUIM: Efeito colateral
export function splitByComma(text) {
  globalList = text.split(",");
  return globalList;
}
```

### 9.2 Type Hints nos Comentários

```javascript
/**
 * @param {string} text
 * @returns {string[]} 
 */
export function splitByComma(text) {
  // ...
}
```

---

## 10. Performance

### 10.1 Evitar Loops Aninhados

```javascript
// ✅ BOM: Linear O(n)
for (const item of items) {
  process(item);
}

// ❌ RUIM: Quadrático O(n²)
for (const item of items) {
  for (const other of items) {
    if (item === other) process();
  }
}
```

### 10.2 Cache de Lookup

```javascript
// ✅ BOM: Usar Map para lookups
const cache = new Map(items.map(i => [i.id, i]));
const found = cache.get(id);

// ❌ RUIM: Filter repetido
for (const item of items) {
  const found = items.find(i => i.id === id);
}
```

---

## 11. Documentação

### 11.1 JSDoc Completo

```javascript
/**
 * @fileoverview Descrição do módulo
 * @module moduleName
 */

/**
 * Descrição breve
 * Descrição detalhada se necessário
 * 
 * @async
 * @param {Type} name - Descrição
 * @param {string} [optional] - Parâmetro opcional
 * @returns {Promise<Type>} Descrição
 * @throws {Error} Quando...
 */
export async function functionName() {
}
```

### 11.2 PROGRESS.md Atualizado

Manter documento de progresso com:
- [x] Tarefas concluídas
- [ ] Tarefas pendentes
- ⏳ Tarefas em progresso
- Status de cada arquivo modificado

---

## 12. Checklist de Implementação

Ao implementar nova feature:

- [ ] Criar/atualizar JSDoc
- [ ] Implementar validação de entrada
- [ ] Adicionar tratamento de erro
- [ ] Usar templates para mensagens
- [ ] Suportar lote se aplicável
- [ ] Manter compatibilidade legacy
- [ ] Adicionar logs descritivos
- [ ] Atualizar PROGRESS.md
- [ ] Testar com múltiplas entradas
- [ ] Revisar código

---

## 13. Referências Rápidas

### Imports Padrão

```javascript
import {
  parseCommand, normalizeText, 
  getFirstToken, getArguments,
  getActionPrefix, isValidCommand,
  getReactionEmoji
} from "./commandParser.js";

import {
  splitByComma, processBatch,
  formatBatchResult, validateBatchSize,
  hasWildcard, hasMultipleItems
} from "./batchProcessor.js";

import * as templates from "./menuTemplates.js";
```

### Padrão de Resposta ao Usuário

```javascript
// Erro de argumento
await reply(templates.getMissingArgumentError("comando", "exemplo uso"));

// Sucesso
await reply(templates.getFilterAddedMessage("termo"));

// Erro genérico
await reply("❌ Não foi possível processar");

// Informativo
await reply(templates.getNoFiltersMessage());
```

---

**Última atualização:** 2026-03-09  
**Responsável:** Implementação do Redesign  
**Versão:** 1.0
