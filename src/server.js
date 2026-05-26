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

function buildCanalLink(canalNome) {
  const canalId = CANAL_IDS[canalNome];
  if (!canalId) return `**#${canalNome}**`;
  return `[#${canalNome}](https://discord.com/channels/${GUILD_ID}/${canalId})`;
}

function getPrimeiroNome(dest) {
  return dest?.nome ? String(dest.nome).split(" ")[0] : "colaborador";
}

function buildAvisoContent(dest, titulo, mensagem, canal) {
  const canalLink = buildCanalLink(canal);
  const primeiroNome = getPrimeiroNome(dest);

  return [
    `> 📣 **NOVO AVISO PUBLICADO**`,
    `> Canal: ${canalLink}`,
    ``,
    `Olá, ${primeiroNome}! 👋`,
    ``,
    `**📌 ${titulo}**`,
    `${mensagem}`,
    ``,
    `> ✅ Por favor, leia e marque o visto.`,
    `> 🔗 [Clique aqui para acessar o canal](https://discord.com/channels/${GUILD_ID}/${CANAL_IDS[canal] || ""})`,
  ].join("\n");
}

function buildFeedbackContent(dest, titulo, mensagem) {
  const primeiroNome = getPrimeiroNome(dest);

  return [
    `> 💬 **FEEDBACK PRIVADO**`,
    `> Gestão PIT STOP`,
    ``,
    `Olá, ${primeiroNome}! 👋`,
    ``,
    `**📌 ${titulo || "Novo feedback"}**`,
    `${mensagem || ""}`,
    ``,
    `> 🔒 Esta mensagem é confidencial e destinada apenas a você.`,
  ].join("\n");
}

function buildPausaContent(dest, pausa = {}, contexto = "") {
  const primeiroNome = getPrimeiroNome(dest);
  const titulo = contexto === "sabado" ? "⚡ **ESCALA DE SÁBADO**" : "☕ **ESCALA DE PAUSAS**";

  const linhas = [
    `> ${titulo}`,
    `> Gestão PIT STOP`,
    ``,
    `Olá, ${primeiroNome}! 👋`,
    ``,
  ];

  if (contexto === "atraso" && pausa._chegada) {
    linhas.push(`Identificamos seu horário de chegada real: **${pausa._chegada}**.`);
    linhas.push(`Sua pausa foi ajustada conforme a regra operacional.`);
    linhas.push(``);
  } else if (contexto === "sabado") {
    linhas.push(`Segue sua escala de sábado:`);
    linhas.push(``);
  } else {
    linhas.push(`Sua escala de pausas foi atualizada:`);
    linhas.push(``);
  }

  linhas.push(
    `⏰ Entrada: ${pausa.entrada || "--:--"}`,
    `☕ Pausa 10m #1: ${pausa.pausa_10_1 || "--:--"}`,
    `🍽 Pausa/Almoço: ${pausa.pausa_20 || "--:--"}`,
    `☕ Pausa 10m #2: ${pausa.pausa_10_2 || "--:--"}`,
    `🏁 Saída: ${pausa.saida || "--:--"}`,
    ``,
    `> ✅ Favor seguir os horários definidos. Qualquer dúvida, acione a gestão.`
  );

  return linhas.join("\n");
}

function buildMensagemRapidaContent(dest, mensagem) {
  const primeiroNome = getPrimeiroNome(dest);
  return [
    `> 📩 **MENSAGEM DA GESTÃO PIT STOP**`,
    ``,
    `Olá, ${primeiroNome}! 👋`,
    ``,
    `${mensagem || ""}`,
  ].join("\n");
}

function buildFolgaContent(dest, dados = {}) {
  const primeiroNome = getPrimeiroNome(dest);
  return [
    `> 📅 **FOLGA/FÉRIAS**`,
    `> Gestão PIT STOP`,
    ``,
    `Olá, ${primeiroNome}! 👋`,
    ``,
    `Sua solicitação foi registrada/atualizada no painel.`,
    dados.data ? `📆 Data: ${dados.data}` : null,
    dados.motivo ? `📝 Motivo: ${dados.motivo}` : null,
    ``,
    `> ✅ Em caso de dúvida, fale com a gestão.`,
  ].filter(Boolean).join("\n");
}

