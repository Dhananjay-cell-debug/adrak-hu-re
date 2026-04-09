const express = require('express');
const cors    = require('cors');
const path    = require('path');
require('dotenv').config();

const app = express();

app.use(cors());
app.use(express.json());

// Serve all static HTML/CSS/JS files (local dev — Vercel serves these via CDN)
app.use(express.static(path.join(__dirname)));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// API Routes
app.use('/api/creator', require('./routes/creator'));
app.use('/api/brand', require('./routes/brand'));
app.use('/api/user', require('./routes/user'));

// Health check
app.get('/api/health', (req, res) => res.json({ ok: true, ts: Date.now() }));

// Only bind to a port when run directly (local dev).
// On Vercel serverless, api/index.js imports this module and Vercel handles the port.
if (require.main === module) {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        console.log(`\n✅  Velt Industries server running → http://localhost:${PORT}`);
        console.log(`   Open: http://localhost:${PORT}/index.html\n`);
    });
}

module.exports = app;
