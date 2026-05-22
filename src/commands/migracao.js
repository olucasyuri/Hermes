// ════════════════════════════════════════════════════════
//  HERMES — Comando: /solicitacao-migracao
//  Coleta dados do colaborador via perguntas no Discord
//  e envia para /api/pev-importacao no site (Vercel).
// ════════════════════════════════════════════════════════

const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ComponentType,
} = require('discord.js');

// ─── Timeout da conversa (ms) ────────────────────────────
const TIMEOUT = 5 * 60 * 1000; // 5 minutos

// ─── Perguntas predefinidas ──────────────────────────────
const PERGUNTAS = [
  {
    campo: 'empresa',
    label: 'Nome da Empresa',
    pergunta: '🏢 **Qual o nome da empresa a ser migrada?**\n> Digite o nome completo da empresa.',
  },
  {
    campo: 'cnpj',
    label: 'CNPJ',
    pergunta: '🔢 **Qual o CNPJ da empresa?**\n> Digite somente os números (ex: `12345678000190`) ou formatado (`12.345.678/0001-90`).',
    validar: (v) => {
      const n = v.replace(/\D/g, '');
      if (n.length !== 14) return 'CNPJ inválido. Deve ter 14 dígitos. Tente novamente.';
      return null;
    },
  },
  {
    campo: 'importacao',
    label: 'Possui importação de dados?',
    pergunta: '📥 **A empresa possui importação de dados?**\n> Responda `sim` ou `não`.',
    validar: (v) => {
      const n = v.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      if (n === 'sim' || n === 'nao' || n === 'não') return null;
      return 'Responda apenas `sim` ou `não`.';
    },
    transformar: (v) => {
      const n = v.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      return n === 'sim' ? 'sim' : 'nao';
    },
  },
  {
    campo: 'data_virada',
    label: 'Data da Virada do Sistema',
    pergunta: '📅 **Qual a data prevista para a virada do sistema?**\n> Digite no formato `DD/MM/AAAA` (ex: `15/06/2025`).',
    validar: (v) => {
      const match = v.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
      if (!match) return 'Formato inválido. Use `DD/MM/AAAA` (ex: `15/06/2025`).';
      const [, d, m, y] = match;
      const date = new Date(`${y}-${m}-${d}`);
      if (isNaN(date.getTime())) return 'Data inválida. Verifique dia, mês e ano.';
      return null;
    },
    transformar: (v) => {
      // Converte DD/MM/AAAA → AAAA-MM-DD (para o banco)
      const [d, m, y] = v.trim().split('/');
      return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    },
  },
  {
    campo: 'obs',
    label: 'Observações',
    pergunta: '📝 **Alguma observação adicional?**\n> Se não houver, responda `não` ou `nenhuma`.',
    opcional: true,
    transformar: (v) => {
      const n = v.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      if (n === 'nao' || n === 'nenhuma' || n === 'não') return '';
      return v.trim();
    },
  },
];

// ─── Helpers ─────────────────────────────────────────────
function buildResumoEmbed(respostas, nomeDiscord) {
  const embed = new EmbedBuilder()
    .setTitle('📋 Resumo da Solicitação de Migração')
    .setColor(0x5865F2)
    .setFooter({ text: `Solicitante: ${nomeDiscord}` })
    .setTimestamp();

  PERGUNTAS.forEach((p) => {
    const valor = respostas[p.campo];
    let display = valor || '—';

    if (p.campo === 'importacao') display = valor === 'sim' ? '✅ Sim' : '❌ Não';
    if (p.campo === 'data_virada' && valor) {
      const [y, m, d] = valor.split('-');
      display = `${d}/${m}/${y}`;
    }
    if (p.campo === 'obs') display = valor || '(sem observações)';

    embed.addFields({ name: p.label, value: display, inline: p.campo !== 'obs' });
  });

  return embed;
}

