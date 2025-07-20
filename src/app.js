/**
 * @file app.js
 * @description Configuración y lanzamiento del servidor Express para la API de STCHidalgo.
 *              Incluye middleware de seguridad, manejo de sesiones, protección CSRF y rutas API.
 */

const express = require('express');
const morgan = require('morgan');
const session = require('express-session');
const apiRoutes = require('./routes/api');
const corsConfig = require('./config/cors');
const helmetConfig = require('./config/helmet');
const { generalLimiter, strictLimiter } = require('./config/rateLimit');
const cookieParser = require('cookie-parser');
const { generateCsrfToken, doubleCsrfProtection } = require('./config/csrf');
require('dotenv').config();

/** @type {express.Application} Inicializa la aplicación Express */
const app = express();

/** @type {number|string} Puerto del servidor, obtenido de variables de entorno o predeterminado a 3000 */
const port = process.env.PORT || 3000;

// Deshabilitar encabezado x-powered-by para reducir la exposición de información del servidor
app.disable('x-powered-by');

// Formato predefinido (ej: 'combined', 'dev', 'tiny')
app.use(morgan('dev')); // Muestra logs concisos en desarrollo

// Middleware
app.use(corsConfig); // Configuración de CORS para permitir orígenes específicos
app.use(helmetConfig); // Configuración de Helmet para encabezados de seguridad
app.use(generalLimiter); // Limitador de solicitudes general
app.use(cookieParser()); // Parseador de cookies, necesario antes de la sesión
app.use(express.json()); // Parseo de cuerpos JSON
app.use(express.urlencoded({ extended: true })); // Parseo de cuerpos URL-encoded

/**
 * @description Configuración del middleware de sesiones para manejar autenticación y estado.
 */
app.use(session({
    name: 'SessionId', // Nombre de la cookie de sesión
    secret: process.env.SESSION_SECRET || 'secreto', // Clave secreta para firmar la sesión
    resave: false, // No guardar sesión si no hay cambios
    saveUninitialized: true, // Generar session.id para nuevas sesiones
    cookie: {
        secure: process.env.NODE_ENV === 'production', // Solo HTTPS en producción
        httpOnly: true, // Evita acceso a la cookie desde JavaScript del cliente
        maxAge: 24 * 60 * 60 * 1000 // Duración de la cookie: 1 día
    }
}));

/**
 * @route GET /api/csrf-token
 * @description Genera y devuelve un token CSRF para proteger formularios.
 * @param {express.Request} req - Objeto de solicitud HTTP.
 * @param {express.Response} res - Objeto de respuesta HTTP.
 */
app.get('/api/csrf-token', (req, res) => {
    try {
        // Asegurar que existe session.id
        if (!req.session.id) {
            req.session.save((err) => {
                if (err) {
                    console.error('Error saving session:', err);
                    return res.status(500).json({ error: 'Error de sesión' });
                }
                const csrfToken = generateCsrfToken(req, res);
                res.json({ csrfToken });
            });
        } else {
            const csrfToken = generateCsrfToken(req, res);
            res.json({ csrfToken });
        }
    } catch (error) {
        console.error('Error generando token CSRF:', error);
        res.status(500).json({ error: 'Error generando token CSRF' });
    }
});

// Rutas
app.use('/api', apiRoutes); // Monta las rutas de la API bajo el prefijo /api

/**
 * @route GET /
 * @description Ruta raíz que devuelve un mensaje de bienvenida.
 * @param {express.Request} req - Objeto de solicitud HTTP.
 * @param {express.Response} res - Objeto de respuesta HTTP.
 */
app.get('/', (req, res) => {
    res.send('API para STCHidalgo');
});

/**
 * @description Middleware para manejar errores CSRF.
 * @param {Error} err - Objeto de error.
 * @param {express.Request} req - Objeto de solicitud HTTP.
 * @param {express.Response} res - Objeto de respuesta HTTP.
 * @param {express.NextFunction} next - Función para pasar al siguiente middleware.
 */
app.use((err, req, res, next) => {
    if (err.code === 'EBADCSRFTOKEN') {
        console.error(`CSRF Token inválido en ${req.method} ${req.originalUrl}`);
        return res.status(403).json({ error: 'Token CSRF inválido' });
    }
    next(err);
});

/**
 * @description Middleware global para manejo de errores.
 * @param {Error} err - Objeto de error.
 * @param {express.Request} req - Objeto de solicitud HTTP.
 * @param {express.Response} res - Objeto de respuesta HTTP.
 * @param {express.NextFunction} next - Función para pasar al siguiente middleware.
 */
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Algo salió mal' });
});

/**
 * @description Inicia el servidor en el puerto especificado.
 */
app.listen(port, () => {
    console.log(`Servidor corriendo en http://localhost:${port}`);
});