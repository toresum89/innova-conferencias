const cron = require('node-cron');
const db = require('./database');
const { sendReminderEmail } = require('./emailService');

function getDaysUntil(dateStr) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const conf = new Date(dateStr + 'T00:00:00');
  conf.setHours(0, 0, 0, 0);
  return Math.round((conf - today) / (1000 * 60 * 60 * 24));
}

async function processReminders() {
  console.log(`[${new Date().toLocaleString('es-PE')}] Verificando recordatorios pendientes...`);
  const conferences = db.prepare('SELECT * FROM conferences').all();

  for (const conf of conferences) {
    const days = getDaysUntil(conf.date);

    if (days === 7) {
      const pending = db.prepare(`
        SELECT * FROM registrations WHERE conference_id = ? AND week_reminder_sent = 0
      `).all(conf.id);

      for (const reg of pending) {
        try {
          await sendReminderEmail(reg, conf, 'week');
          db.prepare('UPDATE registrations SET week_reminder_sent = 1 WHERE id = ?').run(reg.id);
          console.log(`  ✓ Recordatorio semana → ${reg.email}`);
        } catch (err) {
          console.error(`  ✗ Error (semana) → ${reg.email}:`, err.message);
        }
      }
    }

    if (days === 1) {
      if (!conf.link) {
        console.warn(`  ⚠ ${conf.name}: sin enlace configurado — recordatorio de 1 día omitido`);
        continue;
      }
      const pending = db.prepare(`
        SELECT * FROM registrations WHERE conference_id = ? AND day_reminder_sent = 0
      `).all(conf.id);

      for (const reg of pending) {
        try {
          await sendReminderEmail(reg, conf, 'day');
          db.prepare('UPDATE registrations SET day_reminder_sent = 1 WHERE id = ?').run(reg.id);
          console.log(`  ✓ Recordatorio día → ${reg.email}`);
        } catch (err) {
          console.error(`  ✗ Error (día) → ${reg.email}:`, err.message);
        }
      }
    }
  }
}

// Corre todos los días a las 8:00 AM
cron.schedule('0 8 * * *', processReminders);

console.log('Scheduler iniciado — recordatorios automáticos a las 8:00 AM diariamente');