function buildAniversarioContent(dest, mensagem) {
  const primeiroNome = getPrimeiroNome(dest);
  return [
    `> 🎂 **FELIZ ANIVERSÁRIO!**`,
    ``,
    `Parabéns, ${primeiroNome}! 🎉`,
    ``,
    mensagem || `Toda equipe PIT STOP deseja muito sucesso, saúde e felicidades para você!`,
    ``,
    `💛 Aproveite seu dia!`,
  ].join("\n");
}


function buildImportacaoStatusContent(dest, dados = {}) {
  const primeiroNome = getPrimeiroNome(dest);
  const aprovado     = dados.status === 'aprovado';
  const emoji        = aprovado ? '✅' : '❌';
  const titulo       = aprovado
    ? '✅ SOLICITAÇÃO DE MIGRAÇÃO APROVADA'
    : '❌ SOLICITAÇÃO DE MIGRAÇÃO REPROVADA';

  const linhas = [
    `> ${emoji} **${titulo}**`,
    `> Gestão PEV`,
    ``,
    `Olá, ${primeiroNome}! 👋`,
    ``,
    `Sua solicitação de **migração de dados** foi analisada pela equipe.`,
    ``,
    `**🏢 Empresa:** ${dados.empresa || '—'}`,
    `**🔢 CNPJ:** ${dados.cnpj || '—'}`,
  ];

  if (dados.data_virada) {
    const [y, m, d] = (dados.data_virada || '').split('-');
    const dataFmt = (d && m && y) ? `${d}/${m}/${y}` : dados.data_virada;
    linhas.push(`**📅 Virada do sistema:** ${dataFmt}`);
  }

  linhas.push('');

  if (aprovado) {
    linhas.push(
      `**${emoji} Status: APROVADO**`,
      ``,
      `> ✅ A equipe responsável entrará em contato para dar continuidade ao processo.`,
    );
  } else {
    linhas.push(`**${emoji} Status: REPROVADO**`);
    if (dados.motivo) linhas.push(`**💬 Motivo:** ${dados.motivo}`);
    linhas.push('', `> ℹ️ Em caso de dúvidas, entre em contato com a gestão.`);
  }

  return linhas.join('\n');
}

async function sendDm(client, destinatarios, buildContent) {
  const results = [];

  for (const dest of destinatarios || []) {
    try {
      const discordId = dest.discord_id || dest.discordId || dest.discordID;
      if (!discordId) {
        results.push({ nome: dest.nome, ok: false, error: "discord_id ausente" });
        continue;
      }

      const user = await client.users.fetch(discordId);
      await user.send(buildContent(dest));
      results.push({ nome: dest.nome, discord_id: discordId, ok: true });
      console.log(`[Hermes] DM enviada para ${dest.nome || discordId}`);
    } catch (error) {
      console.error(`[Hermes] Falha ao enviar DM para ${dest.nome || "sem nome"}:`, error.message);
      results.push({ nome: dest.nome, ok: false, error: error.message });
    }
  }

  return results;
}

function destinatariosFromPausas(body) {
  const pausas = body.pausas || {};
  const colaboradores = body.colaboradores || body.destinatarios || [];
  return colaboradores
    .filter(c => c && c.discord_id)
    .map(c => ({ ...c, ...(pausas[c.nome] || {}) }));
}

