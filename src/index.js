// ════════════════════════════════════════════════════════
//  HERMES BOT — Entry Point (com servidor HTTP integrado)
//  Substitui o src/index.js original
//
//  ALTERAÇÕES em relação ao index.js original:
//  → Adicionada rota de interações para componentes (botões/selects)
//    do módulo /fiscal (customId que começa com "fiscal_")
// ════════════════════════════════════════════════════════
require('dotenv').config();
const { Client, GatewayIntentBits, Collection, Partials } = require('discord.js');
const fs   = require('fs');
const path = require('path');
const { loadTasks }          = require('./utils/scheduler');
const { createHermesServer } = require('./server');

// ─── Client ─────────────────────────────────────────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [Partials.Channel],
});

// ─── Comandos ────────────────────────────────────────────
client.commands = new Collection();
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'));
for (const file of commandFiles) {
  const command = require(path.join(commandsPath, file));
  if (command.data && command.execute) {
    client.commands.set(command.data.name, command);
    console.log(`[HERMES] Comando: /${command.data.name}`);
  }
}

// ─── Eventos ─────────────────────────────────────────────
client.once('ready', async () => {
  console.log(`\n⚡ Hermes online como ${client.user.tag}`);
  console.log(`📡 ${client.guilds.cache.size} servidor(es)\n`);

  try { loadTasks(client);          console.log('[HERMES] Tasks carregadas.');       } catch (err) { console.error('[HERMES] Erro tasks:', err); }
  try { createHermesServer(client); console.log('[HERMES] Servidor HTTP iniciado.'); } catch (err) { console.error('[HERMES] Erro HTTP:', err);  }
});

// ─── Slash commands ───────────────────────────────────────
client.on('interactionCreate', async interaction => {
  // ── Slash commands ──
  if (interaction.isChatInputCommand()) {
    const command = client.commands.get(interaction.commandName);
    if (!command) return;
    try {
      await command.execute(interaction, client);
    } catch (err) {
      console.error(`[HERMES] Erro em /${interaction.commandName}:`, err);
      const reply = { content: '❌ Erro ao executar esse comando.', ephemeral: true };
      if (interaction.replied || interaction.deferred) await interaction.followUp(reply);
      else await interaction.reply(reply);
    }
    return;
  }

  // ── Botões e selects gerados pelo /fiscal ──────────────
  // Todos os customIds do módulo fiscal começam com "fiscal_"
  if (
    (interaction.isStringSelectMenu() || interaction.isButton()) &&
    interaction.customId.startsWith('fiscal_')
  ) {
    const fiscalCmd = client.commands.get('fiscal');
    if (!fiscalCmd?.handleComponent) return;
    try {
      await fiscalCmd.handleComponent(interaction);
    } catch (err) {
      console.error('[HERMES] Erro em componente fiscal:', err);
      if (!interaction.replied && !interaction.deferred)
        await interaction.reply({ content: '❌ Erro ao processar. Tente novamente.', ephemeral: true });
    }
  }
});

// ─── Segurança ────────────────────────────────────────────
process.on('unhandledRejection', err => console.error('[HERMES] Unhandled rejection:', err));
process.on('uncaughtException',  err => console.error('[HERMES] Uncaught exception:',  err));

client.login(process.env.DISCORD_TOKEN);
