// ════════════════════════════════════════════════════════
//  HERMES — Agendador de Tarefas
//  Carrega e executa tasks automáticas (ex: almoço diário)
// ════════════════════════════════════════════════════════

const fs   = require('fs');
const path = require('path');
const { timezoneOffset } = require('../config/config');

/**
 * Retorna o horário atual ajustado para o fuso configurado
 * @returns {{ hora: number, minuto: number, diaSemana: number }}
 */
function nowBrasilia() {
  const now     = new Date();
  const utcMs   = now.getTime() + now.getTimezoneOffset() * 60000;
  const local   = new Date(utcMs + timezoneOffset * 3600000);
  return {
    hora:      local.getHours(),
    minuto:    local.getMinutes(),
    diaSemana: local.getDay(), // 0=dom, 1=seg...
    date:      local,
  };
}

/**
 * Carrega todas as tasks da pasta /tasks e inicia o loop de verificação
 * @param {import('discord.js').Client} client
 */
function loadTasks(client) {
  const tasksPath = path.join(__dirname, '../tasks');
  const taskFiles = fs.readdirSync(tasksPath).filter(f => f.endsWith('.js'));

  const tasks = [];
  for (const file of taskFiles) {
    const task = require(path.join(tasksPath, file));
    if (task.schedule && task.execute) {
      tasks.push(task);
      console.log(`[HERMES] Task agendada: ${task.name || file}`);
    }
  }

  if (tasks.length === 0) return;

  // Verifica a cada minuto se alguma task deve executar
  setInterval(() => {
    const { hora, minuto, diaSemana, date } = nowBrasilia();

    for (const task of tasks) {
      const { dias, hora: h, minuto: m } = task.schedule;
      if (hora === h && minuto === m && dias.includes(diaSemana)) {
        console.log(`[HERMES] Executando task: ${task.name}`);
        task.execute(client, date).catch(err =>
          console.error(`[HERMES] Erro na task ${task.name}:`, err)
        );
      }
    }
  }, 60 * 1000); // verifica a cada 60s

  console.log(`[HERMES] Agendador ativo — ${tasks.length} task(s) monitorada(s)`);
}

module.exports = { loadTasks, nowBrasilia };
