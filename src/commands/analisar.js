// ════════════════════════════════════════════════════════
//  HERMES — Comando: /analisar
//  Análise de escalas SEM IA
//  Arquivo: src/commands/analisar.js
// ════════════════════════════════════════════════════════

const { SlashCommandBuilder } = require('discord.js');
const { getColaboradores, readJSON, LOG_FILE } = require('../server');

const LABEL = {
  int: '🏢 Interno',
  ext: '🚗 Externo',
  off: '🔴 OFF',
  rod: '🔄 Rodízio'
};

const DIAS_NOME = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

function pct(valor, total) {
  if (!total) return 0;
  return Math.round((valor / total) * 100);
}

function filtrarUltimosDias(log, dias = 7) {
  const hoje = new Date();
  const datas = Array.from({ length: dias }, (_, i) => {
    const d = new Date(hoje);
    d.setDate(hoje.getDate() - i);
    return d.toISOString().slice(0, 10);
  });

  return Object.fromEntries(
    Object.entries(log).filter(([data]) => datas.includes(data))
  );
}

function gerarAnalise(log, colabs, pergunta = null) {
  const datas = Object.keys(log).sort();

  if (!datas.length) {
    return '📊 Nenhuma escala registrada para análise.';
  }

  const resumo = {};
  const porDiaSemana = {};
  const porRegiao = {};
  const totalGeral = { int: 0, ext: 0, off: 0, rod: 0 };

  DIAS_NOME.forEach((_, i) => {
    porDiaSemana[i] = { int: 0, ext: 0, off: 0, rod: 0, total: 0 };
  });

  colabs.forEach(c => {
    resumo[c.nome] = {
      nome: c.nome,
      regiao: c.regiao,
      int: 0,
      ext: 0,
      off: 0,
      rod: 0,
      total: 0
    };

    if (!porRegiao[c.regiao]) {
      porRegiao[c.regiao] = { int: 0, ext: 0, off: 0, rod: 0, total: 0 };
    }
  });

  datas.forEach(dataKey => {
    const [y, m, d] = dataKey.split('-').map(Number);
    const diaSem = new Date(y, m - 1, d).getDay();
    const escalaDia = log[dataKey];

    Object.entries(escalaDia).forEach(([nome, dados]) => {
      const status = dados?.status;

      if (!['int', 'ext', 'off', 'rod'].includes(status)) return;
      if (!resumo[nome]) return;

      resumo[nome][status]++;
      resumo[nome].total++;

      totalGeral[status]++;

      porDiaSemana[diaSem][status]++;
      porDiaSemana[diaSem].total++;

      const regiao = resumo[nome].regiao;
      porRegiao[regiao][status]++;
      porRegiao[regiao].total++;
    });
  });

  const totalLancamentos =
    totalGeral.int + totalGeral.ext + totalGeral.off + totalGeral.rod;

  const rankingInternos = Object.values(resumo)
    .filter(c => c.int > 0)
    .sort((a, b) => b.int - a.int)
    .slice(0, 5);

  const rankingOff = Object.values(resumo)
    .filter(c => c.off > 0)
    .sort((a, b) => b.off - a.off)
    .slice(0, 5);

  const diasComMaisInternos = Object.entries(porDiaSemana)
    .filter(([, v]) => v.total > 0)
    .sort((a, b) => b[1].int - a[1].int)
    .slice(0, 3);

  const regioes = Object.entries(porRegiao)
    .filter(([, v]) => v.total > 0)
    .sort((a, b) => b[1].int - a[1].int);

  const inicio = datas[0].split('-').reverse().join('/');
  const fim = datas[datas.length - 1].split('-').reverse().join('/');

  if (pergunta) {
    const p = pergunta.toLowerCase();

    if (p.includes('interno') || p.includes('internos')) {
      return [
        `🏢 **Análise de internos**`,
        `📅 Período: ${inicio} até ${fim}`,
        '',
        `Total de registros internos: **${totalGeral.int}**`,
        '',
        `🏆 **Top colaboradores internos:**`,
        rankingInternos.length
          ? rankingInternos.map((c, i) => `${i + 1}. ${c.nome} — ${c.int} dia(s)`).join('\n')
          : 'Nenhum registro interno encontrado.'
      ].join('\n');
    }

    if (p.includes('off') || p.includes('ausência') || p.includes('ausencia')) {
      return [
        `🔴 **Análise de OFF / ausências**`,
        `📅 Período: ${inicio} até ${fim}`,
        '',
        `Total de registros OFF: **${totalGeral.off}**`,
        '',
        `⚠️ **Mais registros OFF:**`,
        rankingOff.length
          ? rankingOff.map((c, i) => `${i + 1}. ${c.nome} — ${c.off} dia(s)`).join('\n')
          : 'Nenhum OFF registrado.'
      ].join('\n');
    }

    if (p.includes('dia') || p.includes('semana')) {
      return [
        `📅 **Análise por dia da semana**`,
        `📅 Período: ${inicio} até ${fim}`,
        '',
        diasComMaisInternos.length
          ? diasComMaisInternos.map(([dia, v]) =>
              `${DIAS_NOME[dia]} — ${v.int} internos, ${v.ext} externos, ${v.off} OFF`
            ).join('\n')
          : 'Nenhum dado por dia encontrado.'
      ].join('\n');
    }

    return [
      `🤖 **Hermes sem IA**`,
      `Ainda não interpreto perguntas livres complexas sem IA.`,
      '',
      `Tente perguntar usando termos como:`,
      `• "internos"`,
      `• "OFF"`,
      `• "dia da semana"`,
      `• "ausências"`
    ].join('\n');
  }

  let msg = '';

  msg += `📊 **Análise Geral de Escalas — Hermes**\n`;
  msg += `📅 Período: **${inicio} até ${fim}**\n`;
  msg += `🗓️ Dias registrados: **${datas.length}**\n\n`;

  msg += `📌 **Visão geral**\n`;
  msg += `🏢 Internos: **${totalGeral.int}** (${pct(totalGeral.int, totalLancamentos)}%)\n`;
  msg += `🚗 Externos: **${totalGeral.ext}** (${pct(totalGeral.ext, totalLancamentos)}%)\n`;
  msg += `🔴 OFF: **${totalGeral.off}** (${pct(totalGeral.off, totalLancamentos)}%)\n`;
  msg += `🔄 Rodízio: **${totalGeral.rod}** (${pct(totalGeral.rod, totalLancamentos)}%)\n\n`;

  msg += `🏆 **Top internos**\n`;
  msg += rankingInternos.length
    ? rankingInternos.map((c, i) => `${i + 1}. ${c.nome} — ${c.int} dia(s)`).join('\n')
    : 'Nenhum interno registrado.';
  msg += `\n\n`;

  msg += `📅 **Dias com maior presença interna**\n`;
  msg += diasComMaisInternos.length
    ? diasComMaisInternos.map(([dia, v]) =>
        `${DIAS_NOME[dia]} — ${v.int} internos`
      ).join('\n')
    : 'Nenhum dado encontrado.';
  msg += `\n\n`;

  msg += `🌎 **Resumo por região**\n`;
  msg += regioes.length
    ? regioes.map(([reg, v]) =>
        `**${reg}**: 🏢 ${v.int} | 🚗 ${v.ext} | 🔴 ${v.off} | 🔄 ${v.rod}`
      ).join('\n')
    : 'Nenhum dado por região.';
  msg += `\n\n`;

  msg += `⚠️ **Pontos de atenção**\n`;
  if (rankingOff.length) {
    msg += rankingOff.map((c, i) => `${i + 1}. ${c.nome} — ${c.off} OFF`).join('\n');
  } else {
    msg += 'Nenhum colaborador com OFF registrado no período.';
  }

  msg += `\n\n💡 **Sugestão do Hermes**\n`;
  msg += `Acompanhe os colaboradores com maior número de OFF e mantenha equilíbrio entre internos, externos e rodízio para evitar sobrecarga.`;

  return msg;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('analisar')
    .setDescription('Análise das escalas sem IA')
    .addSubcommand(sub =>
      sub.setName('semana')
        .setDescription('Resumo da semana atual')
    )
    .addSubcommand(sub =>
      sub.setName('geral')
        .setDescription('Análise completa do histórico')
    )
    .addSubcommand(sub =>
      sub.setName('perguntar')
        .setDescription('Faça uma pergunta simples sobre as escalas')
        .addStringOption(opt =>
          opt.setName('pergunta')
            .setDescription('Ex: Quem ficou mais interno? Quem ficou OFF?')
            .setRequired(true)
        )
    ),

  async execute(interaction) {
    await interaction.deferReply();

    try {
      const sub = interaction.options.getSubcommand();
      const log = readJSON(LOG_FILE, {});
      const colabs = getColaboradores();

      if (!log || Object.keys(log).length === 0) {
        return interaction.editReply(
          '📊 Nenhuma escala registrada ainda. Envie algumas escalas pelo site primeiro!'
        );
      }

      let logFiltrado = log;

      if (sub === 'semana') {
        logFiltrado = filtrarUltimosDias(log, 7);

        if (Object.keys(logFiltrado).length === 0) {
          return interaction.editReply('📊 Nenhuma escala registrada nos últimos 7 dias.');
        }
      }

      const pergunta = sub === 'perguntar'
        ? interaction.options.getString('pergunta')
        : null;

      const analise = gerarAnalise(logFiltrado, colabs, pergunta);

      if (analise.length <= 1900) {
        await interaction.editReply(analise);
      } else {
        const partes = analise.match(/.{1,1900}/gs) || [analise];

        await interaction.editReply(partes[0]);

        for (let i = 1; i < partes.length; i++) {
          await interaction.followUp(partes[i]);
        }
      }

    } catch (err) {
      console.error('[HERMES /analisar] Erro:', err);
      await interaction.editReply(`❌ Erro ao analisar: ${err.message}`);
    }
  }
};