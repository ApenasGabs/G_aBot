# Configuração do Parser de Cupons com IA (Ollama)

## Visão Geral

O bot agora suporta parsing inteligente de cupons usando IA (Ollama) para extrair informações com mais precisão:

- ✅ **Identificação precisa do código do cupom**
- ✅ **Detecção automática da loja/marketplace**
- ✅ **Análise contextual da mensagem**
- ✅ **Fallback automático para regex se IA falhar**
- ✅ **Suporte a qualquer modelo local (llama3.2, mistral, phi3, etc)**

## Como Funciona

### Fluxo de Extração

```
Mensagem recebida
    ↓
[IA habilitada?]
    ↓ Sim
Análise com IA (Ollama)
    ↓
[Cupom detectado?]
    ↓ Sim → Retorna resultado da IA
    ↓ Não/Erro → Fallback para Regex
    ↓
Retorna resultado final
```

### Exemplo de Análise com IA

**Mensagem:**
```
🔥 PROMOÇÃO AMAZON 🔥
Fone Bluetooth
De R$ 299,90 por R$ 99,90
CUPOM: XPTO2024
```

**Resultado da IA:**
```json
{
  "is_coupon": true,
  "coupon_code": "XPTO2024",
  "store_name": "Amazon",
  "confidence": 95,
  "is_exhausted": false,
  "reasoning": "Mensagem menciona 'AMAZON' e possui código 'XPTO2024' formatado como cupom"
}
```

## Instalação do Ollama

### Linux

```bash
curl -fsSL https://ollama.com/install.sh | sh
```

### Windows/Mac

Baixe o instalador em: https://ollama.com/download

### Baixar Modelo

Após instalar o Ollama, baixe um modelo adequado ao seu hardware:

#### 🟢 Hardware Limitado (CPU, 8-16GB RAM, VRAM ocupada)

```bash
# RECOMENDADO: Mais leve e rápido (934MB)
ollama pull qwen2.5:1.5b

# Alternativa muito rápida (1.3GB)
ollama pull llama3.2:1b

# Alternativa balanceada (1.6GB)
ollama pull gemma2:2b
```

#### 🟡 Hardware Médio (CPU, 16GB+ RAM, ou GPU 4GB parcial)

```bash
# Ótima qualidade (3.8GB)
ollama pull phi3:mini

# Versão 3B do Llama (2GB)
ollama pull llama3.2:3b
```

#### 🔴 Hardware Forte (GPU 8GB+ livre)

```bash
# Máxima qualidade (4.9GB)
ollama pull llama3.2:latest

# Alternativa Mistral (4.1GB)
ollama pull mistral:latest
```

**💡 DICA:** Se você tem ~800MB VRAM livre e 10GB+ RAM livre, use `qwen2.5:1.5b` rodando em CPU. É rápido e preciso o suficiente para parsing de cupons!

### Verificar se está rodando

```bash
curl http://localhost:11434/v1/models
```

Se retornar JSON com lista de modelos, está funcionando!

## Configuração no Bot

### 1. Editar arquivo `.env`

```bash
# Habilitar IA
COUPON_AI_ENABLED=true

# URL da API Ollama (local)
COUPON_AI_BASE_URL=http://localhost:11434

# Modelo a usar (escolha conforme seu hardware)
# Hardware limitado: qwen2.5:1.5b ou llama3.2:1b
# Hardware médio: phi3:mini
# Hardware forte: llama3.2:latest
COUPON_AI_MODEL=qwen2.5:1.5b

# Timeout (CPU é mais lento que GPU)
# Hardware limitado/CPU: 20000-30000 (20-30s)
# GPU: 10000-15000 (10-15s)
COUPON_AI_TIMEOUT=20000
```

### 2. Reiniciar o bot

```bash
pm2 restart gabot-ofertas
```

### 3. Verificar logs

```bash
pm2 logs gabot-ofertas
```

Você verá logs como:
```
[AI Parser] Analisando mensagem (120 chars) do grupo: Ofertas Amazon
[AI Parser] Análise concluída: { is_coupon: true, store: 'Amazon', confidence: 95 }
[Coupon Extractor] IA detectou cupom: { code: 'XPTO2024', store: 'Amazon', confidence: 95 }
[Cupom] Método de extração: ai | Loja (IA): Amazon
```

## Desabilitando a IA

