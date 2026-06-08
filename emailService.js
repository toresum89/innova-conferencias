require('dotenv').config();
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

function formatDate(dateStr) {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('es-PE', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
}

function baseTemplate(headerExtra, body) {
  return `
    <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.1)">
      <div style="background:linear-gradient(135deg,#1565C0 0%,#0D47A1 50%,#1B5E20 100%);padding:30px 20px;text-align:center">
        <h1 style="color:#fff;margin:0;font-size:1.6rem">Innova Schools</h1>
        <p style="color:#FFD700;margin:5px 0;font-size:1rem">Ciclo de Conferencias — Junio 2026</p>
        <span style="background:#FF6B00;color:#fff;padding:4px 14px;border-radius:20px;font-size:.8rem;font-weight:700">Rumbo a la Copa Innova</span>
      </div>
      ${headerExtra}
      <div style="padding:30px">${body}</div>
      <div style="background:#0D47A1;padding:14px;text-align:center">
        <p style="color:#fff;margin:0;font-size:.78rem">© 2026 Innova Schools — ¡Vamos avanzando juntos rumbo a una educación de clase mundial!</p>
      </div>
    </div>
  `;
}

function linkButton(link) {
  if (!link) return `<p style="color:#888;text-align:center;font-size:.9rem">El enlace de acceso será enviado próximamente.</p>`;
  return `
    <div style="text-align:center;margin:25px 0">
      <a href="${link}" style="background:#2E7D32;color:#fff;padding:14px 32px;text-decoration:none;border-radius:8px;font-size:1rem;font-weight:700;display:inline-block">
        🎥 Unirse a la Conferencia
      </a>
      <p style="color:#888;font-size:.8rem;margin-top:10px">O copia: <a href="${link}" style="color:#1565C0">${link}</a></p>
    </div>
  `;
}

async function sendConfirmationEmail(registration, conference) {
  const body = `
    <h2 style="color:#1565C0">¡Registro Confirmado!</h2>
    <p>Estimado/a <strong>${registration.parent_name}</strong>,</p>
    <p>Su registro ha sido confirmado exitosamente. Le esperamos en la conferencia.</p>
    <div style="background:#F5F5F5;border-left:4px solid #FF6B00;padding:18px 20px;margin:20px 0;border-radius:4px">
      <h3 style="color:#FF6B00;margin:0 0 10px">${conference.name}</h3>
      <p style="margin:4px 0"><strong>Fecha:</strong> ${formatDate(conference.date)}</p>
      <p style="margin:4px 0"><strong>Estudiante:</strong> ${registration.student_name}</p>
      ${registration.grade ? `<p style="margin:4px 0"><strong>Grado:</strong> ${registration.grade}</p>` : ''}
    </div>
    <div style="background:#E8F5E9;border-radius:8px;padding:15px;text-align:center">
      <p style="margin:0;color:#2E7D32;font-weight:600">📅 Recibirá recordatorios automáticos:</p>
      <p style="margin:5px 0;color:#555">• 7 días antes de la conferencia<br>• 1 día antes de la conferencia</p>
    </div>
  `;
  await transporter.sendMail({
    from: `"Innova Schools" <${process.env.SMTP_USER}>`,
    to: registration.email,
    subject: `✅ Registro Confirmado — ${conference.name}`,
    html: baseTemplate('', body),
  });
}

async function sendReminderEmail(registration, conference, type) {
  const configs = {
    week:   { color: '#FF6B00', banner: '⏰ RECORDATORIO: La conferencia es en 1 SEMANA',  subject: `⏰ Recordatorio: ${conference.name} — En 1 semana` },
    day:    { color: '#E53935', banner: '🔔 RECORDATORIO: La conferencia es MAÑANA',        subject: `🔔 ¡Mañana es la conferencia! — ${conference.name}` },
    manual: { color: '#1565C0', banner: '📎 ENLACE DE CONFERENCIA DISPONIBLE',              subject: `📎 Enlace listo — ${conference.name}` },
  };
  const { color, banner, subject } = configs[type] || configs.manual;

  const headerExtra = `
    <div style="background:${color};padding:12px;text-align:center">
      <p style="color:#fff;margin:0;font-size:.95rem;font-weight:700">${banner}</p>
    </div>
  `;
  const body = `
    <p>Estimado/a <strong>${registration.parent_name}</strong>,</p>
    <p>${
      type === 'week'   ? 'Le recordamos que la conferencia para la cual se registró es en <strong>1 semana</strong>.' :
      type === 'day'    ? 'Le recordamos que la conferencia para la cual se registró es <strong>mañana</strong>. ¡No se la pierda!' :
                          'El enlace para acceder a la conferencia ya está disponible.'
    }</p>
    <div style="background:#F5F5F5;border-left:4px solid ${color};padding:18px 20px;margin:20px 0;border-radius:4px">
      <h3 style="color:${color};margin:0 0 10px">${conference.name}</h3>
      <p style="margin:4px 0"><strong>Fecha:</strong> ${formatDate(conference.date)}</p>
      <p style="margin:4px 0"><strong>Estudiante:</strong> ${registration.student_name}</p>
      ${registration.grade ? `<p style="margin:4px 0"><strong>Grado:</strong> ${registration.grade}</p>` : ''}
    </div>
    ${linkButton(conference.link)}
  `;
  await transporter.sendMail({
    from: `"Innova Schools" <${process.env.SMTP_USER}>`,
    to: registration.email,
    subject,
    html: baseTemplate(headerExtra, body),
  });
}

module.exports = { sendConfirmationEmail, sendReminderEmail };
