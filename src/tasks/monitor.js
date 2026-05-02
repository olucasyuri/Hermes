// ════════════════════════════════════════════════════════
//  HERMES — Task: Monitor de Serviços
//  Monitora o site de status (Uptime Kuma) e alerta no
//  Discord apenas quando um serviço cai ou volta.
//  Arquivo: src/tasks/monitor.js
// ════════════════════════════════════════════════════════

const https = require('https');
const { channels } = require('../config/config');

// ── URL do endpoint JSON do Uptime Kuma ───────────────
// O Uptime Kuma expõe os dados em /api/status-page/heartbeat/<slug>
// O slug é o que aparece na URL: /status/monitor → slug = 'monitor'
const STATUS_URL = process.env.MONITOR_URL ||
  'https://monitoramento-softcomshop.softcomapps.com/api/status-page/heartbeat/monitor';

// ── Estado anterior dos serviços (em memória) ─────────
const previousStatus = {}; // { [serviceName]: 'up' | 'down' }

// ── Helpers ───────────────────────────────────────────
function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Hermes-Monitor/1.0' } }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error('JSON inválido: ' + e.message)); }
      });
    }).on('error', reject);
  });
}

function statusEmoji(up) {
  return up ? '🟢' : '🔴';
}

function buildAlertMessage(changed) {
  const now = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  let msg = `⚡ **Hermes Monitor** — ${now}\n\n`;

  const caindo  = changed.filter(s => s.status === 'down');
  const voltando = changed.filter(s => s.status === 'up');

  if (caindo.length) {
    msg += `🔴 **Serviço(s) com problema:**\n`;
    caindo.forEach(s => msg += `  • **${s.name}** — fora do ar\n`);
    msg += '\n';
  }

  if (voltando.length) {
    msg += `🟢 **Serviço(s) restaurado(s):**\n`;
    voltando.forEach(s => msg += `  • **${s.name}** — operacional\n`);
  }

  return msg.trim();
}

// ── Task principal ────────────────────────────────────
module.exports = {
  name: 'monitor-servicos',

  // Roda a cada 2 minutos todos os dias
  // O scheduler do Hermes verifica a cada 60s,
  // então usamos um controle interno de intervalo
  schedule: {
    hora:   null, // null = ignora filtro de hora (roda pelo intervalo abaixo)
    minuto: null,
    dias:   [0, 1, 2, 3, 4, 5, 6],
  },

  // Intervalo em ms (2 minutos)
  interval: 2 * 60 * 1000,
  _lastRun: 0,

  async execute(client, date) {
    // Controle de intervalo manual (a cada 2 min)
    const now = Date.now();
    if (now - this._lastRun < this.interval) return;
    this._lastRun = now;

    try {
      const json = await fetchJSON(STATUS_URL);

      // Uptime Kuma retorna { heartbeatList: { [id]: [...heartbeats] }, monitorList: { [id]: monitor } }
      const { heartbeatList, monitorList } = json;
      if (!heartbeatList || !monitorList) return;

      const changed = [];

      for (const [id, heartbeats] of Object.entries(heartbeatList)) {
        const monitor = monitorList[id];
        if (!monitor) continue;

        const name = monitor.name;
        // Último heartbeat define o status atual
        const last = heartbeats[heartbeats.length - 1];
        if (!last) continue;

        const isUp     = last.status === 1;
        const current  = isUp ? 'up' : 'down';
        const previous = previousStatus[name];

        // Só alerta se mudou
        if (previous !== undefined && previous !== current) {
          changed.push({ name, status: current });
          console.log(`[HERMES Monitor] ${name}: ${previous} → ${current}`);
        }

        previousStatus[name] = current;
      }

      // Se houve mudança, envia alerta
      if (changed.length > 0) {
        const channelId = channels.alertas || channels.escala;
        const channel   = await client.channels.fetch(channelId).catch(() => null);

        if (!channel) {
          console.error('[HERMES Monitor] Canal de alertas não encontrado. Configure CHANNEL_ALERTAS no .env');
          return;
        }

        const mensagem = buildAlertMessage(changed);
        await channel.send(mensagem);
        console.log(`[HERMES Monitor] Alerta enviado para #${channel.name}`);
      }

    } catch (err) {
      console.error('[HERMES Monitor] Erro ao verificar status:', err.message);
    }
  },
};
