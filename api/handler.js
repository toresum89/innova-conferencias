require('dotenv').config();
const express = require('express');
const path    = require('path');
const { Pool } = require('pg');
const cors = require('cors');
const { sendConfirmationEmail, sendReminderEmail } = require('./emailService');

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: { rejectUnauthorized: false },
});

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());

// ── DB init (runs once per cold start) ──────────────────────────────────────

let ready = false;
async function ensureDb() {
  if (ready) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS conferences (
      id          SERIAL PRIMARY KEY,
      name        TEXT NOT NULL,
      date        TEXT NOT NULL,
      description TEXT,
      link        TEXT,
      created_at  TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS registrations (
      id                  SERIAL PRIMARY KEY,
      conference_id       INTEGER NOT NULL REFERENCES conferences(id),
      parent_name         TEXT NOT NULL,
      email               TEXT NOT NULL,
      phone               TEXT,
      student_name        TEXT NOT NULL,
      grade               TEXT,
      registered_at       TIMESTAMPTZ DEFAULT NOW(),
      week_reminder_sent  BOOLEAN DEFAULT FALSE,
      day_reminder_sent   BOOLEAN DEFAULT FALSE
    );
  `);

  // Add columns if they don't exist yet
  await pool.query(`
    ALTER TABLE conferences ADD COLUMN IF NOT EXISTS registration_blocked BOOLEAN DEFAULT FALSE;
    ALTER TABLE conferences ADD COLUMN IF NOT EXISTS blocked_label TEXT;
  `);

  const { rows: [{ c }] } = await pool.query('SELECT COUNT(*)::int AS c FROM conferences');
  if (c === 0) {
    await pool.query(`
      INSERT INTO conferences (name, date, description, registration_blocked, blocked_label) VALUES
        ('Ciberseguridad y Ciberacoso', '2026-06-16', '3:30 P.M. - Aprende a identificar riesgos digitales, proteger la información personal y acompañar a tus hijos en el uso seguro de internet.', FALSE, NULL),
        ('Las Redes Sociales en las Infancias y Adolescencias', '2026-06-18', '9:30 A.M. - Reflexionaremos sobre el uso responsable de las redes sociales, la identidad digital, la privacidad y el impacto de nuestras acciones en línea.', TRUE, 'Conferencia dirigida a alumnos'),
        ('Acoso Escolar', '2026-06-29', '10:30 A.M. - Conoceremos estrategias para identificar señales de alerta, fomentar la comunicación y contribuir a la prevención del acoso escolar.', FALSE, NULL)
    `);
  } else {
    // Fix conference names and blocked status on existing data
    await pool.query(`
      UPDATE conferences SET
        name        = 'Ciberseguridad y Ciberacoso',
        description = '3:30 P.M. - Aprende a identificar riesgos digitales, proteger la información personal y acompañar a tus hijos en el uso seguro de internet.',
        registration_blocked = FALSE,
        blocked_label = NULL
      WHERE date = '2026-06-16';

      UPDATE conferences SET
        name        = 'Las Redes Sociales en las Infancias y Adolescencias',
        description = '9:30 A.M. - Reflexionaremos sobre el uso responsable de las redes sociales, la identidad digital, la privacidad y el impacto de nuestras acciones en línea.',
        registration_blocked = TRUE,
        blocked_label = 'Conferencia dirigida a alumnos'
      WHERE date = '2026-06-18';

      UPDATE conferences SET
        name        = 'Acoso Escolar',
        description = '10:30 A.M. - Conoceremos estrategias para identificar señales de alerta, fomentar la comunicación y contribuir a la prevención del acoso escolar.',
        registration_blocked = FALSE,
        blocked_label = NULL
      WHERE date = '2026-06-29';
    `);
  }
  ready = true;
}

// ── Public routes ────────────────────────────────────────────────────────────

app.get('/api/conferences', async (req, res) => {
  try {
    await ensureDb();
    const { rows } = await pool.query(`
      SELECT c.*, COUNT(r.id)::int AS registrations_count
      FROM conferences c
      LEFT JOIN registrations r ON r.conference_id = c.id
      GROUP BY c.id ORDER BY c.date ASC
    `);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/register', async (req, res) => {
  try {
    await ensureDb();
    const { conference_id, parent_name, email, phone, student_name, grade } = req.body;
    if (!conference_id || !parent_name || !email || !student_name)
      return res.status(400).json({ error: 'Faltan campos requeridos' });

    const { rows: dup } = await pool.query(
      'SELECT id FROM registrations WHERE conference_id = $1 AND email = $2',
      [conference_id, email]
    );
    if (dup.length) return res.status(409).json({ error: 'Ya existe un registro con este correo para esta conferencia' });

    const { rows: [conf] } = await pool.query('SELECT * FROM conferences WHERE id = $1', [conference_id]);
    if (!conf) return res.status(404).json({ error: 'Conferencia no encontrada' });

    const { rows: [reg] } = await pool.query(`
      INSERT INTO registrations (conference_id, parent_name, email, phone, student_name, grade)
      VALUES ($1, $2, $3, $4, $5, $6) RETURNING *
    `, [conference_id, parent_name, email, phone || null, student_name, grade || null]);

    try { await sendConfirmationEmail(reg, conf); }
    catch (e) { console.error('Email error:', e.message); }

    res.json({ success: true, message: 'Registro exitoso. Se ha enviado un correo de confirmación.' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Admin middleware ─────────────────────────────────────────────────────────

function adminAuth(req, res, next) {
  const key = req.headers['x-admin-key'] || req.query.key;
  if (key !== (process.env.ADMIN_KEY || 'innova2026'))
    return res.status(401).json({ error: 'No autorizado' });
  next();
}

// ── Admin routes ─────────────────────────────────────────────────────────────

app.get('/api/admin/registrations', adminAuth, async (req, res) => {
  try {
    const { conference_id } = req.query;
    const args = [];
    let sql = `SELECT r.*, c.name AS conference_name, c.date AS conference_date
               FROM registrations r JOIN conferences c ON c.id = r.conference_id`;
    if (conference_id) { sql += ' WHERE r.conference_id = $1'; args.push(conference_id); }
    sql += ' ORDER BY r.registered_at DESC';
    const { rows } = await pool.query(sql, args);
    res.json(rows.map(r => ({
      ...r,
      registered_at:     r.registered_at?.toISOString?.() || '',
      week_reminder_sent: r.week_reminder_sent ? 1 : 0,
      day_reminder_sent:  r.day_reminder_sent  ? 1 : 0,
    })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/admin/conference', adminAuth, async (req, res) => {
  const { name, date, description } = req.body;
  if (!name || !date) return res.status(400).json({ error: 'Nombre y fecha requeridos' });
  const { rows: [c] } = await pool.query(
    'INSERT INTO conferences (name, date, description) VALUES ($1, $2, $3) RETURNING id',
    [name, date, description || null]
  );
  res.json({ success: true, id: c.id });
});

app.put('/api/admin/conference/:id/link', adminAuth, async (req, res) => {
  await pool.query('UPDATE conferences SET link = $1 WHERE id = $2', [req.body.link || null, req.params.id]);
  res.json({ success: true });
});

app.post('/api/admin/conference/:id/send-link', adminAuth, async (req, res) => {
  const { rows: [conf] } = await pool.query('SELECT * FROM conferences WHERE id = $1', [req.params.id]);
  if (!conf) return res.status(404).json({ error: 'Conferencia no encontrada' });
  if (!conf.link) return res.status(400).json({ error: 'La conferencia no tiene enlace configurado' });
  const { rows: regs } = await pool.query('SELECT * FROM registrations WHERE conference_id = $1', [req.params.id]);
  let sent = 0, errors = 0;
  for (const r of regs) {
    try { await sendReminderEmail(r, conf, 'manual'); sent++; }
    catch (e) { errors++; console.error(e.message); }
  }
  res.json({ success: true, sent, errors });
});

// ── Cron: daily reminders (called by Vercel Cron at 0 13 * * *) ─────────────

app.get('/api/cron/reminders', async (req, res) => {
  // Vercel Cron passes Authorization: Bearer {CRON_SECRET}
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.headers.authorization !== `Bearer ${cronSecret}`)
    return res.status(401).json({ error: 'Unauthorized' });

  function daysUntil(dateStr) {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const d = new Date(dateStr + 'T00:00:00'); d.setHours(0, 0, 0, 0);
    return Math.round((d - today) / 86400000);
  }

  const { rows: confs } = await pool.query('SELECT * FROM conferences');
  let weekSent = 0, daySent = 0;

  for (const conf of confs) {
    const days = daysUntil(conf.date);

    if (days === 7) {
      const { rows } = await pool.query(
        'SELECT * FROM registrations WHERE conference_id = $1 AND week_reminder_sent = FALSE', [conf.id]
      );
      for (const r of rows) {
        try {
          await sendReminderEmail(r, conf, 'week');
          await pool.query('UPDATE registrations SET week_reminder_sent = TRUE WHERE id = $1', [r.id]);
          weekSent++;
        } catch (e) { console.error(`Week reminder → ${r.email}:`, e.message); }
      }
    }

    if (days === 1 && conf.link) {
      const { rows } = await pool.query(
        'SELECT * FROM registrations WHERE conference_id = $1 AND day_reminder_sent = FALSE', [conf.id]
      );
      for (const r of rows) {
        try {
          await sendReminderEmail(r, conf, 'day');
          await pool.query('UPDATE registrations SET day_reminder_sent = TRUE WHERE id = $1', [r.id]);
          daySent++;
        } catch (e) { console.error(`Day reminder → ${r.email}:`, e.message); }
      }
    }
  }

  res.json({ success: true, weekSent, daySent });
});

// ── Serve static files (index.html, admin.html) ────────────────────────────

app.use(express.static(path.join(__dirname, '../public')));
app.get('/admin', (req, res) =>
  res.sendFile(path.join(__dirname, '../public/admin.html'))
);

module.exports = app;
