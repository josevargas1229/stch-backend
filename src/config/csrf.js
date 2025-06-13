/**
 * @file csrf.js
 * @description Configuración de protección CSRF para prevenir ataques de falsificación de solicitudes.
 */

const { doubleCsrf } = require('csrf-csrf');
require('dotenv').config();

/**
 * @constant doubleCsrfOptions
 * @description Opciones de configuración para el middleware de protección CSRF.
 */
const doubleCsrfOptions = {
    getSecret: () => process.env.CSRF_SECRET || 'default-csrf-secret', // Clave secreta para CSRF
    getSessionIdentifier: (req) => req.session.id, // Identificador de sesión
    cookieName: 'x-csrf-token', // Nombre de la cookie CSRF
    cookieOptions: {
        httpOnly: true, // Evita acceso desde JavaScript del cliente
        path: '/', // Ruta de la cookie
        secure: process.env.NODE_ENV === 'production', // Solo HTTPS en producción
        sameSite: process.env.NODE_ENV === 'production' ? 'None' : 'Strict', // Política SameSite
    },
    size: 32, // Tamaño del token CSRF
    ignoredMethods: ['GET', 'HEAD', 'OPTIONS'], // Métodos HTTP ignorados
    /**
     * @description Obtiene el token CSRF desde la solicitud (cabeceras, cuerpo o consulta).
     * @param {express.Request} req - Objeto de solicitud HTTP.
     * @returns {string|undefined} Token CSRF.
     */
    getCsfTokenFromRequest: (req) => {
        return req.headers['x-csrf-token'] || 
               req.body._csrf || 
               req.body.csrfToken ||
               req.query._csrf;
    },
};

/**
 * @description Configuración del middleware de doble protección CSRF.
 */
const {
    invalidCsrfTokenError, // Error para tokens CSRF inválidos
    generateCsrfToken, // Función para generar tokens CSRF
    doubleCsrfProtection, // Middleware de protección CSRF
} = doubleCsrf(doubleCsrfOptions);

module.exports = {
    invalidCsrfTokenError,
    generateCsrfToken,
    doubleCsrfProtection,
};