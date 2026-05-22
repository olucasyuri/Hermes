// ════════════════════════════════════════════════════════
//  HERMES — Comando: /solicitacao-migracao
//  Coleta dados via DM e envia para /api/pev-importacao
// ════════════════════════════════════════════════════════

const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ComponentType,
} = require('discord.js');

// ─── Sessões ativas (userId → estado) ───────────────────
const sessoes = new Map();

const TIMEOUT_MS = 5 * 60 * 1000; // 5 min por pergunta

// ─── Perguntas predefinidas ──────────────────────────────
const PERGUNTAS = [
  {
    campo: 'empresa',
    label: '🏢 Nome da Empresa',
    pergunta: '**[1/5] Qual o nome da empresa a ser migrada?**\n> Digite o nome completo.',
  },
  {
    campo: 'cnpj',
    label: '🔢 CNPJ',
    pergunta: '**[2/5] Qual o CNPJ da empresa?**\n> Somente números ou formatado (`12.345.678/0001-90`).',
    validar: (v) => {
      const n = v.replace(/\D/g, '');
      return n.length !== 14 ? '⚠️ CNPJ inválido — precisa ter 14 dígitos. Tente novamente.' : null;
    },
  },
  {
    campo: 'importacao',
    label: '📥 Possui importação de dados?',
    pergunta: '**[3/5] A empresa possui importação de dados?**\n> Responda `sim` ou `não`.',
    validar: (v) => {
      const n = norm(v);
      return (n === 'sim' || n === 'nao') ? null : '⚠️ Responda apenas `sim` ou `não`.';
    },
    transformar: (v) => norm(v) === 'sim' ? 'sim' : 'nao',
  },
  {
    campo: 'data_virada',
    label: '📅 Data da Virada',
    pergunta: '**[4/5] Qual a data prevista para a virada do sistema?**\n> Formato: `DD/MM/AAAA` (ex: `15/06/2025`).',
    validar: (v) => {
      const m = v.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
      if (!m) return '⚠️ Formato inválido. Use `DD/MM/AAAA`.';
      const d = new Date(`${m[3]}-${m[2]}-${m[1]}`);
      return isNaN(d.getTime()) ? '⚠️ Data inválida. Verifique dia, mês e ano.' : null;
    },
    transformar: (v) => {
      const [d, m, y] = v.trim().split('/');
      return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
    },
  },
  {
    campo: 'obs',
    label: '📝 Observações',
    pergunta: '**[5/5] Alguma observação adicional?**\n> Se não houver, responda `não` ou `nenhuma`.',
    transformar: (v) => {
      const n = norm(v);
      return (n === 'nao' || n === 'nenhuma') ? '' : v.trim();
    },
  },
];

