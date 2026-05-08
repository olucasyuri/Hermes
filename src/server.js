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
      const user = await client.users.fetch(dest.discordId);
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
    if (req.method === "GET" && req.url === "/health") {
      return sendJson(res, 200, { status: "ok", bot: client.user?.tag || "Hermes" });
    }

    if (req.method !== "POST" || !req.url.startsWith("/send/")) {
      return sendJson(res, 404, { error: "Rota não encontrada" });
    }

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
        // Mantenha aqui seu envio para canal, caso já exista no Hermes.
        return sendJson(res, 200, { ok: true, tipo, received: true });
      }

      return sendJson(res, 400, { error: "Tipo não suportado", tipo });
    } catch (error) {
      console.error("[Hermes server]", error);
      return sendJson(res, 500, { error: error.message });
    }
  });

  const port = Number(process.env.PORT || 3001);
  server.listen(port, () => console.log(`[Hermes] API online na porta ${port}`));
  return server;
}

module.exports = { createHermesServer };
