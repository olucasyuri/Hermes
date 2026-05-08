const http = require("node:http");

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

async function sendDm(client, destinatarios, content) {
  const results = [];
  for (const dest of destinatarios || []) {
    try {
      const user = await client.users.fetch(dest.discord_id || dest.discordId);
      await user.send(content);
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
        const content = `📣 **${body.titulo || "Novo aviso"}**\n${body.mensagem || ""}\n\nCanal: ${body.canal || "Avisos"}`;
        const results = await sendDm(client, body.destinatarios, content);
        return sendJson(res, 200, { ok: true, tipo, results });
      }

      if (tipo === "feedback-privado") {
        const content = `💬 **Feedback privado**\n**${body.titulo || ""}**\n${body.mensagem || ""}`;
        const results = await sendDm(client, body.destinatarios, content);
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
          const content = `📣 **${body.titulo || "Novo aviso"}**\n${body.mensagem || ""}\n\nCanal: ${body.canal || "Avisos"}`;
          const results = await sendDm(client, body.destinatarios, content);
          return sendJson(res, 200, { ok: true, tipo, results });
        }

        if (tipo === "feedback-privado") {
          const content = `💬 **Feedback privado**\n**${body.titulo || ""}**\n${body.mensagem || ""}`;
          const results = await sendDm(client, body.destinatarios, content);
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
