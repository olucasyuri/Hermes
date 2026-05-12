// server.js — versão corrigida
const http = require("node:http");

async function sendDm(client, destinatarios, buildContent) {
  const results = [];

  for (const dest of destinatarios || []) {
    try {
      const user = await client.users.fetch(
        dest.discord_id || dest.discordId
      );

      await user.send({
        content: buildContent(dest),
      });

      results.push({
        nome: dest.nome,
        ok: true,
      });

    } catch (error) {
      results.push({
        nome: dest.nome,
        ok: false,
        error: error.message,
      });
    }
  }

  return results;
}

function buildPausaContent(dest, dados) {
  const primeiroNome = dest.nome?.split(" ")[0] || "colaborador";

  return [
    `> ☕ ESCALA DE PAUSAS`,
    ``,
    `Olá, ${primeiroNome}! 👋`,
    ``,
    `⏰ Entrada: ${dados.entrada || "--:--"}`,
    `☕ Pausa 10m #1: ${dados.pausa_10_1 || "--:--"}`,
    `🍽 Almoço: ${dados.pausa_20 || "--:--"}`,
    `☕ Pausa 10m #2: ${dados.pausa_10_2 || "--:--"}`,
    `🏁 Saída: ${dados.saida || "--:--"}`,
  ].join("\\n");
}

module.exports = {
  sendDm,
  buildPausaContent
};
