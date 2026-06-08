require('dotenv').config();
const express = require('express');
const path    = require('path');
const { pool, initDB } = require('./database');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── Public API ──────────────────────────────────────────────────────────────

app.get('/api/conferences', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT c.*, COUNT(r.id)::int AS registrations_count
      FROM conferences c
      LEFT JOIN registrations r ON r.conference_id = c.id
      GROUP BY c.id
      ORDER BY c.date ASC
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/register', async (req, res) => {
  const { conference_id, parent_name, email, phone, student_name, grade } = req.body;

  if (!conference_id || !parent_name || !email || !student_name)
    return res.status(400).json({ error: 'Faltan campos requeridos' });

  try {
    const dup = await pool.query(
      'SELECT id FROM registrations WHERE conference_id = $1 AND email = $2',
      [conference_id, email]
    );
    if (dup.rows.length > 0)
      return res.status(409).json({ error: 'Ya existe un registro con este correo para esta conferencia' });

    const conf = await pool.query('SELECT * FROM conferences WHERE id = $1', [conference_id]);
    if (conf.rows.length === 0)
      return res.status(404).json({ error: 'Conferencia no encontrada' });

    await pool.query(
      'INSERT INTO registrations (conference_id, parent_name, email, phone, student_name, grade) VALUES ($1, $2, $3, $4, $5, $6)',
      [conference_id, parent_name, email, phone || null, student_name, grade || null]
    );

    res.json({ success: true, message: 'Registro exitoso.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Admin middleware ────────────────────────────────────────────────────────

const ADMIN_KEY = process.env.ADMIN_KEY || 'innova2026';

function adminAuth(req, res, next) {
  const key = req.headers['x-admin-key'] || req.query.key;
  if (key !== ADMIN_KEY) return res.status(401).json({ error: 'No autorizado' });
  next();
}

// ── Admin API ───────────────────────────────────────────────────────────────

app.get('/api/admin/registrations', adminAuth, async (req, res) => {
  try {
    const { conference_id } = req.query;
    let sql = `
      SELECT r.*, c.name AS conference_name, c.date AS conference_date
      FROM registrations r
      JOIN conferences c ON c.id = r.conference_id
    `;
    const params = [];
    if (conference_id) { sql += ' WHERE r.conference_id = $1'; params.push(conference_id); }
    sql += ' ORDER BY r.registered_at DESC';
    const { rows } = await pool.query(sql, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/conference', adminAuth, async (req, res) => {
  const { name, date, description } = req.body;
  if (!name || !date) return res.status(400).json({ error: 'Nombre y fecha requeridos' });
  try {
    const { rows } = await pool.query(
      'INSERT INTO conferences (name, date, description) VALUES ($1, $2, $3) RETURNING id',
      [name, date, description || null]
    );
    res.json({ success: true, id: rows[0].id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// ── Start ───────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3000;

initDB()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Innova Schools — Conferencias corriendo en puerto ${PORT}`);
      console.log(`Admin: http://localhost:${PORT}/admin  |  Clave: ${ADMIN_KEY}`);
    });
  })
  .catch(err => {
    console.error('Error al inicializar la base de datos:', err);
    process.exit(1);
  });
