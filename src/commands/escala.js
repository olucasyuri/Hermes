// ════════════════════════════════════════════════════════
//  HERMES — Comando: /escala
//  Envia a escala do dia para o canal configurado
//  Permite definir status de cada colaborador via Discord
// ════════════════════════════════════════════════════════

const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} = require('discord.js');

const { COLABORADORES, groupByRegion } = require('../config/colaboradores');
const { channels, emojis }             = require('../config/config');
const { buildEscalaMessage }           = require('../utils/messageBuilder');

// Estado em memória (por sessão de interação)
// Para persistência entre reinicializações, use um arquivo JSON ou banco de dados
const sessoes = new Map(); // interactionId → escalaState

// ─── Helpers ─────────────────────────────────────────────
function initEscalaState() {
  const state = {};
  COLABORADORES.forEach(c => {
    state[c.nome] = { status: 'none', obs: '' };
  });
  return state;
}

function statusEmoji(status) {
  return { int: emojis.interno, ext: emojis.externo, off: emojis.off, rod: emojis.rodizio, none: '⬜' }[status] || '⬜';
}

function buildStatusText(state) {
  const byStatus = { int: [], ext: [], off: [], rod: [], none: [] };
  COLABORADORES.forEach(c => {
    const s = state[c.nome]?.status || 'none';
    byStatus[s].push(c.nome);
  });

  const total   = COLABORADORES.length;
  const defined = total - byStatus.none.length;
  const lines   = [`📊 **${defined}/${total} definidos**\n`];

  if (byStatus.int.length)  lines.push(`${emojis.interno} Internos (${byStatus.int.length}): ${byStatus.int.join(', ')}`);
  if (byStatus.ext.length)  lines.push(`${emojis.externo} Externos (${byStatus.ext.length}): ${byStatus.ext.join(', ')}`);
  if (byStatus.off.length)  lines.push(`${emojis.off} OFF (${byStatus.off.length}): ${byStatus.off.join(', ')}`);
  if (byStatus.rod.length)  lines.push(`${emojis.rodizio} Rodízio (${byStatus.rod.length}): ${byStatus.rod.join(', ')}`);
  if (byStatus.none.length) lines.push(`⬜ Sem status (${byStatus.none.length}): ${byStatus.none.join(', ')}`);

  return lines.join('\n');
}

// ─── Botões de ação em massa por região ──────────────────
function buildRegionRows(regiao) {
  const safeId = regiao.replace(/[^a-zA-Z0-9]/g, '_');
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`mass_${safeId}_int`).setLabel(`${regiao}: Int.`).setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`mass_${safeId}_ext`).setLabel(`${regiao}: Ext.`).setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`mass_${safeId}_off`).setLabel(`${regiao}: OFF`).setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`mass_${safeId}_rod`).setLabel(`${regiao}: Rodízio`).setStyle(ButtonStyle.Success),
  );
}

// ─── Botões de controle geral ─────────────────────────────
function buildControlRow(sessionId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`escala_todos_int_${sessionId}`)
      .setLabel('✅ Todos Internos')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`escala_enviar_${sessionId}`)
      .setLabel('📤 Enviar Escala')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`escala_limpar_${sessionId}`)
      .setLabel('🗑️ Limpar')
      .setStyle(ButtonStyle.Danger),
  );
}

