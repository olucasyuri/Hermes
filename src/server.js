// ════════════════════════════════════════════════════════
//  HERMES — Servidor HTTP
//  src/server.js
// ════════════════════════════════════════════════════════

const http = require('http');
const { buildEscalaMessage, buildAlmocoMessage } = require('./utils/messageBuilder');
const { channels } = require('./config/config');

/**
 * Converte string ISO 'YYYY-MM-DD' em Date no fuso de Brasília
 * evitando o problema de UTC que adianta/atrasa 1 dia
 */
function parseLocalDate(iso) {
  if (!iso) return new Date();
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d); // Date local da máquina
}

function startServer(client) {
  const PORT = process.env.PORT || 3001;
  const API_SECRET = process.env.API_SECRET || '';

  const server = http.createServer(async (req, res) => {

    // ── CORS ──────────────────────────────────────────
    res.setHeader('Access-Control-Allow-Origin', process.env.SITE_URL || '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-secret');

    if (req.method === 'OPTIONS') {
      res.writeHead(204); res.end(); return;
    }

    // ── Health check (público) ────────────────────────
    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', bot: client.user?.tag || 'conectando...' }));
      return;
    }

    // ── Auth ──────────────────────────────────────────
    if (API_SECRET && req.headers['x-api-secret'] !== API_SECRET) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Não autorizado' }));
      return;
    }

    // ── POST /send/escala ─────────────────────────────
    if (req.method === 'POST' && req.url === '/send/escala') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', async () => {
        try {
          const { escalaState, data } = JSON.parse(body);
          if (!escalaState) throw new Error('escalaState ausente no body');

          const date = parseLocalDate(data); // ← usa a data do site
          const mensagem = buildEscalaMessage(escalaState, date);

          if (!mensagem) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Nenhum colaborador com status definido' }));
            return;
          }

          const channel = await client.channels.fetch(channels.escala).catch(() => null);
          if (!channel) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Canal de escala não encontrado' }));
            return;
          }

          await channel.send(mensagem);
          console.log(`[HERMES] Escala (${data}) enviada para #${channel.name}`);

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, canal: channel.name, data }));

        } catch (err) {
          console.error('[HERMES] Erro em /send/escala:', err);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message }));
        }
      });
      return;
    }

    // ── POST /send/almoco ─────────────────────────────
    if (req.method === 'POST' && req.url === '/send/almoco') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', async () => {
        try {
          const { almocoState, data } = JSON.parse(body);
          const { COLABORADORES } = require('./config/colaboradores');

          let lista;
          if (almocoState) {
            lista = COLABORADORES
              .filter(c => almocoState[c.nome]?.done)
              .map(c => ({ ...c, almoco: almocoState[c.nome]?.horario || c.almoco }));
          } else {
            lista = COLABORADORES;
          }

          const date = parseLocalDate(data); // ← usa a data do site
          const mensagem = buildAlmocoMessage(lista, date);

          if (!mensagem) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Nenhum colaborador marcado para almoço' }));
            return;
          }

          const channel = await client.channels.fetch(channels.almoco).catch(() => null);
          if (!channel) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Canal de almoço não encontrado' }));
            return;
          }

          await channel.send(mensagem);
          console.log(`[HERMES] Almoço (${data}) enviado para #${channel.name}`);

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, canal: channel.name, colaboradores: lista.length, data }));

        } catch (err) {
          console.error('[HERMES] Erro em /send/almoco:', err);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message }));
        }
      });
      return;
    }

    // 404
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Rota não encontrada' }));
  });

  server.listen(PORT, () => {
    console.log(`[HERMES] Servidor HTTP ativo na porta ${PORT}`);
  });

  return server;
}

module.exports = { startServer };
