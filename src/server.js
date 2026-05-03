// ════════════════════════════════════════════════════════
//  HERMES — Servidor HTTP
//  src/server.js
// ════════════════════════════════════════════════════════

const http = require('http');
const fs   = require('fs');
const path = require('path');
const { buildEscalaMessage, buildAlmocoMessage } = require('./utils/messageBuilder');
const { channels } = require('./config/config');

// ── Arquivo de persistência ───────────────────────────
const DATA_DIR   = path.join(__dirname, '../data');
const COLAB_FILE = path.join(DATA_DIR, 'colaboradores.json');
const LOG_FILE   = path.join(DATA_DIR, 'escala-log.json');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readJSON(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJSON(file, data) {
  ensureDataDir();
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}

function getColaboradores() {
  if (fs.existsSync(COLAB_FILE)) {
    return readJSON(COLAB_FILE, null) || require('./config/colaboradores').COLABORADORES;
  }

  return require('./config/colaboradores').COLABORADORES;
}

function logEscala(escalaState, date) {
  const log = readJSON(LOG_FILE, {});
  const key = date || new Date().toISOString().slice(0, 10);

  log[key] = escalaState;
  writeJSON(LOG_FILE, log);
}

function parseLocalDate(iso) {
  if (!iso) return new Date();

  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';

    req.on('data', chunk => {
      body += chunk;

      // Proteção simples contra body muito grande
      if (body.length > 2_000_000) {
        req.destroy();
        reject(new Error('Payload muito grande'));
      }
    });

    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error('JSON inválido'));
      }
    });

    req.on('error', reject);
  });
}

function sendJSON(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
}

function normalizeDiscordId(item) {
  return item?.discordId || item?.discord_id || item?.id || null;
}

async function sendDM(client, discordId, message) {
  const user = await client.users.fetch(discordId);
  await user.send(message);
}

function buildNovoAvisoMessage({ nome, canal, titulo, mensagem }) {
  return [
    `📢 **Novo aviso publicado**`,
    ``,
    `Olá, **${nome}**!`,
    ``,
    `Foi publicado um novo aviso no canal **#${canal || 'avisos'}**.`,
    titulo ? `📌 **${titulo}**` : null,
    ``,
    mensagem || `Por favor, leia o aviso e marque o visto de lido no canal correspondente.`,
    ``,
    `✅ Após ler, marque o visto no Discord.`
  ].filter(Boolean).join('\n');
}

function buildPausasMessage({ pausas, colaboradores }) {
  const lista = Array.isArray(colaboradores) ? colaboradores : [];

  let msg = `☕ **Pausas PIT STOP**\n\n`;

  lista.forEach(c => {
    const nome = c.nome;
    const p = pausas?.[nome];

    if (!p) return;

    msg += `**${nome}**\n`;
    msg += `Entrada: ${p.entrada || '--:--'}\n`;
    msg += `Pausa 10: ${p.pausa_10_1 || '--:--'}\n`;
    msg += `Pausa 20: ${p.pausa_20 || '--:--'}\n`;
    msg += `Pausa 10: ${p.pausa_10_2 || '--:--'}\n`;
    msg += `Saída: ${p.saida || '--:--'}\n\n`;
  });

  return msg.trim();
}

