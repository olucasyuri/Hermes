// ════════════════════════════════════════════════════════
//  HERMES — Comando: /analisar
//  Análise inteligente de escalas com Gemini
//  Arquivo: src/commands/analisar.js
// ════════════════════════════════════════════════════════

const { SlashCommandBuilder } = require('discord.js');
const { analisarEscalas }     = require('../utils/gemini');
const { getColaboradores, readJSON, LOG_FILE } = require('../server');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('analisar')
    .setDescription('Análise inteligente das escalas com IA')
    .addSubcommand(sub =>
      sub.setName('semana')
         .setDescription('Resumo inteligente da semana atual')
    )
    .addSubcommand(sub =>
      sub.setName('geral')
         .setDescription('Análise completa do histórico: internos, externos, padrões por dia')
    )
    .addSubcommand(sub =>
      sub.setName('perguntar')
         .setDescription('Faça uma pergunta livre sobre as escalas')
         .addStringOption(opt =>
           opt.setName('pergunta')
              .setDescription('Ex: Qual dia da semana tem mais técnicos internos?')
              .setRequired(true)
         )
    ),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: false });

    const sub      = interaction.options.getSubcommand();
    const log      = readJSON(LOG_FILE, {});
    const colabs   = getColaboradores();

    if (Object.keys(log).length === 0) {
      return interaction.editReply('📊 Nenhuma escala registrada ainda. Envie algumas escalas pelo site primeiro!');
    }

    try {
      let logFiltrado = log;

      // /analisar semana → filtra últimos 7 dias
      if (sub === 'semana') {
        const hoje   = new Date();
        const diasSemana  = Array.from({ length: 7 }, (_, i) => {
          const d = new Date(hoje);
          d.setDate(hoje.getDate() - i);
          return d.toISOString().slice(0, 10);
        });
        logFiltrado = Object.fromEntries(
          Object.entries(log).filter(([k]) => diasSemana.includes(k))
        );
        if (Object.keys(logFiltrado).length === 0) {
          return interaction.editReply('📊 Nenhuma escala registrada nos últimos 7 dias.');
        }
      }

      // /analisar perguntar → passa a pergunta para o Gemini
      const pergunta = sub === 'perguntar'
        ? interaction.options.getString('pergunta')
        : null;

      await interaction.editReply('🤖 Analisando dados com IA... aguarde um momento.');

      const analise = await analisarEscalas(logFiltrado, colabs, pergunta);

      // Discord tem limite de 2000 chars por mensagem
      if (analise.length <= 1900) {
        await interaction.editReply(analise);
      } else {
        // Divide em partes se necessário
        const partes = analise.match(/.{1,1900}/gs) || [analise];
        await interaction.editReply(partes[0]);
        for (let i = 1; i < partes.length; i++) {
          await interaction.followUp(partes[i]);
        }
      }

    } catch (err) {
      console.error('[HERMES /analisar] Erro:', err.message);
      await interaction.editReply(`❌ Erro ao analisar: ${err.message}`);
    }
  },
};
