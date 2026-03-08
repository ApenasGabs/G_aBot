export function createDispatchQueue(sendFn, intervalMs) {
  const queue = [];
  let isProcessing = false;

  const run = async () => {
    if (isProcessing) return;
    isProcessing = true;

    while (queue.length > 0) {
      const item = queue.shift();
      try {
        await sendFn(item);
      } catch (error) {
        console.error("Erro ao enviar mensagem da fila:", error.message);
      }
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }

    isProcessing = false;
  };

  return {
    enqueue(item) {
      queue.push(item);
      run().catch((error) => {
        console.error("Erro inesperado na fila:", error.message);
      });
    },
  };
}