function startServer(client) {
  const PORT       = process.env.PORT || 3001;
  const API_SECRET = process.env.API_SECRET || '';

  const server = http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', process.env.SITE_URL || '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-secret');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // ── Health público ────────────────────────────────
    if (req.method === 'GET' && req.url === '/health') {
      return sendJSON(res, 200, {
        status: 'ok',
        bot: client.user?.tag || 'conectando...'
      });
    }

    // ── Autenticação ──────────────────────────────────
    if (API_SECRET && req.headers['x-api-secret'] !== API_SECRET) {
      return sendJSON(res, 401, { error: 'Não autorizado' });
    }

    // ──────────────────────────────────────────────────
    //  POST /sync/colaboradores
    // ──────────────────────────────────────────────────
    if (req.method === 'POST' && req.url === '/sync/colaboradores') {
      try {
        const { colaboradores } = await readBody(req);

        if (!colaboradores || !Array.isArray(colaboradores)) {
          return sendJSON(res, 400, { error: 'colaboradores inválidos' });
        }

        writeJSON(COLAB_FILE, colaboradores);

        console.log(`[HERMES] Colaboradores sincronizados: ${colaboradores.length}`);

        return sendJSON(res, 200, {
          ok: true,
          total: colaboradores.length
        });

      } catch (err) {
        return sendJSON(res, 500, { error: err.message });
      }
    }

    // ──────────────────────────────────────────────────
    //  POST /send/escala
    // ──────────────────────────────────────────────────
    if (req.method === 'POST' && req.url === '/send/escala') {
      try {
        const { escalaState, data } = await readBody(req);

        if (!escalaState) {
          throw new Error('escalaState ausente no body');
        }

        logEscala(escalaState, data);

        const date     = parseLocalDate(data);
        const mensagem = buildEscalaMessage(escalaState, date);

        if (!mensagem) {
          return sendJSON(res, 400, { error: 'Nenhum colaborador com status definido' });
        }

        const channel = await client.channels.fetch(channels.escala).catch(() => null);

        if (!channel) {
          return sendJSON(res, 500, { error: 'Canal de escala não encontrado' });
        }

        await channel.send(mensagem);

        console.log(`[HERMES] Escala (${data}) enviada para #${channel.name}`);

        return sendJSON(res, 200, {
          ok: true,
          canal: channel.name,
          data
        });

      } catch (err) {
        console.error('[HERMES] Erro em /send/escala:', err);
        return sendJSON(res, 500, { error: err.message });
      }
    }

    // ──────────────────────────────────────────────────
    //  POST /send/almoco
    // ──────────────────────────────────────────────────
    if (req.method === 'POST' && req.url === '/send/almoco') {
      try {
        const { almocoState, data } = await readBody(req);
        const COLABORADORES = getColaboradores();

        let lista;

        if (almocoState) {
          lista = COLABORADORES
            .filter(c => almocoState[c.nome]?.done)
            .map(c => ({
              ...c,
              almoco: almocoState[c.nome]?.horario || c.almoco
            }));
        } else {
          lista = COLABORADORES;
        }

        const date     = parseLocalDate(data);
        const mensagem = buildAlmocoMessage(lista, date);

        if (!mensagem) {
          return sendJSON(res, 400, { error: 'Nenhum colaborador marcado para almoço' });
        }

        const channel = await client.channels.fetch(channels.almoco).catch(() => null);

        if (!channel) {
          return sendJSON(res, 500, { error: 'Canal de almoço não encontrado' });
        }

        await channel.send(mensagem);

        console.log(`[HERMES] Almoço (${data}) enviado para #${channel.name}`);

        return sendJSON(res, 200, {
          ok: true,
          canal: channel.name,
          colaboradores: lista.length,
          data
        });

      } catch (err) {
        console.error('[HERMES] Erro em /send/almoco:', err);
        return sendJSON(res, 500, { error: err.message });
      }
    }

    // ════════════════════════════════════════════════════
    //  GESTÃO PIT STOP
    // ════════════════════════════════════════════════════

    // ──────────────────────────────────────────────────
    //  POST /send/novo-aviso
    //  Envia DM individual para colaboradores do PIT STOP
    // ──────────────────────────────────────────────────
    if (req.method === 'POST' && req.url === '/send/novo-aviso') {
      try {
        const {
          canal,
          titulo,
          mensagem,
          destinatarios
        } = await readBody(req);

        if (!destinatarios || !Array.isArray(destinatarios) || destinatarios.length === 0) {
          return sendJSON(res, 400, { error: 'Nenhum destinatário informado' });
        }

        const resultado = {
          enviados: [],
          falhas: []
        };

        for (const item of destinatarios) {
          const nome = item.nome || 'colaborador';
          const discordId = normalizeDiscordId(item);

          if (!discordId) {
            resultado.falhas.push({
              nome,
              motivo: 'Discord ID ausente'
            });
            continue;
          }

          const dm = buildNovoAvisoMessage({
            nome,
            canal,
            titulo,
            mensagem
          });

          try {
            await sendDM(client, discordId, dm);

            resultado.enviados.push({
              nome,
              discordId
            });

            console.log(`[HERMES PIT STOP] Aviso enviado para ${nome}`);

          } catch (err) {
            resultado.falhas.push({
              nome,
              discordId,
              motivo: err.message
            });

            console.error(`[HERMES PIT STOP] Falha ao enviar aviso para ${nome}:`, err.message);
          }
        }

        return sendJSON(res, 200, {
          ok: true,
          total: destinatarios.length,
          enviados: resultado.enviados.length,
          falhas: resultado.falhas.length,
          detalhes: resultado
        });

      } catch (err) {
        console.error('[HERMES PIT STOP] Erro em /send/novo-aviso:', err);
        return sendJSON(res, 500, { error: err.message });
      }
    }

    // ──────────────────────────────────────────────────
    //  POST /send/pitstop-pausas
    //  Envia pausas em canal do Discord
    // ──────────────────────────────────────────────────
    if (req.method === 'POST' && req.url === '/send/pitstop-pausas') {
      try {
        const { pausas, colaboradores, channelId } = await readBody(req);

        if (!pausas) {
          return sendJSON(res, 400, { error: 'pausas ausente no body' });
        }

        const mensagem = buildPausasMessage({ pausas, colaboradores });

        if (!mensagem) {
          return sendJSON(res, 400, { error: 'Nenhuma pausa encontrada para envio' });
        }

        const targetChannelId =
          channelId ||
          process.env.CHANNEL_PITSTOP_PAUSAS ||
          process.env.CHANNEL_PITSTOP ||
          channels.escala;

        const channel = await client.channels.fetch(targetChannelId).catch(() => null);

        if (!channel) {
          return sendJSON(res, 500, { error: 'Canal de pausas PIT STOP não encontrado' });
        }

        // Divide se passar de 2000 caracteres
        const partes = mensagem.match(/.{1,1900}/gs) || [mensagem];

        for (const parte of partes) {
          await channel.send(parte);
        }

        console.log(`[HERMES PIT STOP] Pausas enviadas para #${channel.name}`);

        return sendJSON(res, 200, {
          ok: true,
          canal: channel.name,
          partes: partes.length
        });

      } catch (err) {
        console.error('[HERMES PIT STOP] Erro em /send/pitstop-pausas:', err);
        return sendJSON(res, 500, { error: err.message });
      }
    }

    // ──────────────────────────────────────────────────
    //  POST /send/pitstop-folga
    //  Envia lembrete de folga para você/gestão
    // ──────────────────────────────────────────────────
    if (req.method === 'POST' && req.url === '/send/pitstop-folga') {
      try {
        const {
          colaborador,
          data,
          motivo,
          gestorDiscordId
        } = await readBody(req);

        if (!colaborador || !data) {
          return sendJSON(res, 400, { error: 'colaborador e data são obrigatórios' });
        }

        const targetUserId =
          gestorDiscordId ||
          process.env.GESTOR_DISCORD_ID ||
          process.env.LUCAS_DISCORD_ID;

        if (!targetUserId) {
          return sendJSON(res, 400, {
            error: 'GESTOR_DISCORD_ID não configurado no Railway'
          });
        }

        const msg = [
          `🏖️ **Folga cadastrada — PIT STOP**`,
          ``,
          `Colaborador: **${colaborador}**`,
          `Data: **${data}**`,
          motivo ? `Motivo: ${motivo}` : null,
          ``,
          `🔔 Hermes irá te lembrar dessa folga conforme sua rotina configurada.`
        ].filter(Boolean).join('\n');

        await sendDM(client, targetUserId, msg);

        console.log(`[HERMES PIT STOP] Folga enviada no privado para gestor`);

        return sendJSON(res, 200, {
          ok: true,
          enviadoPara: targetUserId
        });

      } catch (err) {
        console.error('[HERMES PIT STOP] Erro em /send/pitstop-folga:', err);
        return sendJSON(res, 500, { error: err.message });
      }
    }

    // ──────────────────────────────────────────────────
    //  POST /send/pitstop-aniversario
    //  Envia lembrete de aniversário para gestor
    // ──────────────────────────────────────────────────
    if (req.method === 'POST' && req.url === '/send/pitstop-aniversario') {
      try {
        const {
          colaborador,
          data,
          gestorDiscordId
        } = await readBody(req);

        if (!colaborador) {
          return sendJSON(res, 400, { error: 'colaborador obrigatório' });
        }

        const targetUserId =
          gestorDiscordId ||
          process.env.GESTOR_DISCORD_ID ||
          process.env.LUCAS_DISCORD_ID;

        if (!targetUserId) {
          return sendJSON(res, 400, {
            error: 'GESTOR_DISCORD_ID não configurado no Railway'
          });
        }

        const msg = [
          `🎂 **Aniversário PIT STOP**`,
          ``,
          `Hoje é aniversário de **${colaborador}**!`,
          data ? `Data: **${data}**` : null,
          ``,
          `Não esqueça de enviar os parabéns e a ilustração.`
        ].filter(Boolean).join('\n');

        await sendDM(client, targetUserId, msg);

        console.log(`[HERMES PIT STOP] Lembrete de aniversário enviado`);

        return sendJSON(res, 200, {
          ok: true,
          enviadoPara: targetUserId
        });

      } catch (err) {
        console.error('[HERMES PIT STOP] Erro em /send/pitstop-aniversario:', err);
        return sendJSON(res, 500, { error: err.message });
      }
    }

    // ──────────────────────────────────────────────────
    //  POST /send/escala-sabado
    //  Envia escala de apoio de sábado
    // ──────────────────────────────────────────────────
    if (req.method === 'POST' && req.url === '/send/escala-sabado') {
      try {
        const {
          data,
          escala,
          channelId
        } = await readBody(req);

        if (!escala || !Array.isArray(escala)) {
          return sendJSON(res, 400, { error: 'escala inválida ou ausente' });
        }

        let msg = `📅 **Escala de Apoio — Sábado**`;
        if (data) msg += `\n📌 Data: **${data}**`;
        msg += `\n\n`;

        const porSetor = {};

        escala.forEach(item => {
          const setor = item.setor || 'Sem setor';

          if (!porSetor[setor]) porSetor[setor] = [];
          porSetor[setor].push(item);
        });

        Object.entries(porSetor).forEach(([setor, itens]) => {
          msg += `**${setor}:**\n`;

          itens.forEach(item => {
            msg += `• ${item.nome}`;
            if (item.horario) msg += ` — ${item.horario}`;
            if (item.obs) msg += ` *(${item.obs})*`;
            msg += `\n`;
          });

          msg += `\n`;
        });

        const targetChannelId =
          channelId ||
          process.env.CHANNEL_PITSTOP_ESCALA ||
          process.env.CHANNEL_PITSTOP ||
          channels.escala;

        const channel = await client.channels.fetch(targetChannelId).catch(() => null);

        if (!channel) {
          return sendJSON(res, 500, { error: 'Canal da escala de sábado não encontrado' });
        }

        await channel.send(msg.trim());

        console.log(`[HERMES PIT STOP] Escala de sábado enviada para #${channel.name}`);

        return sendJSON(res, 200, {
          ok: true,
          canal: channel.name,
          total: escala.length
        });

      } catch (err) {
        console.error('[HERMES PIT STOP] Erro em /send/escala-sabado:', err);
        return sendJSON(res, 500, { error: err.message });
      }
    }

    // ── 404 ────────────────────────────────────────────
    return sendJSON(res, 404, { error: 'Rota não encontrada' });
  });

  server.listen(PORT, () => {
    console.log(`[HERMES] Servidor HTTP ativo na porta ${PORT}`);
  });

  return server;
}

module.exports = {
  startServer,
  getColaboradores,
  readJSON,
  LOG_FILE
};