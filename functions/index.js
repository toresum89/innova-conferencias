const functions = require('firebase-functions');
const admin     = require('firebase-admin');
const express   = require('express');
const cors      = require('cors');

admin.initializeApp();
const db  = admin.firestore();
const app = express();
app.use(cors({ origin: true }));
app.use(express.json());

// ── Seed helper ──────────────────────────────────────────────────────────────

let seeded = false;
async function seedIfEmpty() {
  if (seeded) return;
  const snap = await db.collection('conferences').limit(1).get();
  if (!snap.empty) { seeded = true; return; }
  const batch = db.batch();
  [
    { name: 'Conferencia 1', date: '2026-06-16', description: 'Ciclo de Conferencias — Junio 2026' },
    { name: 'Conferencia 2', date: '2026-06-18', description: 'Ciclo de Conferencias — Junio 2026' },
    { name: 'Conferencia 3', date: '2026-06-29', description: 'Ciclo de Conferencias — Junio 2026' },
  ].forEach(c => {
    batch.set(db.collection('conferences').doc(), {
      ...c,
      link: null,
      registrationsCount: 0,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  });
  await batch.commit();
  seeded = true;
}

// ── Public routes ────────────────────────────────────────────────────────────

app.get('/api/conferences', async (req, res) => {
  try {
    await seedIfEmpty();
    const snap = await db.collection('conferences').orderBy('date').get();
    res.json(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/register', async (req, res) => {
  const { conference_id, parent_name, email, phone, student_name, grade } = req.body;
  if (!conference_id || !parent_name || !email || !student_name)
    return res.status(400).json({ error: 'Faltan campos requeridos' });

  const dup = await db.collection('registrations')
    .where('conferenceId', '==', conference_id)
    .where('email', '==', email)
    .limit(1).get();
  if (!dup.empty)
    return res.status(409).json({ error: 'Ya existe un registro con este correo para esta conferencia' });

  const confDoc = await db.collection('conferences').doc(conference_id).get();
  if (!confDoc.exists) return res.status(404).json({ error: 'Conferencia no encontrada' });
  const conf = { id: confDoc.id, ...confDoc.data() };

  const regRef = db.collection('registrations').doc();
  await db.runTransaction(t => {
    t.set(regRef, {
      conferenceId:   conference_id,
      conferenceName: conf.name,
      conferenceDate: conf.date,
      parentName:     parent_name,
      email,
      phone:          phone || null,
      studentName:    student_name,
      grade:          grade || null,
      registeredAt:   admin.firestore.FieldValue.serverTimestamp(),
    });
    t.update(confDoc.ref, { registrationsCount: admin.firestore.FieldValue.increment(1) });
    return Promise.resolve();
  });

  res.json({ success: true, message: 'Registro exitoso.' });
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
  const { conference_id } = req.query;
  let q = db.collection('registrations');
  if (conference_id) q = q.where('conferenceId', '==', conference_id);
  const snap = await q.orderBy('registeredAt', 'desc').get();
  res.json(snap.docs.map(d => {
    const r = d.data();
    return {
      id:              d.id,
      conference_id:   r.conferenceId,
      conference_name: r.conferenceName,
      conference_date: r.conferenceDate,
      parent_name:     r.parentName,
      email:           r.email,
      phone:           r.phone,
      student_name:    r.studentName,
      grade:           r.grade,
      registered_at:   r.registeredAt?.toDate?.()?.toISOString() || '',
    };
  }));
});

app.post('/api/admin/conference', adminAuth, async (req, res) => {
  const { name, date, description } = req.body;
  if (!name || !date) return res.status(400).json({ error: 'Nombre y fecha requeridos' });
  const ref = await db.collection('conferences').add({
    name, date, description: description || null,
    link: null, registrationsCount: 0,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  res.json({ success: true, id: ref.id });
});

// ── Cloud Function export ────────────────────────────────────────────────────

exports.api = functions.https.onRequest(app);
