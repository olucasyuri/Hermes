// ════════════════════════════════════════════════════════
//  HERMES — Registra Slash Commands na API do Discord
//  Execute UMA VEZ ou sempre que adicionar novos comandos:
//    node src/deploy-commands.js
// ════════════════════════════════════════════════════════

require('dotenv').config();
const { REST, Routes } = require('discord.js');
const fs   = require('fs');
const path = require('path');

const commands     = [];
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'));

for (const file of commandFiles) {
  const command = require(path.join(commandsPath, file));
  if (command.data) {
    commands.push(command.data.toJSON());
    console.log(`[DEPLOY] Preparando: /${command.data.name}`);
  }
}

const rest = new REST().setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log(`\n[DEPLOY] Registrando ${commands.length} comando(s)...`);

    await rest.put(
      Routes.applicationGuildCommands(
        process.env.CLIENT_ID,
        process.env.GUILD_ID,
      ),
      { body: commands },
    );

    console.log(`[DEPLOY] ✅ Comandos registrados com sucesso!\n`);
    console.log('Comandos disponíveis:');
    commands.forEach(c => console.log(`  /${c.name} — ${c.description}`));

  } catch (err) {
    console.error('[DEPLOY] ❌ Erro ao registrar comandos:', err);
  }
})();
