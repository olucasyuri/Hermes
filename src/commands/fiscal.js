/* ============================================================
   HERMES — Comando /fiscal
   src/commands/fiscal.js

   INSTALAR:
   1. Copie este arquivo para src/commands/fiscal.js
   2. Copie src/utils/fiscal-engine.js
   3. Rode: npm run deploy
   ============================================================ */

const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} = require('discord.js');

const {
  diagnosticarFiscal,
  calcularDevolucao,
  FAQ,
  CFOPS,
  CST_CSOSN,
  CHECKLIST,
} = require('../utils/fiscal-engine');

// ── Cores ────────────────────────────────────────────────
const COR = {
  principal : 0x6C63FF,
  verde     : 0x22C55E,
  amarelo   : 0xF59E0B,
  vermelho  : 0xEF4444,
  azul      : 0x3B82F6,
  cinza     : 0x374151,
};

// ── Sessões de diagnóstico em andamento ─────────────────
// Chave: userId, valor: { op, regime, st, dest }
// OBS: a sessão dura apenas até o resultado ser gerado
const sessoes = new Map();

// ════════════════════════════════════════════════════════
//  DEFINIÇÃO DO COMANDO
// ════════════════════════════════════════════════════════
module.exports = {

  data: new SlashCommandBuilder()
    .setName('fiscal')
    .setDescription('FiscalDesk — Orientação fiscal para NF-e e NFC-e')
    .addSubcommand(sub => sub
      .setName('diagnostico')
      .setDescription('Diagnóstico interativo — encontra CFOP e CST para qualquer operação'))
    .addSubcommand(sub => sub
      .setName('devolucao')
      .setDescription('Calculadora de devolução — CFOP correto pelo cenário'))
    .addSubcommand(sub => sub
      .setName('cfop')
      .setDescription('Busca na tabela de CFOPs')
      .addStringOption(opt => opt
        .setName('busca')
        .setDescription('Código ou palavra-chave (ex: devolução, 5.102)')
        .setRequired(false)))
    .addSubcommand(sub => sub
      .setName('cst')
      .setDescription('Tabela de CST (LP/LR) e CSOSN (Simples Nacional)'))
    .addSubcommand(sub => sub
      .setName('faq')
      .setDescription('Atalhos rápidos para dúvidas frequentes'))
    .addSubcommand(sub => sub
      .setName('checklist')
      .setDescription('Checklist completo de atendimento fiscal'))
    .addSubcommand(sub => sub
      .setName('script')
      .setDescription('Script de atendimento — perguntas obrigatórias e frases padrão')),

  // ════════════════════════════════════════════════════════
  //  EXECUTE — despacha para o subcomando correto
  // ════════════════════════════════════════════════════════
  async execute(interaction, client) {
    const sub = interaction.options.getSubcommand();

    switch (sub) {
      case 'diagnostico': return execDiagnostico(interaction);
      case 'devolucao':   return execDevolucao(interaction);
      case 'cfop':        return execCfop(interaction);
      case 'cst':         return execCst(interaction);
      case 'faq':         return execFaq(interaction);
      case 'checklist':   return execChecklist(interaction);
      case 'script':      return execScript(interaction);
    }
  },

  // ════════════════════════════════════════════════════════
  //  HANDLER DE INTERAÇÕES (selects e botões gerados pelo cmd)
  //  Chamado a partir do interactionCreate no index.js
  // ════════════════════════════════════════════════════════
  async handleComponent(interaction) {
    const id = interaction.customId;

    // ── FAQ select ────────────────────────────────────────
    if (id === 'fiscal_faq_select') {
      const faq = FAQ[interaction.values[0]];
      if (!faq) return;
      return interaction.update({
        embeds: [embedFaq(faq)],
        components: [],
      });
    }

    // ── Checklist: ver em texto ───────────────────────────
    if (id === 'fiscal_checklist_txt') {
      let txt = '**CHECKLIST DE ATENDIMENTO FISCAL**\n\n';
      CHECKLIST.forEach(g => {
        txt += `**${g.grupo}**\n`;
        txt += g.itens.map(i => `☐ ${i}`).join('\n') + '\n\n';
      });
      txt += '*⚠️ Validar com a contabilidade antes de fechar o chamado.*';
      return interaction.reply({ content: txt, ephemeral: true });
    }

    // ── Diagnóstico — novo ────────────────────────────────
    if (id === 'fiscal_diag_novo') {
      sessoes.set(interaction.user.id, {});
      return interaction.update(stepOp());
    }

    // ── Devolução — nova ──────────────────────────────────
    if (id === 'fiscal_dev_nova') {
      sessoes.set('dev_' + interaction.user.id, {});
      return interaction.update(stepDevLocal());
    }

    // ── Diagnóstico: op ───────────────────────────────────
    if (id === 'fiscal_diag_op') {
      const op = interaction.values[0];
      const sessao = sessoes.get(interaction.user.id) || {};
      sessao.op = op;
      sessoes.set(interaction.user.id, sessao);

      if (op === 'remessa' || op === 'transferencia') {
        const r = diagnosticarFiscal({ op, regime: 'sn', st: 'nao', dest: 'pj_contrib' });
        sessoes.delete(interaction.user.id);
        return interaction.update(resultadoDiag(r));
      }
      return interaction.update(stepRegime());
    }

    // ── Diagnóstico: regime ───────────────────────────────
    if (id === 'fiscal_diag_regime') {
      const sessao = sessoes.get(interaction.user.id) || {};
      sessao.regime = interaction.values[0];
      sessoes.set(interaction.user.id, sessao);
      return interaction.update(stepSt());
    }

    // ── Diagnóstico: st ───────────────────────────────────
    if (id === 'fiscal_diag_st') {
      const sessao = sessoes.get(interaction.user.id) || {};
      sessao.st = interaction.values[0];
      sessoes.set(interaction.user.id, sessao);
      return interaction.update(stepDest());
    }

    // ── Diagnóstico: dest → resultado ────────────────────
    if (id === 'fiscal_diag_dest') {
      const sessao = sessoes.get(interaction.user.id) || {};
      sessao.dest = interaction.values[0];
      const r = diagnosticarFiscal(sessao);
      sessoes.delete(interaction.user.id);
      return interaction.update(resultadoDiag(r));
    }

    // ── Devolução: local ──────────────────────────────────
    if (id === 'fiscal_dev_local') {
      const key = 'dev_' + interaction.user.id;
      const sessao = sessoes.get(key) || {};
      sessao.local = interaction.values[0];
      sessoes.set(key, sessao);
      return interaction.update(stepDevSt());
    }

    // ── Devolução: st ─────────────────────────────────────
    if (id === 'fiscal_dev_st') {
      const key = 'dev_' + interaction.user.id;
      const sessao = sessoes.get(key) || {};
      sessao.st = interaction.values[0];
      sessoes.set(key, sessao);
      return interaction.update(stepDevQuem());
    }

    // ── Devolução: quem → resultado ───────────────────────
    if (id === 'fiscal_dev_quem') {
      const key = 'dev_' + interaction.user.id;
      const sessao = sessoes.get(key) || {};
      sessao.quem = interaction.values[0];
      const r = calcularDevolucao(sessao);
      sessoes.delete(key);
      return interaction.update(resultadoDev(r));
    }
  },
};

