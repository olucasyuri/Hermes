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
client.once('ready', () => {
  console.log(`\n⚡ Hermes online como ${client.user.tag}`);
  console.log(`📡 ${client.guilds.cache.size} servidor(es)\n`);
  loadTasks(client);
  startServer(client); // ← Inicia HTTP após bot conectar
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

client.login(process.env.DISCORD_TOKEN);
