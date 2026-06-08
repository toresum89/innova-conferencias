const nodemailer = require('nodemailer');

function makeTransporter() {
  return nodemailer.createTransport({
    host:   process.env.SMTP_HOST,
    port:   parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth:   { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
}

function fmtDate(d) {
  return new Date(d + 'T12:00:00').toLocaleDateString('es-PE', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
}

function base(banner, body) {
  return `
  <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.1)">
    <div style="background:linear-gradient(135deg,#1565C0 0%,#0D47A1 50%,#1B5E20 100%);padding:28px 20px;text-align:center">
      <h1 style="color:#fff;margin:0;font-size:1.5rem">Innova Schools</h1>
      <p style="color:#FFD700;margin:5px 0">Ciclo de Conferencias — Junio 2026</p>
      <span style="background:#FF6B00;color:#fff;padding:4px 14px;border-radius:20px;font-size:.78rem;font-weight:700">Rumbo a la Copa Innova</span>
    </div>
    ${banner}
    <div style="padding:28px">${body}</div>
    <div style="background:#0D47A1;padding:13px;text-align:center">
      <p style="color:#fff;margin:0;font-size:.75rem">© 2026 Innova Schools — ¡Vamos avanzando juntos!</p>
    </div>
  </div>`;
}

function linkBtn(link) {
  if (!link) return `<p style="color:#888;text-align:center;font-size:.9rem">El enlace de acceso será enviado próximamente.</p>`;
  return `
    <div style="text-align:center;margin:24px 0">
      <a href="${link}" style="background:#2E7D32;color:#fff;padding:14px 30px;text-decoration:none;border-radius:8px;font-size:1rem;font-weight:700;display:inline-block">🎥 Unirse a la Conferencia</a>
      <p style="color:#aaa;font-size:.78rem;margin-top:8px">O copia: <a href="${link}" style="color:#1565C0">${link}</a></p>
    </div>`;
}

async function sendConfirmationEmail(reg, conf) {
  const body = `
    <h2 style="color:#1565C0">¡Registro Confirmado!</h2>
    <p>Estimado/a <strong>${reg.parent_name}</strong>,</p>
    <p>Su registro ha sido confirmado exitosamente.</p>
    <div style="background:#F5F5F5;border-left:4px solid #FF6B00;padding:16px 18px;margin:18px 0;border-radius:4px">
      <h3 style="color:#FF6B00;margin:0 0 8px">${conf.name}</h3>
      <p style="margin:3px 0"><strong>Fecha:</strong> ${fmtDate(conf.date)}</p>
      <p style="margin:3px 0"><strong>Estudiante:</strong> ${reg.student_name}</p>
      ${reg.grade ? `<p style="margin:3px 0"><strong>Grado:</strong> ${reg.grade}</p>` : ''}
    </div>
    <div style="background:#E8F5E9;border-radius:8px;padding:14px;text-align:center">
      <p style="margin:0;color:#2E7D32;font-weight:700">📅 Recibirá recordatorios automáticos:</p>
      <p style="margin:5px 0;color:#555">• 7 días antes de la conferencia<br>• 1 día antes de la conferencia</p>
    </div>`;
  await makeTransporter().sendMail({
    from: `"Innova Schools" <${process.env.SMTP_USER}>`,
    to: reg.email,
    subject: `✅ Registro Confirmado — ${conf.name}`,
    html: base('', body),
  });
}

async function sendReminderEmail(reg, conf, type) {
  const cfg = {
    week:   { color: '#FF6B00', banner: '⏰ RECORDATORIO: La conferencia es en 1 SEMANA',  subj: `⏰ Recordatorio: ${conf.name} — En 1 semana` },
    day:    { color: '#E53935', banner: '🔔 RECORDATORIO: La conferencia es MAÑANA',        subj: `🔔 ¡Mañana es la conferencia! — ${conf.name}` },
    manual: { color: '#1565C0', banner: '📎 ENLACE DE CONFERENCIA DISPONIBLE',              subj: `📎 Enlace listo — ${conf.name}` },
  };
  const { color, banner, subj } = cfg[type] || cfg.manual;
  const msg = type === 'week' ? 'en <strong>1 semana</strong>' : type === 'day' ? '<strong>mañana</strong>' : 'disponible ahora';

  const hdr = `<div style="background:${color};padding:11px;text-align:center"><p style="color:#fff;margin:0;font-weight:700">${banner}</p></div>`;
  const body = `
    <p>Estimado/a <strong>${reg.parent_name}</strong>,</p>
    <p>Le recordamos que la conferencia registrada es ${msg}.</p>
    <div style="background:#F5F5F5;border-left:4px solid ${color};padding:16px 18px;margin:18px 0;border-radius:4px">
      <h3 style="color:${color};margin:0 0 8px">${conf.name}</h3>
      <p style="margin:3px 0"><strong>Fecha:</strong> ${fmtDate(conf.date)}</p>
      <p style="margin:3px 0"><strong>Estudiante:</strong> ${reg.student_name}</p>
      ${reg.grade ? `<p style="margin:3px 0"><strong>Grado:</strong> ${reg.grade}</p>` : ''}
    </div>
    ${linkBtn(conf.link)}`;
  await makeTransporter().sendMail({
    from: `"Innova Schools" <${process.env.SMTP_USER}>`,
    to: reg.email,
    subject: subj,
    html: base(hdr, body),
  });
}

module.exports = { sendConfirmationEmail, sendReminderEmail };
