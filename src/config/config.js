// ════════════════════════════════════════════════════════
//  HERMES — Configuração Central
//  Arquivo: src/config/config.js
// ════════════════════════════════════════════════════════

module.exports = {

  channels: {
    escala:    process.env.CHANNEL_ESCALA    || 'ID_DO_CANAL_ESCALA',
    almoco:    process.env.CHANNEL_ALMOCO    || 'ID_DO_CANAL_ALMOCO',
    alertas:   process.env.CHANNEL_ALERTAS   || null,
    relatorio: process.env.CHANNEL_RELATORIO || null, // ← relatório semanal
  },

  timezoneOffset: -3,

  almocoSchedule: {
    hora:   9,
    minuto: 0,
    dias: [1, 2, 3, 4, 5],
  },

  prefix: '!hermes',

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