async function handleTipo(client, tipo, body) {
  if (tipo === "health-check") {
    return { status: "ok", bot: client.user?.tag || "Hermes" };
  }

  if (tipo === "novo-aviso") {
    const { titulo, mensagem, canal, destinatarios } = body;
    const results = await sendDm(client, destinatarios, dest => buildAvisoContent(dest, titulo, mensagem, canal));
    return { ok: true, tipo, results };
  }

  if (tipo === "feedback-privado") {
    const { titulo, mensagem, destinatarios } = body;
    const results = await sendDm(client, destinatarios, dest => buildFeedbackContent(dest, titulo, mensagem));
    return { ok: true, tipo, results };
  }

  if (tipo === "pitstop-pausas") {
    const destinatarios = destinatariosFromPausas(body);
    const results = await sendDm(client, destinatarios, dest => buildPausaContent(dest, dest, body.contexto));
    return { ok: true, tipo, total: results.length, results };
  }

  if (tipo === "pitstop-mensagem") {
    const destinatarios = body.destinatarios || [{ nome: body.nome, discord_id: body.discord_id || body.discordId }];
    const results = await sendDm(client, destinatarios, dest => buildMensagemRapidaContent(dest, body.mensagem));
    return { ok: true, tipo, results };
  }

  if (tipo === "pitstop-folga") {
    const { destinatarios, data, motivo } = body;
    const results = await sendDm(client, destinatarios, dest => buildFolgaContent(dest, { data, motivo }));
    return { ok: true, tipo, results };
  }

  if (tipo === "pitstop-aniversario") {
    const { destinatarios, mensagem } = body;
    const results = await sendDm(client, destinatarios, dest => buildAniversarioContent(dest, mensagem));
    return { ok: true, tipo, results };
  }

  // ── pev-escala: envia a escala do PEV para um canal de texto do Discord ──
  if (tipo === "pev-escala" || tipo === "pev-almoco") {
    const { mensagem, content, channelId } = body;
    const texto = mensagem || content;
    if (!texto) throw Object.assign(new Error("Campo 'mensagem' ou 'content' obrigatório"), { statusCode: 400 });

    // Prioridade: channelId enviado pelo site → variável de ambiente → fallback
    const alvoId =
      channelId ||
      (tipo === "pev-almoco"
        ? process.env.CHANNEL_PEV_ALMOCO || process.env.CHANNEL_ALMOCO
        : process.env.CHANNEL_PEV_ESCALA || process.env.CHANNEL_ESCALA);

    if (!alvoId || alvoId === "ID_DO_CANAL_ESCALA" || alvoId === "ID_DO_CANAL_ALMOCO") {
      throw Object.assign(
        new Error(
          `Canal não configurado. Defina ${tipo === "pev-almoco" ? "CHANNEL_PEV_ALMOCO" : "CHANNEL_PEV_ESCALA"} no .env do Hermes, ou envie 'channelId' no payload.`
        ),
        { statusCode: 500 }
      );
    }

    const channel = await client.channels.fetch(alvoId).catch(() => null);
    if (!channel) {
      throw Object.assign(new Error(`Canal ${alvoId} não encontrado. Verifique o ID e as permissões do bot.`), { statusCode: 404 });
    }

    await channel.send(texto);
    return { ok: true, tipo, channelId: alvoId };
  }

  // ── pev-importacao-status: notifica colaborador sobre aprovação/reprovação ──
  if (tipo === "pev-importacao-status") {
    const { discord_id, discord_nome, discord_user, status, empresa, cnpj, data_virada, motivo } = body;
    if (!discord_id) throw Object.assign(new Error("discord_id obrigatório para pev-importacao-status"), { statusCode: 400 });
    const destinatarios = [{ nome: discord_nome || discord_user || "colaborador", discord_id }];
    const dados = { status, empresa, cnpj, data_virada, motivo };
    const results = await sendDm(client, destinatarios, dest => buildImportacaoStatusContent(dest, dados));
    return { ok: true, tipo, results };
  }

    throw Object.assign(new Error("Tipo não suportado"), { statusCode: 400, tipo });
}

function createHermesServer(client) {
  const server = http.createServer(async (req, res) => {
    try {
      if (req.method === "GET" && req.url === "/health") {
        return sendJson(res, 200, { status: "ok", bot: client.user?.tag || "Hermes" });
      }

      if (req.method === "POST" && req.url === "/api/hermes") {
        const body = await readJson(req).catch(() => ({}));
        const tipo = body.tipo;
        console.log(`[Hermes] /api/hermes recebido — tipo: ${tipo}`);
        const data = await handleTipo(client, tipo, body);
        return sendJson(res, 200, data);
      }

      if (req.method === "POST" && req.url.startsWith("/send/")) {
        if (!assertSecret(req)) {
          return sendJson(res, 401, { error: "API_SECRET inválida" });
        }

        const tipo = req.url.replace("/send/", "");
        const body = await readJson(req);
        const data = await handleTipo(client, tipo, body);
        return sendJson(res, 200, data);
      }

      return sendJson(res, 404, { error: "Rota não encontrada" });
    } catch (error) {
      console.error("[Hermes server]", error);
      return sendJson(res, error.statusCode || 500, {
        error: error.message,
        tipo: error.tipo,
      });
    }
  });

  const port = Number(process.env.PORT || 3001);
  server.listen(port, () => console.log(`[Hermes] API online na porta ${port}`));
  return server;
}

module.exports = { createHermesServer };