// ════════════════════════════════════════════════════════
//  SUBCOMANDOS
// ════════════════════════════════════════════════════════

async function execDiagnostico(interaction) {
  sessoes.set(interaction.user.id, {});
  await interaction.reply({ ...stepOp(), ephemeral: false });
}

async function execDevolucao(interaction) {
  sessoes.set('dev_' + interaction.user.id, {});
  await interaction.reply({ ...stepDevLocal(), ephemeral: false });
}

async function execCfop(interaction) {
  const q = (interaction.options.getString('busca') || '').toLowerCase();
  const lista = q
    ? CFOPS.filter(c => c.cfop.includes(q) || c.desc.toLowerCase().includes(q) || c.tipo.toLowerCase().includes(q))
    : CFOPS;

  if (lista.length === 0) {
    return interaction.reply({ content: `❌ Nenhum CFOP encontrado para **"${q}"**.`, ephemeral: true });
  }

  const linhas = lista.slice(0, 20).map(c => {
    const emoji = c.tipo === 'Entrada' ? '🔵' : c.tipo === 'Saída' ? '🟢' : '🟣';
    return `${emoji} \`${c.cfop}\` — ${c.desc}`;
  }).join('\n');

  const embed = new EmbedBuilder()
    .setColor(COR.azul)
    .setTitle(`# CFOPs${q ? ` — "${q}"` : ''}`)
    .setDescription(linhas)
    .setFooter({ text: `${lista.length} resultado(s) • 🔵 Entrada  🟢 Saída  🟣 Transferência` });

  await interaction.reply({ embeds: [embed], ephemeral: false });
}

