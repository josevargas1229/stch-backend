const helmet = require('helmet');

const helmetConfig = helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", 'data:'],
            connectSrc: ["'self'", ...(process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : [])]
        }
    },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    hsts: {
        maxAge: 31536000, // 1 año
        includeSubDomains: true,
        preload: true
    }
});

module.exports = helmetConfig;