// ─── Comando ─────────────────────────────────────────────
module.exports = {
  data: new SlashCommandBuilder()
    .setName('escala')
    .setDescription('Gerencia e envia a escala do dia para o Discord')
    .addSubcommand(sub =>
      sub.setName('enviar')
         .setDescription('Abre o painel interativo da escala')
    )
    .addSubcommand(sub =>
      sub.setName('todos-interno')
         .setDescription('Define todos como Interno e envia')
    )
    .addSubcommand(sub =>
      sub.setName('todos-externo')
         .setDescription('Define todos como Externo e envia')
    ),

  async execute(interaction, client) {
    const sub = interaction.options.getSubcommand();

    // ── /escala todos-interno ──
    if (sub === 'todos-interno') {
      const state = initEscalaState();
      COLABORADORES.forEach(c => { state[c.nome].status = 'int'; });
      return sendEscala(interaction, client, state);
    }

    // ── /escala todos-externo ──
    if (sub === 'todos-externo') {
      const state = initEscalaState();
      COLABORADORES.forEach(c => { state[c.nome].status = 'ext'; });
      return sendEscala(interaction, client, state);
    }

    // ── /escala enviar — painel interativo ──
    const sessionId = interaction.id;
    const state     = initEscalaState();
    sessoes.set(sessionId, state);

    const regioes = [...new Set(COLABORADORES.map(c => c.regiao))];
    const rows    = regioes.map(buildRegionRows);
    rows.push(buildControlRow(sessionId));

    // Discord permite max 5 ActionRows por mensagem
    const limitedRows = rows.slice(0, 5);

    await interaction.reply({
      content: `🗓️ **Painel de Escala** (sessão \`${sessionId.slice(-6)}\`)\n\n${buildStatusText(state)}\n\n> Use os botões para definir o status por região, depois clique **Enviar Escala**.`,
      components: limitedRows,
      ephemeral: true, // só quem chamou vê o painel
    });

    // ── Collector de botões ──
    const filter    = i => i.user.id === interaction.user.id;
    const collector = interaction.channel.createMessageComponentCollector({ filter, time: 5 * 60 * 1000 });

    collector.on('collect', async btnInteraction => {
      const id    = btnInteraction.customId;
      const sId   = Object.keys(Object.fromEntries(sessoes)).find(k => id.endsWith(k));
      const st    = sessoes.get(sessionId);
      if (!st) return;

      // Botão: enviar escala
      if (id === `escala_enviar_${sessionId}`) {
        collector.stop();
        return sendEscala(btnInteraction, client, st, true);
      }

      // Botão: limpar
      if (id === `escala_limpar_${sessionId}`) {
        COLABORADORES.forEach(c => { st[c.nome] = { status: 'none', obs: '' }; });
        await btnInteraction.update({
          content: `🗓️ **Painel de Escala**\n\n${buildStatusText(st)}\n\n> Escala limpa!`,
          components: interaction.message?.components,
        });
        return;
      }

      // Botão: todos internos
      if (id === `escala_todos_int_${sessionId}`) {
        COLABORADORES.forEach(c => { st[c.nome].status = 'int'; });
        await btnInteraction.update({
          content: `🗓️ **Painel de Escala**\n\n${buildStatusText(st)}\n\n> Todos definidos como **Interno**!`,
          components: interaction.message?.components,
        });
        return;
      }

      // Botão: mass_REGIAO_STATUS
      const massMatch = id.match(/^mass_(.+)_(int|ext|off|rod)$/);
      if (massMatch) {
        const regiaoSafe = massMatch[1];
        const status     = massMatch[2];
        // Reconstrói o nome da região
        const regiao = COLABORADORES.find(c =>
          c.regiao.replace(/[^a-zA-Z0-9]/g, '_') === regiaoSafe
        )?.regiao;

        if (regiao) {
          COLABORADORES.filter(c => c.regiao === regiao)
            .forEach(c => { st[c.nome].status = status; });

          await btnInteraction.update({
            content: `🗓️ **Painel de Escala**\n\n${buildStatusText(st)}\n\n> **${regiao}** → ${status.toUpperCase()}`,
            components: btnInteraction.message.components,
          });
        }
        return;
      }

      await btnInteraction.deferUpdate();
    });

    collector.on('end', (_, reason) => {
      if (reason === 'time') {
        sessoes.delete(sessionId);
      }
    });
  },
};

// ─── Função de envio ─────────────────────────────────────
async function sendEscala(interaction, client, state, isButton = false) {
  const mensagem = buildEscalaMessage(state, new Date());

  if (!mensagem) {
    const reply = { content: `${emojis.erro} Nenhum colaborador com status definido!`, ephemeral: true };
    return isButton ? interaction.update(reply) : interaction.reply(reply);
  }

  // Envia para o canal de escala
  const channel = await client.channels.fetch(channels.escala).catch(() => null);
  if (!channel) {
    const msg = `${emojis.erro} Canal de escala não configurado. Verifique \`CHANNEL_ESCALA\` no \`.env\``;
    return isButton ? interaction.update({ content: msg, components: [] }) : interaction.reply({ content: msg, ephemeral: true });
  }

  await channel.send(mensagem);

  const confirmacao = `${emojis.ok} **Escala enviada** para <#${channel.id}>!`;
  if (isButton) {
    await interaction.update({ content: confirmacao, components: [] });
  } else {
    await interaction.reply({ content: confirmacao, ephemeral: true });
  }
}
