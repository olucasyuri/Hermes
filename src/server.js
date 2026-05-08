const http = require("node:http");

// ── Mapa de canais Discord ────────────────────────────────
const GUILD_ID = "663150267939684397";
const CANAL_IDS = {
  "Processos": "1485642710085013604",
  "Avisos":    "1407346681309167698",
};

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => { body += chunk; });
    req.on("end", () => {
      try { resolve(body ? JSON.parse(body) : {}); }
      catch (err) { reject(err); }
    });
  });
}

function sendJson(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

function assertSecret(req) {
  const expected = process.env.API_SECRET;
  const received = req.headers["x-api-secret"];
  return expected && received === expected;
}

/**
 * Monta o link clicável para o canal do Discord.
 * @param {string} canalNome  — ex: "Processos"
 * @returns {string}
 */
function buildCanalLink(canalNome) {
  const canalId = CANAL_IDS[canalNome];
  if (!canalId) return `**#${canalNome}**`;
  return `[#${canalNome}](https://discord.com/channels/${GUILD_ID}/${canalId})`;
}

/**
 * Monta a mensagem DM rica no mesmo estilo do formato anterior.
 * @param {object} dest        — { nome, discord_id }
 * @param {string} titulo
 * @param {string} mensagem
 * @param {string} canal       — ex: "Processos"
 */
function buildAvisoContent(dest, titulo, mensagem, canal) {
  const canalLink = buildCanalLink(canal);
  const saudacao = dest.nome ? `Olá, ${dest.nome.split(" ")[0]}!` : "Olá!";

  return [
    `📣 **Novo aviso publicado**`,
    saudacao,
    ``,
    `Foi publicado um novo aviso no canal ${canalLink}.`,
    ``,
    `📌 **${titulo}**`,
    `${mensagem}`,
    ``,
    `✅ Após ler, marque o visto no Discord.`,
  ].join("\n");
}

async function sendDm(client, destinatarios, buildContent) {
  const results = [];
  for (const dest of destinatarios || []) {
    try {
      const user = await client.users.fetch(dest.discord_id || dest.discordId);
      await user.send(buildContent(dest));
      results.push({ nome: dest.nome, ok: true });
    } catch (error) {
      results.push({ nome: dest.nome, ok: false, error: error.message });
    }
  }
  return results;
}

function createHermesServer(client) {
  const server = http.createServer(async (req, res) => {

    // ── Health check GET ──────────────────────────────────
    if (req.method === "GET" && req.url === "/health") {
      return sendJson(res, 200, { status: "ok", bot: client.user?.tag || "Hermes" });
    }

    // ── Rota unificada POST /api/hermes (chamada pela Vercel) ──
    if (req.method === "POST" && req.url === "/api/hermes") {
      const body = await readJson(req).catch(() => ({}));
      const tipo = body.tipo;

      console.log(`[Hermes] /api/hermes recebido — tipo: ${tipo}`);

      if (tipo === "health-check") {
        return sendJson(res, 200, { status: "ok", bot: client.user?.tag || "Hermes" });
      }

      if (tipo === "novo-aviso") {
        const { titulo, mensagem, canal, destinatarios } = body;
        const results = await sendDm(
          client,
          destinatarios,
          (dest) => buildAvisoContent(dest, titulo, mensagem, canal)
        );
        return sendJson(res, 200, { ok: true, tipo, results });
      }

      if (tipo === "feedback-privado") {
        const { titulo, mensagem, destinatarios } = body;
        const results = await sendDm(
          client,
          destinatarios,
          (dest) => [
            `💬 **Feedback privado**`,
            dest.nome ? `Olá, ${dest.nome.split(" ")[0]}!` : "",
            ``,
            `**${titulo || ""}**`,
            `${mensagem || ""}`,
          ].filter(Boolean).join("\n")
        );
        return sendJson(res, 200, { ok: true, tipo, results });
      }

      if (tipo === "pitstop-pausas") {
        return sendJson(res, 200, { ok: true, tipo, received: true });
      }

      return sendJson(res, 400, { error: "Tipo não suportado", tipo });
    }

    // ── Rotas legadas POST /send/:tipo ────────────────────
    if (req.method === "POST" && req.url.startsWith("/send/")) {
      if (!assertSecret(req)) {
        return sendJson(res, 401, { error: "API_SECRET inválida" });
      }

      try {
        const tipo = req.url.replace("/send/", "");
        const body = await readJson(req);

        if (tipo === "novo-aviso") {
          const { titulo, mensagem, canal, destinatarios } = body;
          const results = await sendDm(
            client,
            destinatarios,
            (dest) => buildAvisoContent(dest, titulo, mensagem, canal)
          );
          return sendJson(res, 200, { ok: true, tipo, results });
        }

        if (tipo === "feedback-privado") {
          const { titulo, mensagem, destinatarios } = body;
          const results = await sendDm(
            client,
            destinatarios,
            (dest) => [
              `💬 **Feedback privado**`,
              dest.nome ? `Olá, ${dest.nome.split(" ")[0]}!` : "",
              ``,
              `**${titulo || ""}**`,
              `${mensagem || ""}`,
            ].filter(Boolean).join("\n")
          );
          return sendJson(res, 200, { ok: true, tipo, results });
        }

        if (tipo === "pitstop-pausas") {
          return sendJson(res, 200, { ok: true, tipo, received: true });
        }

        return sendJson(res, 400, { error: "Tipo não suportado", tipo });
      } catch (error) {
        console.error("[Hermes server]", error);
        return sendJson(res, 500, { error: error.message });
      }
    }

    // ── Rota não encontrada ───────────────────────────────
    return sendJson(res, 404, { error: "Rota não encontrada" });
  });

  const port = Number(process.env.PORT || 3001);
  server.listen(port, () => console.log(`[Hermes] API online na porta ${port}`));
  return server;
}

module.exports = { createHermesServer };
