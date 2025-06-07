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

router.get('/concesion/titular', async (req, res) => {
    try {
        const { nombre, paterno, materno, page = 1, pageSize = 15 } = req.query;
        if (!nombre && !paterno && !materno) {
            return res.status(400).json({ error: 'Se requiere al menos nombre, paterno o materno' });
        }
        const result = await dbService.obtenerConcesionariosPorNombre(nombre, paterno, materno, parseInt(page), parseInt(pageSize));
        if (!result.data || result.data.length === 0) {
            return res.status(404).json({ message: 'No se encontraron concesionarios', returnValue: result.returnValue });
        }
        res.json(result);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error al buscar concesionarios por titular' });
    }
});

router.get('/concesion/concesionario/:idConcesionario', async (req, res) => {
    try {
        const result = await dbService.obtenerConcesionesPorConcesionario(req.params.idConcesionario);
        if (!result.data || result.data.length === 0) {
            return res.status(404).json({ message: 'No se encontraron concesiones para este concesionario', returnValue: result.returnValue });
        }
        res.json(result);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error al obtener concesiones por concesionario' });
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

router.get('/vehiculo/buscar', async (req, res) => {
    try {
        const { placa, numSerie, numMotor } = req.query;
        if (!placa && !numSerie && !numMotor) {
            return res.status(400).json({ error: 'Se requiere al menos placa, numSerie o numMotor' });
        }
        const result = await dbService.obtenerVehiculosPorPlacaNumSerie(placa, numSerie, numMotor);
        if (!result.data || result.data.length === 0) {
            return res.status(404).json({ message: 'No se encontraron vehículos', returnValue: result.returnValue });
        }
        res.json(result);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error al buscar vehículos' });
    }
});

module.exports = router;