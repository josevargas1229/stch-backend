const express = require('express');
const router = express.Router();
const dbService = require('../services/dbService');

router.get('/concesion/expediente', async (req, res) => {
    try {
        const { seriePlaca, folio } = req.query;
        if (!seriePlaca && !folio) {
            return res.status(400).json({ error: 'Se requiere al menos seriePlaca o folio' });
        }
        const result = await dbService.obtenerConcesionPorFolioPlaca(seriePlaca, folio);
        if (!result.data) {
            return res.status(404).json({ message: 'No se encontraron concesiones', returnValue: result.returnValue });
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error al buscar concesiones' });
    }
});

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
// Placeholder para búsqueda por titular
router.get('/concesion/titular', async (req, res) => {
    res.status(501).json({ message: 'Búsqueda por titular no implementada' });
});

module.exports = router;