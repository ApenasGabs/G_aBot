export async function handleUnmappedPrivateMessage({ chatId, text, reply }) {
  const normalized = String(text || "")
    .trim()
    .toLowerCase();
  if (!normalized) return false;

  await reply(
    [
      "Nao entendi essa mensagem.",
      "",
      "Digite *menu* para ver os comandos disponiveis ou *help* para o guia completo.",
    ].join("\n"),
  );

  return true;
}
