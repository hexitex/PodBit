require('dotenv').config();
const express = require('express');
const nodemailer = require('nodemailer');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8080;

// ── Middleware ─────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Serve static files (index.html, docs.html, css/, js/, etc.)
app.use(express.static(path.join(__dirname), {
  extensions: ['html'],
  index: 'index.html',
}));

// ── Rate Limiter (in-memory) ──────────────────────────────
const rateMap = new Map();
const RATE_LIMIT = 3;
const RATE_WINDOW = 15 * 60 * 1000; // 15 minutes

/** Returns true if the IP is under the rate limit; otherwise false (increments count when allowed). */
function checkRateLimit(ip) {
  const now = Date.now();
  const entry = rateMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW });
    return true;
  }
  if (entry.count >= RATE_LIMIT) return false;
  entry.count++;
  return true;
}

// Cleanup stale entries every 30 minutes
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateMap) {
    if (now > entry.resetAt) rateMap.delete(ip);
  }
}, 30 * 60 * 1000);

// ── Nodemailer Transporter ────────────────────────────────
const transporter = nodemailer.createTransport({
  host: 'smtp.zoho.com',
  port: 465,
  secure: true,
  auth: {
    user: process.env.ZOHO_EMAIL,
    pass: process.env.ZOHO_PASSWORD,
  },
});

// Verify connection on startup
transporter.verify().then(() => {
  console.log('SMTP connection verified');
}).catch((err) => {
  console.error('SMTP connection failed:', err.message);
});

// ── HTML escaping ─────────────────────────────────────────
/** Escapes &, <, >, " for safe HTML output in contact form. */
function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── POST /contact ─────────────────────────────────────────
app.post('/contact', async (req, res) => {
  try {
    const { name, email, message, website } = req.body;

    // Honeypot — hidden field that bots fill
    if (website) {
      return res.json({ success: true });
    }

    // Input validation
    if (!name || !email || !message) {
      return res.status(400).json({ success: false, error: 'All fields are required.' });
    }
    if (typeof name !== 'string' || name.length > 200) {
      return res.status(400).json({ success: false, error: 'Name is too long.' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
      return res.status(400).json({ success: false, error: 'Please enter a valid email address.' });
    }
    if (typeof message !== 'string' || message.length < 10) {
      return res.status(400).json({ success: false, error: 'Message must be at least 10 characters.' });
    }
    if (message.length > 5000) {
      return res.status(400).json({ success: false, error: 'Message is too long (max 5000 characters).' });
    }

    // Rate limiting
    const ip = req.ip || req.socket.remoteAddress;
    if (!checkRateLimit(ip)) {
      return res.status(429).json({ success: false, error: 'Too many messages. Please try again later.' });
    }

    // Send email
    await transporter.sendMail({
      from: `"Podbit Contact" <${process.env.ZOHO_EMAIL}>`,
      to: process.env.CONTACT_TO_EMAIL,
      replyTo: email,
      subject: `Podbit Contact: ${name}`,
      text: `Name: ${name}\nEmail: ${email}\n\nMessage:\n${message}`,
      html: [
        `<p><strong>Name:</strong> ${escapeHtml(name)}</p>`,
        `<p><strong>Email:</strong> ${escapeHtml(email)}</p>`,
        `<hr>`,
        `<p>${escapeHtml(message).replace(/\n/g, '<br>')}</p>`,
      ].join('\n'),
    });

    res.json({ success: true });
  } catch (err) {
    console.error('Contact form error:', err);
    res.status(500).json({ success: false, error: 'Failed to send message. Please try again later.' });
  }
});

// ── Start ─────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Podbit site running on http://localhost:${PORT}`);
});
