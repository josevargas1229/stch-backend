const { doubleCsrf } = require('csrf-csrf');
require('dotenv').config();

const doubleCsrfOptions = {
  getSecret: () => process.env.CSRF_SECRET || 'default-csrf-secret',
  getSessionIdentifier: (req) => req.session.id, // Required for session tracking
  cookieName: 'x-csrf-token',
  cookieOptions: {
    httpOnly: true,
    path: '/',
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'None' : 'Strict',
  },
  size: 32,
  ignoredMethods: ['GET', 'HEAD', 'OPTIONS'],
  getCsfTokenFromRequest: (req) => {
    return req.headers['x-csrf-token'] || 
           req.body._csrf || 
           req.body.csrfToken ||
           req.query._csrf;
  },
};

const {
  invalidCsrfTokenError,
  generateCsrfToken, // Corrected from generateToken
  doubleCsrfProtection,
} = doubleCsrf(doubleCsrfOptions);

module.exports = {
  invalidCsrfTokenError,
  generateCsrfToken,
  doubleCsrfProtection,
};