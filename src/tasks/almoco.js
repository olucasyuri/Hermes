// ════════════════════════════════════════════════════════
//  HERMES — Task: Almoço Automático
//  Envia os horários de almoço de segunda a sexta
//  no canal configurado em config.js
// ════════════════════════════════════════════════════════

const { COLABORADORES }      = require('../config/colaboradores');
const { channels, almocoSchedule } = require('../config/config');
const { buildAlmocoMessage } = require('../utils/messageBuilder');

module.exports = {
  name: 'almoco-automatico',

  // ── Agenda: quando executar ────────────────────────────
  schedule: {
    hora:   almocoSchedule.hora,
    minuto: almocoSchedule.minuto,
    dias:   almocoSchedule.dias, // [1,2,3,4,5] = seg a sex
  },

  // ── Execução ──────────────────────────────────────────
  async execute(client, date) {
    const channel = await client.channels.fetch(channels.almoco).catch(() => null);

    if (!channel) {
      console.error('[HERMES] Canal de almoço não encontrado. Verifique CHANNEL_ALMOCO no .env');
      return;
    }

    // Usa todos os colaboradores (você pode filtrar os que estão na escala
    // do dia se implementar persistência de estado futuro)
    const mensagem = buildAlmocoMessage(COLABORADORES, date);

    if (!mensagem) {
      console.warn('[HERMES] Nenhum colaborador para o almoço hoje.');
      return;
    }

    await channel.send(mensagem);
    console.log(`[HERMES] Almoço enviado para #${channel.name} em ${date.toLocaleString('pt-BR')}`);
  },
};
