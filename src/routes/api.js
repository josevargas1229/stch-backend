const express = require('express');
const router = express.Router();
const dbService = require('../services/dbService');


router.get('/concesion/autorizacion/:id', async (req, res) => {
    try {
        const result = await dbService.obtenerConcesionPorId(req.params.id);
        if (!result.data) {
            return res.status(404).json({ message: 'Concesión no encontrada', returnValue: result.returnValue });
        }
        res.json(result);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error al obtener la concesión' });
    }
});

router.get('/concesion/:id', async (req, res) => {
    try {
        const result = await dbService.obtenerInformacionCompletaPorConcesion(req.params.id);
        if (result.message) {
            return res.status(404).json(result);
        }
        res.json(result);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error al obtener la información de la concesión' });
    }
});

// Placeholder para otras búsquedas (por expediente, titular, etc.)
router.get('/concesion/expediente/:expediente', async (req, res) => {
    // Implementar cuando tengas el procedimiento almacenado
    res.status(501).json({ message: 'Búsqueda por expediente no implementada' });
});

router.get('/concesion/titular', async (req, res) => {
    // Implementar cuando tengas el procedimiento almacenado
    res.status(501).json({ message: 'Búsqueda por titular no implementada' });
});

module.exports = router;