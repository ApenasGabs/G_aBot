---
name: cleanup-temp-files
description: Sempre limpe os arquivos temporários ou de teste criados pelo agente.
trigger: always_on
---

# Limpeza de Arquivos Temporários

Ao realizar suas tarefas, é comum criar arquivos temporários para testes, patches, scripts em python (ex: `patch_*.py`), ou testes de banco de dados (`test_db.js`).
**Regra obrigatória:** Ao terminar a tarefa ou confirmar que o script/arquivo temporário não é mais necessário, você **DEVE APAGAR** (usando `rm` via terminal) toda a "sujeira" gerada. Não deixe arquivos de código descartáveis na área de trabalho ou na raiz do repositório do usuário.
