/**
 * @file rateLimit.js
 * @description Configuración de limitadores de solicitudes para proteger la API contra abusos.
 */

const rateLimit = require('express-rate-limit');

/**
 * @constant generalLimiter
 * @description Limitador de solicitudes general para todas las rutas.
 *              Permite hasta 400 solicitudes por IP en una ventana de 15 minutos.
 */
const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 400, // Máximo 100 solicitudes por IP
    message: { error: 'Demasiadas solicitudes, intenta de nuevo más tarde.' },
    standardHeaders: true, // Incluir encabezados estándar de rate-limit
    legacyHeaders: false // No incluir encabezados obsoletos
});

/**
 * @constant strictLimiter
 * @description Limitador estricto para rutas sensibles.
 *              Permite hasta 10 solicitudes por IP en una ventana de 10 minutos.
 */
const strictLimiter = rateLimit({
    windowMs: 10 * 60 * 1000, // 10 minutos
    max: 10, // Máximo 10 solicitudes
    message: { error: 'Límite de solicitudes alcanzado para esta ruta.' }
});

module.exports = { generalLimiter, strictLimiter };