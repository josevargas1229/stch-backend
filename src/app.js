const express = require('express');
const session = require('express-session');
const apiRoutes = require('./routes/api');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;
app.disable('x-powered-by'); // Deshabilitar encabezado x-powered-by
// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
// Configurar sesiones
app.use(session({
    name: 'SessionId', // Nombre de la cookie
    secret: process.env.SESSION_SECRET || 'secreto',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production', // Solo HTTPS en producción
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000 // 1 día
    }
}));
app.use('/api', apiRoutes);

// Ruta raíz
app.get('/', (req, res) => {
    res.send('API para STCHidalgo');
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