function norm(v) {
  return v.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

// ─── Envia para o site ───────────────────────────────────
async function enviarParaSite(respostas, discordUser) {
  const SITE_URL = process.env.SITE_URL;
  const API_SECRET = process.env.API_SECRET;
  if (!SITE_URL) throw new Error('SITE_URL não configurado no .env do Hermes.');

  const res = await fetch(`${SITE_URL.replace(/\/$/, '')}/api/pev-importacao`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(API_SECRET ? { 'x-api-secret': API_SECRET } : {}),
    },
    body: JSON.stringify({ ...respostas, discord_user: discordUser }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

// ─── Embed de resumo ─────────────────────────────────────
function buildResumoEmbed(respostas, nomeDiscord) {
  const embed = new EmbedBuilder()
    .setTitle('📋 Resumo da Solicitação de Migração')
    .setColor(0x5865F2)
    .setFooter({ text: `Solicitante: ${nomeDiscord}` })
    .setTimestamp();

  PERGUNTAS.forEach(p => {
    let val = respostas[p.campo] ?? '—';
    if (p.campo === 'importacao') val = val === 'sim' ? '✅ Sim' : '❌ Não';
    if (p.campo === 'data_virada' && val && val !== '—') {
      const [y,m,d] = val.split('-');
      val = `${d}/${m}/${y}`;
    }
    if (p.campo === 'obs') val = val || '(sem observações)';
    embed.addFields({ name: p.label, value: String(val), inline: p.campo !== 'obs' });
  });

  return embed;
}

// ─── Avança a sessão após cada mensagem DM ───────────────
async function processarMensagem(message) {
  if (message.author.bot || !message.channel.isDMBased()) return;

  const sessao = sessoes.get(message.author.id);
  if (!sessao) return;

  clearTimeout(sessao.timer);

  const texto = message.content.trim();

  // Cancelar
  if (norm(texto) === 'cancelar') {
    sessoes.delete(message.author.id);
    await message.channel.send('🚫 Solicitação cancelada. Use `/solicitacao-migracao` para recomeçar.');
    return;
  }

  const perg = PERGUNTAS[sessao.etapa];

  // Validar
  if (perg.validar) {
    const erro = perg.validar(texto);
    if (erro) {
      await message.channel.send(`${erro}\n\n${perg.pergunta}`);
      sessao.timer = setTimeout(() => timeoutSessao(message.author.id, message.channel), TIMEOUT_MS);
      return;
    }
  }

  // Salvar
  sessao.respostas[perg.campo] = perg.transformar ? perg.transformar(texto) : texto;
  sessao.etapa++;

  // Próxima pergunta
  if (sessao.etapa < PERGUNTAS.length) {
    await message.channel.send(PERGUNTAS[sessao.etapa].pergunta);
    sessao.timer = setTimeout(() => timeoutSessao(message.author.id, message.channel), TIMEOUT_MS);
    return;
  }

  // Todas as perguntas respondidas — mostrar resumo
  sessoes.delete(message.author.id);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`mig_ok_${message.author.id}`).setLabel('✅ Confirmar e Enviar').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`mig_no_${message.author.id}`).setLabel('❌ Cancelar').setStyle(ButtonStyle.Danger),
  );

  const nomeDiscord = message.author.username;
  const embed = buildResumoEmbed(sessao.respostas, nomeDiscord);

  const msg = await message.channel.send({
    content: '📋 **Revise os dados antes de confirmar:**',
    embeds: [embed],
    components: [row],
  });

  // Aguardar botão
  const collector = msg.createMessageComponentCollector({
    componentType: ComponentType.Button,
    filter: i => i.user.id === message.author.id,
    time: TIMEOUT_MS,
    max: 1,
  });

  collector.on('collect', async btn => {
    if (btn.customId === `mig_no_${message.author.id}`) {
      await btn.update({ content: '🚫 Solicitação cancelada.', embeds: [], components: [] });
      return;
    }

    await btn.update({ content: '⏳ Registrando no painel de gestão...', embeds: [], components: [] });

    try {
      await enviarParaSite(sessao.respostas, nomeDiscord);
      await message.channel.send({
        embeds: [
          new EmbedBuilder()
            .setTitle('✅ Solicitação Registrada!')
            .setDescription('Sua solicitação foi enviada ao painel de gestão PEV.\nA equipe responsável entrará em contato.')
            .setColor(0x57F287)
            .setTimestamp()
            .setFooter({ text: `Solicitante: ${nomeDiscord}` }),
        ],
      });
      console.log(`[Hermes/migracao] Registrado por ${nomeDiscord} — empresa: ${sessao.respostas.empresa}`);
    } catch (err) {
      console.error('[Hermes/migracao] Erro:', err.message);
      await message.channel.send(`❌ **Erro ao registrar:** ${err.message}\nTente novamente ou contate a gestão.`);
    }
  });

  collector.on('end', (_, reason) => {
    if (reason === 'time') message.channel.send('⏰ Confirmação expirada. Use `/solicitacao-migracao` para recomeçar.').catch(() => {});
  });
}

async function timeoutSessao(userId, channel) {
  sessoes.delete(userId);
  await channel.send('⏰ Tempo esgotado. Use `/solicitacao-migracao` para recomeçar.').catch(() => {});
}

// ─── Comando ─────────────────────────────────────────────
module.exports = {
  data: new SlashCommandBuilder()
    .setName('solicitacao-migracao')
    .setDescription('Abre o formulário de solicitação de migração de dados PEV'),

  // Exporta o handler de mensagens DM para o index.js registrar
  handleDMMessage: processarMensagem,

  async execute(interaction) {
    // Se já há uma sessão ativa, cancelar a antiga
    if (sessoes.has(interaction.user.id)) {
      sessoes.delete(interaction.user.id);
    }

    let dmChannel;
    try {
      dmChannel = await interaction.user.createDM();
    } catch {
      await interaction.reply({
        content: '❌ Não foi possível abrir uma DM com você. Verifique se as mensagens diretas estão habilitadas para este servidor.\n> *Configurações do servidor → Privacidade → Permitir mensagens diretas de membros do servidor*',
        ephemeral: true,
      });
      return;
    }

    // Confirmar no canal (ephemeral)
    await interaction.reply({
      content: '📬 Formulário iniciado! Verifique sua DM (mensagem privada) com o Hermes.',
      ephemeral: true,
    });

    // Iniciar sessão
    const sessao = {
      etapa: 0,
      respostas: {},
      timer: setTimeout(() => timeoutSessao(interaction.user.id, dmChannel), TIMEOUT_MS),
    };
    sessoes.set(interaction.user.id, sessao);

    await dmChannel.send(
      '👋 Olá! Vou registrar sua **solicitação de migração de dados PEV**.\n' +
      '> Responda cada pergunta diretamente aqui na DM.\n' +
      '> Para cancelar a qualquer momento, responda `cancelar`.\n\n---\n\n' +
      PERGUNTAS[0].pergunta
    );
  },
};