async function execCst(interaction) {
  const csosnLines = CST_CSOSN.csosn
    .map(c => `\`${c.cod}\` **${c.desc}**\n└ *${c.uso}*`).join('\n');
  const cstLines = CST_CSOSN.cst
    .map(c => `\`${c.cod}\` **${c.desc}**\n└ *${c.uso}*`).join('\n');

  const e1 = new EmbedBuilder()
    .setColor(COR.azul)
    .setTitle('◉ CSOSN — Simples Nacional')
    .setDescription(csosnLines);

  const e2 = new EmbedBuilder()
    .setColor(COR.amarelo)
    .setTitle('◉ CST — Regime Normal (LP / LR)')
    .setDescription(cstLines);

  await interaction.reply({ embeds: [e1, e2], ephemeral: false });
}

async function execFaq(interaction) {
  const embed = new EmbedBuilder()
    .setColor(COR.principal)
    .setTitle('💡 FAQ — Dúvidas frequentes')
    .setDescription('Selecione abaixo qual situação deseja consultar:');

  const select = new StringSelectMenuBuilder()
    .setCustomId('fiscal_faq_select')
    .setPlaceholder('Escolha uma situação especial')
    .addOptions(
      Object.entries(FAQ).map(([key, faq]) =>
        new StringSelectMenuOptionBuilder().setLabel(faq.titulo).setValue(key)
      )
    );

  await interaction.reply({
    embeds: [embed],
    components: [new ActionRowBuilder().addComponents(select)],
    ephemeral: false,
  });
}

async function execChecklist(interaction) {
  const embed = new EmbedBuilder()
    .setColor(COR.verde)
    .setTitle('☑ Checklist de Atendimento Fiscal')
    .setFooter({ text: '⚠ Sempre validar com a contabilidade antes de fechar o chamado.' });

  CHECKLIST.forEach(grupo => {
    embed.addFields({
      name: `📋 ${grupo.grupo}`,
      value: grupo.itens.map(i => `▫ ${i}`).join('\n'),
      inline: false,
    });
  });

  const btn = new ButtonBuilder()
    .setCustomId('fiscal_checklist_txt')
    .setLabel('📋 Ver em texto (para copiar)')
    .setStyle(ButtonStyle.Secondary);

  await interaction.reply({
    embeds: [embed],
    components: [new ActionRowBuilder().addComponents(btn)],
    ephemeral: false,
  });
}

async function execScript(interaction) {
  const perguntas = [
    { p: 'Qual o regime tributário do emitente? (SN / LP / LR / MEI)', por: 'Define CST/CSOSN e obrigações' },
    { p: 'A operação é dentro ou fora do estado?',                     por: 'Define prefixo do CFOP (5 ou 6)' },
    { p: 'O produto tem substituição tributária (ST)?',                 por: 'Define CST 60/500 vs 00/102' },
    { p: 'O destinatário é PJ contribuinte ou consumidor final?',       por: 'Muda CFOP e obrigações de Difal' },
    { p: 'É devolução total ou parcial?',                              por: 'Parcial: ajuste de quantidade/valor' },
    { p: 'Tem a chave de acesso (44 dígitos) da NF original?',         por: 'Obrigatória na devolução (NFref)' },
  ];

  const embed = new EmbedBuilder()
    .setColor(COR.cinza)
    .setTitle('✎ Script de Atendimento Fiscal')
    .setDescription('**Perguntas obrigatórias — fazer SEMPRE antes de orientar:**')
    .addFields(
      perguntas.map((p, i) => ({
        name: `${i + 1}. ${p.p}`,
        value: `📌 *${p.por}*`,
        inline: false,
      }))
    )
    .addFields(
      {
        name: '💬 Modelo de resposta padrão',
        value: '*"Com base nas informações que você me passou, o **CFOP indicado é [X.XXX]** e o **CST/CSOSN é [XXX]**. Essa é a orientação base — pedimos que você **valide com sua contabilidade** antes de emitir. Após a validação contábil, pode emitir normalmente."*',
        inline: false,
      },
      {
        name: '❌ Frases que o suporte NUNCA deve usar',
        value: [
          '~~"Pode emitir assim mesmo"~~ → *"Oriento a confirmar com a contabilidade antes"*',
          '~~"Isso está certo, pode ir"~~ → *"Essa é a orientação base — valide com seu contador"*',
          '~~"Cancela e emite de novo"~~ → *"Cancelamento só é possível em até 24h"*',
          '~~"Bota qualquer NCM"~~ → *"O NCM precisa corresponder ao produto — verificar na TIPI"*',
        ].join('\n'),
        inline: false,
      }
    );

  await interaction.reply({ embeds: [embed], ephemeral: false });
}

