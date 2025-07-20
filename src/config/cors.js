/**
 * @file cors.js
 * @description Configuración de CORS para controlar acceso a recursos desde diferentes orígenes.
 */

const cors = require('cors');

/**
 * @constant corsOptions
 * @description Opciones de configuración para el middleware CORS.
 */
const corsOptions = {
    origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : ['http://localhost:3000','http://localhost:3001','http://localhost:3002'], // Orígenes permitidos
    methods: ['GET', 'POST', 'PUT', 'DELETE'], // Métodos HTTP permitidos
    allowedHeaders: ['Content-Type', 'Authorization', 'x-csrf-token'], // Cabeceras permitidas
    credentials: true, // Permitir credenciales (cookies, autenticación)
    optionsSuccessStatus: 204 // Código de estado para respuestas OPTIONS exitosas
};

module.exports = cors(corsOptions);