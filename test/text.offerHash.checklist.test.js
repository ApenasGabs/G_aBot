import assert from "node:assert/strict";
import test from "node:test";
import {
  createOfferHash,
  detectMessageType,
  extractMessageText,
  unwrapMessageContent,
} from "../src/utils/text.js";

test("hash ignora URL e emoji", () => {
  const a = createOfferHash("🔥 Monitor gamer 32 pol R$ 1.299,90 https://a.co/abc");
  const b = createOfferHash("Monitor gamer 32 polegadas R$1299.90 https://outra.url/oferta");

  assert.equal(a, b);
});

test("hash muda para preco diferente", () => {
  const a = createOfferHash("Notebook i5 R$ 2.999,00");
  const b = createOfferHash("Notebook i5 R$ 3.499,00");

  assert.notEqual(a, b);
});

test("extractMessageText desembrulha ephemeralMessage (iOS / mensagens temporarias de 7 dias)", () => {
  const iosEphemeralMenu = {
    ephemeralMessage: {
      message: {
        conversation: "Menu",
      },
    },
  };
  assert.equal(extractMessageText(iosEphemeralMenu), "Menu");

  const iosEphemeralExtended = {
    ephemeralMessage: {
      message: {
        extendedTextMessage: {
          text: "seguir mercado livre",
          contextInfo: { expiration: 604800 },
        },
      },
    },
  };
  assert.equal(extractMessageText(iosEphemeralExtended), "seguir mercado livre");
});

test("extractMessageText e detectMessageType suportam wrappers aninhados e previnem loop infinito", () => {
  const viewOnceImage = {
    ephemeralMessage: {
      message: {
        viewOnceMessageV2: {
          message: {
            imageMessage: {
              caption: "CUPOM10",
            },
          },
        },
      },
    },
  };
  assert.equal(extractMessageText(viewOnceImage), "CUPOM10");
  assert.equal(detectMessageType(viewOnceImage), "image");

  const docWithCaption = {
    documentWithCaptionMessage: {
      message: {
        documentMessage: {
          caption: "seguir amazon",
        },
      },
    },
  };
  assert.equal(extractMessageText(docWithCaption), "seguir amazon");
  assert.equal(detectMessageType(docWithCaption), "document");

  const editedMsg = {
    editedMessage: {
      message: {
        protocolMessage: {
          editedMessage: {
            conversation: "/",
          },
        },
      },
    },
  };
  assert.equal(extractMessageText(editedMsg), "/");

  // Protecao contra referencia ciclica malformada
  const cyclic = {};
  cyclic.ephemeralMessage = { message: cyclic };
  assert.doesNotThrow(() => unwrapMessageContent(cyclic));
  assert.equal(extractMessageText(cyclic), "");
});
