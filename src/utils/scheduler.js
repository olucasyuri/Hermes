// ════════════════════════════════════════════════════════
//  HERMES — Agendador de Tarefas
//  Suporta tasks por horário fixo E tasks por intervalo
//  Arquivo: src/utils/scheduler.js
// ════════════════════════════════════════════════════════

const fs   = require('fs');
const path = require('path');
const { timezoneOffset } = require('../config/config');

function nowBrasilia() {
  const now   = new Date();
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
  const local = new Date(utcMs + timezoneOffset * 3600000);
  return {
    hora:      local.getHours(),
    minuto:    local.getMinutes(),
    diaSemana: local.getDay(),
    date:      local,
  };
}

function loadTasks(client) {
  const tasksPath = path.join(__dirname, '../tasks');
  const taskFiles = fs.readdirSync(tasksPath).filter(f => f.endsWith('.js'));

  const scheduledTasks = []; // disparo por horário fixo
  const intervalTasks  = []; // disparo por intervalo próprio

  for (const file of taskFiles) {
    const task = require(path.join(tasksPath, file));
    if (!task.execute) continue;

    if (task.interval) {
      // Task com intervalo próprio (ex: monitor a cada 2 min)
      intervalTasks.push(task);
      console.log(`[HERMES] Task intervalo: ${task.name} (${task.interval / 1000}s)`);
    } else if (task.schedule) {
      scheduledTasks.push(task);
      console.log(`[HERMES] Task agendada: ${task.name}`);
    }
  }

  // ── Loop de 60s para tasks por horário fixo ──────────
  if (scheduledTasks.length > 0) {
    setInterval(() => {
      const { hora, minuto, diaSemana, date } = nowBrasilia();
      for (const task of scheduledTasks) {
        const { dias, hora: h, minuto: m } = task.schedule;
        if (h === null || m === null) continue; // pula tasks de intervalo que vieram aqui
        if (hora === h && minuto === m && dias.includes(diaSemana)) {
          console.log(`[HERMES] Executando: ${task.name}`);
          task.execute(client, date).catch(err =>
            console.error(`[HERMES] Erro em ${task.name}:`, err)
          );
        }
      }
    }, 60 * 1000);
  }

  // ── Loop de 30s para tasks com intervalo próprio ─────
  if (intervalTasks.length > 0) {
    setInterval(() => {
      const date = new Date();
      for (const task of intervalTasks) {
        task.execute(client, date).catch(err =>
          console.error(`[HERMES] Erro em ${task.name}:`, err)
        );
      }
    }, 30 * 1000); // verifica a cada 30s, mas cada task controla seu próprio intervalo interno
  }

  const total = scheduledTasks.length + intervalTasks.length;
  console.log(`[HERMES] Agendador ativo — ${total} task(s) monitorada(s)`);
}

module.exports = { loadTasks, nowBrasilia };
