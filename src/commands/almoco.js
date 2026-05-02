// ════════════════════════════════════════════════════════
//  HERMES — Comando: /almoco
//  Envia manualmente os horários de almoço do dia
//  (além do envio automático às 09h)
// ════════════════════════════════════════════════════════

const { SlashCommandBuilder } = require('discord.js');
const { COLABORADORES }       = require('../config/colaboradores');
const { channels, emojis }    = require('../config/config');
const { buildAlmocoMessage }  = require('../utils/messageBuilder');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('almoco')
    .setDescription('Envia os horários de almoço do dia manualmente'),

  async execute(interaction, client) {
    const channel = await client.channels.fetch(channels.almoco).catch(() => null);

    if (!channel) {
      return interaction.reply({
        content: `${emojis.erro} Canal de almoço não configurado. Verifique \`CHANNEL_ALMOCO\` no \`.env\``,
        ephemeral: true,
      });
    }

    const mensagem = buildAlmocoMessage(COLABORADORES, new Date());

    if (!mensagem) {
      return interaction.reply({
        content: `${emojis.erro} Nenhum colaborador cadastrado.`,
        ephemeral: true,
      });
    }

    await channel.send(mensagem);

    await interaction.reply({
      content: `${emojis.ok} Horários de almoço enviados para <#${channel.id}>!`,
      ephemeral: true,
    });
  },
};