// ════════════════════════════════════════════════════════
//  STEPS DO DIAGNÓSTICO (retornam objetos {embeds, components})
// ════════════════════════════════════════════════════════

function stepOp() {
  return {
    embeds: [new EmbedBuilder()
      .setColor(COR.principal)
      .setTitle('◈ Diagnóstico Fiscal — Passo 1 / 4')
      .setDescription('**Qual é o tipo de operação?**')],
    components: [new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('fiscal_diag_op')
        .setPlaceholder('Selecione o tipo de operação')
        .addOptions([
         new StringSelectMenuOptionBuilder().setLabel('Venda dentro do estado').setValue('venda_estado').setEmoji('🏪'),
         new StringSelectMenuOptionBuilder().setLabel('Venda para outro estado').setValue('venda_inter').setEmoji('🚚'),
         new StringSelectMenuOptionBuilder().setLabel('Devolucao — mesmo estado').setValue('dev_estado'),
         new StringSelectMenuOptionBuilder().setLabel('Devolucao — outro estado').setValue('dev_inter'),
         new StringSelectMenuOptionBuilder().setLabel('Remessa conserto / garantia').setValue('remessa').setEmoji('🔧'),
         new StringSelectMenuOptionBuilder().setLabel('Transferencia entre filiais').setValue('transferencia'),
        ])
    )],
  };
}

function stepRegime() {
  return {
    embeds: [new EmbedBuilder()
      .setColor(COR.principal)
      .setTitle('◈ Diagnóstico Fiscal — Passo 2 / 4')
      .setDescription('**Qual o regime tributário do emitente?**')],
    components: [new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('fiscal_diag_regime')
        .setPlaceholder('Selecione o regime')
        .addOptions([
          new StringSelectMenuOptionBuilder().setLabel('Simples Nacional / MEI').setValue('sn'),
          new StringSelectMenuOptionBuilder().setLabel('Lucro Presumido').setValue('lp'),
          new StringSelectMenuOptionBuilder().setLabel('Lucro Real').setValue('lr'),
        ])
    )],
  };
}

function stepSt() {
  return {
    embeds: [new EmbedBuilder()
      .setColor(COR.principal)
      .setTitle('◈ Diagnóstico Fiscal — Passo 3 / 4')
      .setDescription('**O produto tem Substituição Tributária (ST)?**\n💡 Produto com ST geralmente vem com CST 60 ou CSOSN 500 na nota de compra. Ex: bebidas, cosméticos, cigarros, tintas, cimento.')],
    components: [new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('fiscal_diag_st')
        .setPlaceholder('Selecione a situação do ST')
        .addOptions([
          new StringSelectMenuOptionBuilder().setLabel('Não tem ST').setValue('nao'),
          new StringSelectMenuOptionBuilder().setLabel('Sim — ST já foi pago (revendedor)').setValue('pago'),
          new StringSelectMenuOptionBuilder().setLabel('Sim — sou o substituto (gero o ST)').setValue('substituto'),
          new StringSelectMenuOptionBuilder().setLabel('Produto isento / não tributado').setValue('isento'),
        ])
    )],
  };
}

function stepDest() {
  return {
    embeds: [new EmbedBuilder()
      .setColor(COR.principal)
      .setTitle('◈ Diagnóstico Fiscal — Passo 4 / 4')
      .setDescription('**Quem é o destinatário?**')],
    components: [new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('fiscal_diag_dest')
        .setPlaceholder('Selecione o destinatário')
        .addOptions([
          new StringSelectMenuOptionBuilder().setLabel('Empresa PJ — contribuinte ICMS').setValue('pj_contrib'),
          new StringSelectMenuOptionBuilder().setLabel('Empresa PJ — não contribuinte').setValue('pj_ncontrib'),
          new StringSelectMenuOptionBuilder().setLabel('Consumidor Final — Pessoa Física').setValue('pf'),
        ])
    )],
  };
}

