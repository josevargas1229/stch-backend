const express = require('express');
require('dotenv').config();
const poolPromise = require('../config/db');
const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(express.json());

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