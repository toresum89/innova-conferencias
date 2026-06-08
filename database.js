const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS conferences (
      id          SERIAL PRIMARY KEY,
      name        TEXT NOT NULL,
      date        TEXT NOT NULL,
      description TEXT,
      link        TEXT,
      created_at  TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS registrations (
      id            SERIAL PRIMARY KEY,
      conference_id INTEGER NOT NULL REFERENCES conferences(id),
      parent_name   TEXT NOT NULL,
      email         TEXT NOT NULL,
      phone         TEXT,
      student_name  TEXT NOT NULL,
      grade         TEXT,
      registered_at TIMESTAMP DEFAULT NOW()
    );
  `);

  const { rows } = await pool.query('SELECT COUNT(*) as c FROM conferences');
  if (parseInt(rows[0].c) === 0) {
    await pool.query(
      'INSERT INTO conferences (name, date, description) VALUES ($1, $2, $3)',
      ['Ciberseguridad y Ciberacoso', '2026-06-16', '3:30 P.M. — Aprende a identificar riesgos digitales, proteger la información personal y acompañar a tus hijos en el uso seguro de internet.']
    );
    await pool.query(
      'INSERT INTO conferences (name, date, description) VALUES ($1, $2, $3)',
      ['Las Redes Sociales en las Infancias y Adolescencias', '2026-06-18', '9:30 A.M. — Reflexionaremos sobre el uso responsable de las redes sociales, la identidad digital, la privacidad y el impacto de nuestras acciones en línea.']
    );
    await pool.query(
      'INSERT INTO conferences (name, date, description) VALUES ($1, $2, $3)',
      ['Acoso Escolar', '2026-06-29', '10:30 A.M. — Conoceremos estrategias para identificar señales de alerta, fomentar la comunicación y contribuir a la prevención del acoso escolar.']
    );
  }
}

module.exports = { pool, initDB };
