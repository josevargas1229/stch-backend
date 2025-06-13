const express = require('express');
const session = require('express-session');
const apiRoutes = require('./routes/api');
const corsConfig = require('./config/cors');
const helmetConfig = require('./config/helmet');
const { generalLimiter, strictLimiter } = require('./config/rateLimit');
const cookieParser = require('cookie-parser');
const {generateCsrfToken,doubleCsrfProtection} = require('./config/csrf');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;
app.disable('x-powered-by'); // Deshabilitar encabezado x-powered-by
// Middleware
app.use(corsConfig);
app.use(helmetConfig);
app.use(generalLimiter);
app.use(cookieParser()); // Mover cookieParser antes de session
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Configurar sesiones
app.use(session({
    name: 'SessionId', // Nombre de la cookie
    secret: process.env.SESSION_SECRET || 'secreto',
    resave: false,
    saveUninitialized: true, // Cambiado a true para generar session.id
    cookie: {
        secure: process.env.NODE_ENV === 'production', // Solo HTTPS en producción
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000
    }
}));

// Ruta para obtener token CSRF (antes de aplicar protección CSRF)
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
app.use('/api', apiRoutes);

// Ruta raíz
app.get('/', (req, res) => {
    res.send('API para STCHidalgo');
});

// Manejo de errores CSRF
app.use((err, req, res, next) => {
    if (err.code === 'EBADCSRFTOKEN') {
        console.error(`CSRF Token inválido en ${req.method} ${req.originalUrl}`);
        return res.status(403).json({ error: 'Token CSRF inválido' });
    }
    next(err);
});

// Manejo de errores global
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Algo salió mal' });
});

// Iniciar servidor
app.listen(port, () => {
    console.log(`Servidor corriendo en http://localhost:${port}`);
});