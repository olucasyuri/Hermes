// ════════════════════════════════════════════════════════
//  HERMES — Task: Relatório Semanal de Presença
//  Toda sexta-feira às 18h envia um resumo da semana
//  Arquivo: src/tasks/relatorio.js
// ════════════════════════════════════════════════════════

const { channels } = require('../config/config');
const { readJSON, LOG_FILE, getColaboradores } = require('../server');

const DIAS_NOME = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const STATUS_LABEL = { int: '🏢 Int', ext: '🚗 Ext', off: '🔴 OFF', rod: '🔄 Rod', none: '⬜' };

module.exports = {
  name: 'relatorio-semanal',

  schedule: {
    hora:   21,        // 18h Brasília = 21h UTC
    minuto: 0,
    dias:   [5],       // Sexta-feira
  },

  async execute(client, date) {
    const channel = await client.channels.fetch(channels.relatorio || channels.escala).catch(() => null);
    if (!channel) {
      console.error('[HERMES] Canal de relatório não encontrado');
      return;
    }

    const log = readJSON(LOG_FILE, {});
    if (Object.keys(log).length === 0) {
      await channel.send('📊 **Relatório Semanal** — Nenhuma escala registrada esta semana.');
      return;
    }

    // Filtra os últimos 7 dias
    const hoje   = new Date();
    const diasSemana  = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(hoje);
      d.setDate(hoje.getDate() - (6 - i));
      return d.toISOString().slice(0, 10);
    });

    const semana = diasSemana.filter(d => log[d]);
    if (semana.length === 0) {
      await channel.send('📊 **Relatório Semanal** — Nenhuma escala registrada esta semana.');
      return;
    }

    const COLABORADORES = getColaboradores();

    // Conta status por colaborador
    const contagem = {}; // { [nome]: { int:0, ext:0, off:0, rod:0 } }
    COLABORADORES.forEach(c => {
      contagem[c.nome] = { int: 0, ext: 0, off: 0, rod: 0 };
    });

    semana.forEach(dataKey => {
      const estado = log[dataKey];
      Object.entries(estado).forEach(([nome, { status }]) => {
        if (contagem[nome] && status && status !== 'none') {
          contagem[nome][status]++;
        }
      });
    });

    // Monta a mensagem
    const dataInicio = semana[0].split('-').reverse().join('/');
    const dataFim    = semana[semana.length - 1].split('-').reverse().join('/');

    let msg = `📊 **Relatório Semanal de Presença**\n`;
    msg    += `📅 ${dataInicio} → ${dataFim} (${semana.length} dia(s))\n\n`;

    // Agrupa por região
    const byRegion = {};
    COLABORADORES.forEach(c => {
      if (!byRegion[c.regiao]) byRegion[c.regiao] = [];
      byRegion[c.regiao].push(c);
    });

    Object.entries(byRegion).forEach(([reg, cols]) => {
      msg += `**${reg}:**\n`;
      cols.forEach(c => {
        const cnt = contagem[c.nome];
        const partes = [];
        if (cnt.int)  partes.push(`🏢${cnt.int}d`);
        if (cnt.ext)  partes.push(`🚗${cnt.ext}d`);
        if (cnt.off)  partes.push(`🔴${cnt.off}d`);
        if (cnt.rod)  partes.push(`🔄${cnt.rod}d`);
        const resumo = partes.length ? partes.join(' ') : '—';
        msg += `  ${c.nome}: ${resumo}\n`;
      });
      msg += '\n';
    });

    // Top presença interna
    const ranking = COLABORADORES
      .map(c => ({ nome: c.nome, int: contagem[c.nome]?.int || 0 }))
      .sort((a, b) => b.int - a.int)
      .slice(0, 3);

    if (ranking[0]?.int > 0) {
      msg += `🏆 **Mais dias interno:** `;
      msg += ranking.filter(r => r.int > 0).map(r => `${r.nome} (${r.int}d)`).join(' · ');
    }

    await channel.send(msg.trim());
    console.log(`[HERMES] Relatório semanal enviado para #${channel.name}`);
  },
};
