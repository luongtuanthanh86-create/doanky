const crypto = require('node:crypto');
// Cookies are shared across ports. Test databases must not replace the real session.
const database = process.env.DB_NAME || 'cuuho_giaothong';
module.exports = process.env.SESSION_COOKIE_NAME || (database === 'cuuho_giaothong'
  ? 'cuuho.sid'
  : 'cuuho.sid.' + crypto.createHash('sha256').update(database).digest('hex').slice(0, 12));
