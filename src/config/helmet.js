/**
 * @file helmet.js
 * @description Configuración de Helmet para establecer encabezados de seguridad HTTP.
 */

const helmet = require('helmet');

/**
 * @constant helmetConfig
 * @description Configuración de Helmet con políticas de seguridad de contenido, HSTS y referrer.
 */
const helmetConfig = helmet({
    /**
     * @description Configuración de Content Security Policy (CSP) para restringir recursos cargados.
     */
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"], // Solo permite recursos del mismo origen
            scriptSrc: ["'self'", "'unsafe-inline'"], // Permite scripts del mismo origen y en línea
            styleSrc: ["'self'", "'unsafe-inline'"], // Permite estilos del mismo origen y en línea
            imgSrc: ["'self'", 'data:'], // Permite imágenes del mismo origen y data URIs
            connectSrc: ["'self'", ...(process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : [])] // Orígenes permitidos para conexiones
        }
    },
    /**
     * @description Configuración de Referrer-Policy para controlar información de referencia.
     */
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    /**
     * @description Configuración de HTTP Strict Transport Security (HSTS).
     */
    hsts: {
        maxAge: 31536000, // 1 año
        includeSubDomains: true, // Aplicar a subdominios
        preload: true // Habilitar precarga de HSTS
    }
});

module.exports = helmetConfig;