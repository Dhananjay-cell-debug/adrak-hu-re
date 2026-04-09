// Vercel serverless entry point — re-exports the Express app from server.js
// Local dev uses `node server.js`; Vercel uses this handler.
module.exports = require('../server.js');