// ── Steps devolução ──────────────────────────────────────

function stepDevLocal() {
  return {
    embeds: [new EmbedBuilder()
      .setColor(COR.azul)
      .setTitle('↩ Calculadora de Devolução — Passo 1 / 3')
      .setDescription('**A venda original foi feita...**')],
    components: [new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('fiscal_dev_local')
        .setPlaceholder('Selecione')
        .addOptions([
          new StringSelectMenuOptionBuilder().setLabel('Dentro do mesmo estado').setValue('intra'),
          new StringSelectMenuOptionBuilder().setLabel('Para outro estado').setValue('inter'),
        ])
    )],
  };
}

function stepDevSt() {
  return {
    embeds: [new EmbedBuilder()
      .setColor(COR.azul)
      .setTitle('↩ Calculadora de Devolução — Passo 2 / 3')
      .setDescription('**O produto tinha Substituição Tributária (ST)?**')],
    components: [new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('fiscal_dev_st')
        .setPlaceholder('Selecione')
        .addOptions([
          new StringSelectMenuOptionBuilder().setLabel('Não tinha ST').setValue('nao'),
          new StringSelectMenuOptionBuilder().setLabel('Sim, tinha ST').setValue('sim'),
        ])
    )],
  };
}

function stepDevQuem() {
  return {
    embeds: [new EmbedBuilder()
      .setColor(COR.azul)
      .setTitle('↩ Calculadora de Devolução — Passo 3 / 3')
      .setDescription('**Quem vai devolver?**')],
    components: [new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('fiscal_dev_quem')
        .setPlaceholder('Selecione')
        .addOptions([
          new StringSelectMenuOptionBuilder().setLabel('Empresa (CNPJ — PJ)').setValue('pj'),
          new StringSelectMenuOptionBuilder().setLabel('Consumidor Final (CPF — PF)').setValue('pf'),
        ])
    )],
  };
}

// ════════════════════════════════════════════════════════
//  EMBEDS DE RESULTADO
// ════════════════════════════════════════════════════════

function resultadoDiag(r) {
  const embed = new EmbedBuilder()
    .setColor(COR.verde)
    .setTitle('✅ Orientação Fiscal Gerada')
    .addFields(
      { name: '📌 CFOP',        value: `\`${r.cfop}\``, inline: true  },
      { name: '📌 CST / CSOSN', value: `\`${r.cst}\``,  inline: true  },
      { name: '📌 Natureza',    value: r.natureza,        inline: false },
      { name: '⚠️ Pontos de atenção', value: r.obs.map(o => `→ ${o}`).join('\n'), inline: false },
      { name: '💬 Script sugerido',   value: `*"${r.script}"*`, inline: false },
    )
    .setFooter({ text: '⚠ Validar com a contabilidade antes de emitir.' });

  const btnNovo = new ButtonBuilder()
    .setCustomId('fiscal_diag_novo')
    .setLabel('↺ Novo diagnóstico')
    .setStyle(ButtonStyle.Secondary);

  return { embeds: [embed], components: [new ActionRowBuilder().addComponents(btnNovo)] };
}

function resultadoDev(r) {
  const embed = new EmbedBuilder()
    .setColor(COR.azul)
    .setTitle('✅ Orientação de Devolução')
    .addFields(
      { name: '📌 CFOP',       value: `\`${r.cfop}\``, inline: true  },
      { name: '📌 CST/CSOSN',  value: `\`${r.cst}\``,  inline: true  },
      { name: '📌 Quem emite', value: r.emitente,        inline: false },
      { name: '📋 Detalhes',   value: r.obs.map(o => `→ ${o}`).join('\n'), inline: false },
    )
    .setFooter({ text: '⚠ Validar com a contabilidade antes de emitir.' });

  const btnNova = new ButtonBuilder()
    .setCustomId('fiscal_dev_nova')
    .setLabel('↺ Nova consulta')
    .setStyle(ButtonStyle.Secondary);

  return { embeds: [embed], components: [new ActionRowBuilder().addComponents(btnNova)] };
}

function embedFaq(faq) {
  return new EmbedBuilder()
    .setColor(COR.principal)
    .setTitle(faq.titulo)
    .setDescription(faq.texto.map(t => `→ ${t}`).join('\n'));
}
