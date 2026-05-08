// ════════════════════════════════════════════════════════
//  HERMES BOT — Entry Point (com servidor HTTP integrado)
//  Substitui o src/index.js original
// ════════════════════════════════════════════════════════

require('dotenv').config();
const { Client, GatewayIntentBits, Collection } = require('discord.js');
const fs   = require('fs');
const path = require('path');
const { loadTasks }   = require('./utils/scheduler');
const { startServer } = require('./server'); // ← NOVO

// ─── Client ─────────────────────────────────────────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
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

  try {
    loadTasks(client);
    console.log("[HERMES] Tasks carregadas.");
  } catch (err) {
    console.error("[HERMES] Erro ao carregar tasks:", err);
  }

  try {
    startServer(client);
    console.log("[HERMES] Servidor HTTP iniciado.");
  } catch (err) {
    console.error("[HERMES] Erro ao iniciar servidor HTTP:", err);
  }
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;
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
});
process.on("unhandledRejection", (err) => {
  console.error("[HERMES] Unhandled rejection:", err);
});

process.on("uncaughtException", (err) => {
  console.error("[HERMES] Uncaught exception:", err);
});

client.login(process.env.DISCORD_TOKEN);