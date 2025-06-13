const rateLimit = require('express-rate-limit');

const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 100, // Máximo 100 solicitudes por IP
    message: { error: 'Demasiadas solicitudes, intenta de nuevo más tarde.' },
    standardHeaders: true,
    legacyHeaders: false
});

const strictLimiter = rateLimit({
    windowMs: 10 * 60 * 1000, // 10 minutos
    max: 10, // Máximo 10 solicitudes
    message: { error: 'Límite de solicitudes alcanzado para esta ruta.' }
});

module.exports = { generalLimiter, strictLimiter };