async function enviarParaSite(respostas, discordUser) {
  const SITE_URL = process.env.SITE_URL || process.env.VERCEL_URL;
  const API_SECRET = process.env.API_SECRET;

  if (!SITE_URL) throw new Error('SITE_URL não configurado no .env do Hermes.');

  const base = SITE_URL.replace(/\/$/, '');
  const url = `${base}/api/pev-importacao`;

  const payload = {
    empresa: respostas.empresa,
    cnpj: respostas.cnpj,
    importacao: respostas.importacao,
    data_virada: respostas.data_virada,
    obs: respostas.obs || '',
    discord_user: discordUser,
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(API_SECRET ? { 'x-api-secret': API_SECRET } : {}),
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

// ─── Coleta de resposta via DM ou canal ──────────────────
async function coletarResposta(canal, userId, pergunta) {
  await canal.send(pergunta);

  const filter = (m) => m.author.id === userId;
  const collected = await canal.awaitMessages({ filter, max: 1, time: TIMEOUT, errors: ['time'] }).catch(() => null);

  if (!collected || collected.size === 0) return null;
  return collected.first().content;
}

// ─── Comando ─────────────────────────────────────────────
module.exports = {
  data: new SlashCommandBuilder()
    .setName('solicitacao-migracao')
    .setDescription('Abre o formulário de solicitação de migração de dados PEV'),

  async execute(interaction, client) {
    // Responde ephemeral para não poluir o canal
    await interaction.reply({
      content:
        '📬 **Solicitação de Migração**\nVou te enviar uma mensagem privada (DM) com o formulário. Verifique suas DMs!',
      ephemeral: true,
    });

    let dmChannel;
    try {
      dmChannel = await interaction.user.createDM();
    } catch {
      await interaction.followUp({
        content: '❌ Não consegui abrir uma DM com você. Verifique se as DMs estão habilitadas no servidor.',
        ephemeral: true,
      });
      return;
    }

    await dmChannel.send(
      '👋 Olá! Vou fazer algumas perguntas para registrar sua **solicitação de migração de dados PEV**.\n' +
      '> Você tem **5 minutos** para responder cada pergunta.\n' +
      '> Para cancelar a qualquer momento, responda `cancelar`.\n\n' +
      '---'
    );

    const respostas = {};
    const nomeDiscord = `${interaction.user.username}#${interaction.user.discriminator}`.replace(/#0$/, '');

    for (const perg of PERGUNTAS) {
      let resposta = null;
      let erro = null;

      // Loop até resposta válida
      while (true) {
        const prompt = erro ? `⚠️ ${erro}\n\n${perg.pergunta}` : perg.pergunta;
        resposta = await coletarResposta(dmChannel, interaction.user.id, prompt);

        // Timeout
        if (resposta === null) {
          await dmChannel.send('⏰ Tempo esgotado. Sua solicitação foi cancelada. Use `/solicitacao-migracao` para recomeçar.');
          return;
        }

        // Cancelar
        if (resposta.trim().toLowerCase() === 'cancelar') {
          await dmChannel.send('🚫 Solicitação cancelada. Use `/solicitacao-migracao` para recomeçar quando quiser.');
          return;
        }

        // Validação
        if (perg.validar) {
          erro = perg.validar(resposta);
          if (erro) continue;
        }

        break;
      }

      // Transformação
      respostas[perg.campo] = perg.transformar ? perg.transformar(resposta) : resposta.trim();
    }

    // ── Confirmação ──────────────────────────────────────
    const embed = buildResumoEmbed(respostas, nomeDiscord);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('migracao_confirmar')
        .setLabel('✅ Confirmar e Enviar')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('migracao_cancelar')
        .setLabel('❌ Cancelar')
        .setStyle(ButtonStyle.Danger)
    );

    const confirmMsg = await dmChannel.send({
      content: '📋 **Revise os dados antes de confirmar:**',
      embeds: [embed],
      components: [row],
    });

    // Aguardar clique
    const btnFilter = (i) => i.user.id === interaction.user.id;
    let btnInteraction;
    try {
      btnInteraction = await confirmMsg.awaitMessageComponent({
        filter: btnFilter,
        componentType: ComponentType.Button,
        time: TIMEOUT,
      });
    } catch {
      await dmChannel.send('⏰ Tempo esgotado na confirmação. Solicitação cancelada.');
      return;
    }

    if (btnInteraction.customId === 'migracao_cancelar') {
      await btnInteraction.update({
        content: '🚫 Solicitação cancelada.',
        embeds: [],
        components: [],
      });
      return;
    }

    // ── Envio para o site ────────────────────────────────
    await btnInteraction.update({
      content: '⏳ Enviando para o painel de gestão...',
      embeds: [],
      components: [],
    });

    try {
      await enviarParaSite(respostas, nomeDiscord);

      await dmChannel.send({
        embeds: [
          new EmbedBuilder()
            .setTitle('✅ Solicitação Registrada!')
            .setDescription(
              'Sua solicitação de migração foi enviada ao painel de gestão PEV com sucesso.\n' +
              'A equipe responsável entrará em contato.'
            )
            .setColor(0x57F287)
            .setTimestamp()
            .setFooter({ text: `Solicitante: ${nomeDiscord}` }),
        ],
      });

      console.log(`[Hermes/migracao] Solicitação registrada por ${nomeDiscord} — empresa: ${respostas.empresa}`);
    } catch (err) {
      console.error('[Hermes/migracao] Erro ao enviar para o site:', err.message);
      await dmChannel.send(
        `❌ **Erro ao registrar no painel:** ${err.message}\n` +
        'Por favor, tente novamente ou contate a gestão.'
      );
    }
  },
};