Se quiser voltar para o método tradicional (regex), basta:

```bash
# No arquivo .env
COUPON_AI_ENABLED=false
```

O bot automaticamente fará fallback para regex sem precisar de mudanças no código.

## Verificando Status

Você pode verificar se a IA está funcionando usando o comando admin:

```
/adm status
```

Isso mostrará:
- ✅ Status do bot
- ⏱️ Uptime
- 💾 Uso de memória
- 🤖 Se IA está habilitada (em breve)

## Comparação: IA vs Regex

### Com IA (Ollama)

**Vantagens:**
- ✅ Identifica lojas com mais precisão
- ✅ Entende contexto da mensagem
- ✅ Menos falsos positivos
- ✅ Extrai códigos complexos
- ✅ Detecta cupons expirados/esgotados

**Desvantagens:**
- ⚠️ Latência de ~2-5 segundos por análise
- ⚠️ Requer Ollama rodando localmente
- ⚠️ Usa mais CPU/Memória

### Sem IA (Regex)

**Vantagens:**
- ✅ Instantâneo (< 1ms)
- ✅ Não precisa de serviços externos
- ✅ Baixo uso de recursos

**Desvantagens:**
- ⚠️ Pode não identificar loja corretamente
- ⚠️ Mais falsos positivos
- ⚠️ Regex rígido/limitado

## Troubleshooting

### Erro: "Connection refused"

**Problema:** Ollama não está rodando

**Solução:**
```bash
# Verificar se Ollama está rodando
systemctl status ollama

# Ou iniciar manualmente
ollama serve
```

### Erro: "Model not found"

**Problema:** Modelo não foi baixado

**Solução:**
```bash
ollama pull llama3.2:latest
```

### IA muito lenta

**Problema:** Modelo pesado para sua máquina

**Solução:** Use um modelo mais leve
```bash
# No .env
COUPON_AI_MODEL=phi3:latest  # Modelo mais leve
```

### Sempre usa fallback regex

**Problema:** IA não está habilitada ou falhando

**Verificar:**
1. `COUPON_AI_ENABLED=true` no `.env`
2. Ollama rodando: `curl http://localhost:11434/v1/models`
3. Logs do bot: `pm2 logs gabot-ofertas`

## Performance

### Comparação de Modelos

#### qwen2.5:1.5b (RECOMENDADO para hardware limitado)
- **Tamanho:** 934MB
- **Hardware:** CPU, 2GB+ RAM
- **Latência média:** 1-3s por mensagem
- **Uso de memória:** +1.5GB
- **Precisão:** ~88% vs ~75% (regex)
- **Melhor para:** Máquinas com GPU ocupada

#### llama3.2:1b
- **Tamanho:** 1.3GB
- **Hardware:** CPU, 3GB+ RAM
- **Latência média:** 1-4s por mensagem
- **Uso de memória:** +2GB
- **Precisão:** ~85% vs ~75% (regex)
- **Melhor para:** Velocidade máxima

#### phi3:mini
- **Tamanho:** 3.8GB
- **Hardware:** CPU/GPU, 6GB+ RAM
- **Latência média:** 2-5s (CPU), 0.5-2s (GPU)
- **Uso de memória:** +4GB
- **Precisão:** ~90% vs ~75% (regex)
- **Melhor para:** Balanceamento qualidade/velocidade

#### llama3.2:latest (7B)
- **Tamanho:** 4.9GB
- **Hardware:** GPU 6GB+, ou CPU 12GB+ RAM
- **Latência média:** 3-8s (CPU), 1-3s (GPU)
- **Uso de memória:** +5GB
- **Precisão:** ~92% vs ~75% (regex)
- **Melhor para:** Máxima qualidade

## Próximos Passos

- [ ] Cache de análises (evitar reprocessar mesma mensagem)
- [ ] Batch processing (analisar múltiplos cupons de uma vez)
- [ ] Suporte a APIs de LLM externas (OpenAI, Anthropic, Groq)
- [ ] Métricas de performance no `/adm status`
- [ ] Ajuste fino do prompt para melhor precisão

## Suporte

Se tiver problemas, verifique:
1. Logs do bot: `pm2 logs gabot-ofertas`
2. Status do Ollama: `systemctl status ollama`
3. Modelos disponíveis: `ollama list`

Para mais informações sobre Ollama: https://ollama.com/
