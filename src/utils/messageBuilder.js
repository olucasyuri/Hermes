// ════════════════════════════════════════════════════════
//  HERMES — Construtor de Mensagens
//  Gera as mensagens formatadas para o Discord
//  (espelha a lógica do renderEscalaOutput e generateAlmoco)
// ════════════════════════════════════════════════════════

const { groupByRegion } = require('../config/colaboradores');
const { emojis }        = require('../config/config');

const DIAS = ['Domingo','Segunda-Feira','Terça-Feira','Quarta-Feira','Quinta-Feira','Sexta-Feira','Sábado'];

/**
 * Formata a data para exibição
 * @param {Date} date
 * @returns {{ dia, mes, ano, diaNome, label }}
 */
function formatDate(date) {
  const dia     = String(date.getDate()).padStart(2, '0');
  const mes     = String(date.getMonth() + 1).padStart(2, '0');
  const ano     = date.getFullYear();
  const diaNome = DIAS[date.getDay()];
  return { dia, mes, ano, diaNome, label: `${dia}/${mes}/${ano}` };
}

/**
 * Gera a mensagem de ESCALA (Internos / Externos / OFF / Rodízio)
 *
 * @param {Object} escalaState  - { [nome]: { status: 'int'|'ext'|'off'|'rod', obs: '' } }
 * @param {Date}   date
 * @returns {string} Mensagem formatada para Discord
 */
function buildEscalaMessage(escalaState, date = new Date()) {
  const { dia, mes, ano, diaNome } = formatDate(date);

  // Filtra por status
  const byStatus = { int: [], ext: [], off: [], rod: [] };
  for (const [nome, st] of Object.entries(escalaState)) {
    if (byStatus[st.status]) byStatus[st.status].push({ nome, obs: st.obs || '' });
  }

  const hasContent = Object.values(byStatus).some(arr => arr.length > 0);
  if (!hasContent) return null;

  let msg = `**${dia}/${mes}/${ano} - ${diaNome}**\n`;

  // Precisa buscar horario/regiao dos colaboradores
  const { COLABORADORES } = require('../config/colaboradores');
  const lookup = Object.fromEntries(COLABORADORES.map(c => [c.nome, c]));

  if (byStatus.int.length) {
    msg += `\n${emojis.interno} **Internos:**\n`;
    const enriched = byStatus.int
      .map(({ nome, obs }) => ({ ...lookup[nome], obs }))
      .filter(c => c.regiao);
    Object.entries(groupByRegion(enriched)).forEach(([reg, cols]) => {
      msg += `  **${reg}:**\n`;
      cols.forEach(c => {
        msg += `  ${c.horario} - ${c.nome}${c.obs ? ` *(${c.obs})*` : ''}\n`;
      });
    });
  }

  if (byStatus.ext.length) {
    msg += `\n${emojis.externo} **Externos:**\n`;
    const enriched = byStatus.ext
      .map(({ nome }) => lookup[nome])
      .filter(Boolean);
    Object.entries(groupByRegion(enriched)).forEach(([reg, cols]) => {
      msg += `  **${reg}:**\n`;
      cols.forEach(c => msg += `  ${c.horario} - ${c.nome}\n`);
    });
  }

  if (byStatus.off.length) {
    msg += `\n${emojis.off} **OFF:**\n`;
    byStatus.off.forEach(({ nome }) => msg += `${nome}\n`);
  }

  if (byStatus.rod.length) {
    msg += `\n${emojis.rodizio} **Rodízio / Demanda específica:**\n`;
    byStatus.rod.forEach(({ nome }) => {
      const c = lookup[nome];
      if (c) msg += `${c.horario} - ${nome}\n`;
    });
  }

  return msg.trim();
}

/**
 * Gera a mensagem de ALMOÇO (horários do dia)
 *
 * @param {Array}  colaboradores - lista de colaboradores (com campo .almoco)
 * @param {Date}   date
 * @returns {string} Mensagem formatada para Discord
 */
function buildAlmocoMessage(colaboradores, date = new Date()) {
  const { dia, mes, ano, diaNome } = formatDate(date);

  if (!colaboradores || colaboradores.length === 0) return null;

  let msg = `${emojis.almoco} **Horários de Almoço – ${dia}/${mes}/${ano} (${diaNome})**\n`;

  Object.entries(groupByRegion(colaboradores)).forEach(([reg, cols]) => {
    msg += `\n**${reg}:**\n`;
    // Ordena por horário de almoço
    cols
      .slice()
      .sort((a, b) => a.almoco.localeCompare(b.almoco))
      .forEach(c => msg += `${c.almoco} – ${c.nome}\n`);
  });

  return msg.trim();
}

module.exports = { buildEscalaMessage, buildAlmocoMessage, formatDate };
