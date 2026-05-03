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
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return fallback; }
}

function writeJSON(file, data) {
  ensureDataDir();
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}

// ── Colaboradores dinâmicos ───────────────────────────
// Lê do arquivo salvo pelo sync, ou usa o padrão do config
function getColaboradores() {
  if (fs.existsSync(COLAB_FILE)) {
    return readJSON(COLAB_FILE, null) || require('./config/colaboradores').COLABORADORES;
  }
  return require('./config/colaboradores').COLABORADORES;
}

// ── Log de escalas (para relatório semanal) ───────────
function logEscala(escalaState, date) {
  const log = readJSON(LOG_FILE, {});
  const key  = date || new Date().toISOString().slice(0, 10);
  log[key]   = escalaState;
  writeJSON(LOG_FILE, log);
}

function parseLocalDate(iso) {
  if (!iso) return new Date();
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function startServer(client) {
  const PORT       = process.env.PORT || 3001;
  const API_SECRET = process.env.API_SECRET || '';

  const server = http.createServer(async (req, res) => {

    res.setHeader('Access-Control-Allow-Origin', process.env.SITE_URL || '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-secret');

    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

    // ── Health (público) ──────────────────────────────
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

    // ── POST /sync/colaboradores ──────────────────────
    if (req.method === 'POST' && req.url === '/sync/colaboradores') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        try {
          const { colaboradores } = JSON.parse(body);
          if (!colaboradores || !Array.isArray(colaboradores)) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'colaboradores inválidos' }));
            return;
          }
          writeJSON(COLAB_FILE, colaboradores);
          console.log(`[HERMES] Colaboradores sincronizados: ${colaboradores.length}`);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, total: colaboradores.length }));
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message }));
        }
      });
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

          // Salva no log para o relatório semanal
          logEscala(escalaState, data);

          const date     = parseLocalDate(data);
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
          const COLABORADORES = getColaboradores();
          let lista;

          if (almocoState) {
            lista = COLABORADORES
              .filter(c => almocoState[c.nome]?.done)
              .map(c => ({ ...c, almoco: almocoState[c.nome]?.horario || c.almoco }));
          } else {
            lista = COLABORADORES;
          }

          const date     = parseLocalDate(data);
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

module.exports = { startServer, getColaboradores, readJSON, LOG_FILE };
