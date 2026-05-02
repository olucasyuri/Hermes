// ════════════════════════════════════════════════════════
//  HERMES — Configuração Central
//  Edite aqui os IDs de canal e comportamentos do bot
// ════════════════════════════════════════════════════════

module.exports = {

  // ── Canais do Discord ──────────────────────────────────
  // Cole aqui os IDs dos canais (clique com botão direito
  // no canal > "Copiar ID do canal" — modo dev ativo)
  channels: {
    escala:  process.env.CHANNEL_ESCALA  || 'ID_DO_CANAL_ESCALA',
    almoco:  process.env.CHANNEL_ALMOCO  || 'ID_DO_CANAL_ALMOCO',
    // Adicione novos canais aqui conforme o Hermes crescer
    // relatorio: process.env.CHANNEL_RELATORIO || 'ID_DO_CANAL',
  },

  // ── Fuso horário ──────────────────────────────────────
  // O Node usa UTC por padrão. Ajuste o offset de Brasília.
  // Brasília = UTC-3 → offset = -3
  timezoneOffset: -3,

  // ── Agendamento do Almoço ─────────────────────────────
  // Horário em que o Hermes envia o resumo diário de almoços
  // Formato: { hora: 0-23, minuto: 0-59 } (horário de Brasília)
  almocoSchedule: {
    hora:   9,   // 09:00
    minuto: 0,
    // Dias da semana: 1=seg, 2=ter, 3=qua, 4=qui, 5=sex
    dias: [1, 2, 3, 4, 5],
  },

  // ── Prefixo de comandos legados (opcional) ─────────────
  prefix: '!hermes',

  // ── Emojis e formatação ────────────────────────────────
  emojis: {
    interno:  '🏢',
    externo:  '🚗',
    off:      '🔴',
    rodizio:  '🔄',
    almoco:   '🍽️',
    ok:       '✅',
    erro:     '❌',
  },
};
