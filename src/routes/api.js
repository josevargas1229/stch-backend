/**
 * Módulo de rutas de la API para gestionar concesiones y vehículos.
 * @module apiRoutes
 */
const express = require('express');
const router = express.Router();
const dbService = require('../services/dbService');

/**
 * Ruta para buscar concesiones por expediente (folio y/o serie de la placa).
 * @name GET /concesion/expediente
 * @function
 * @param {Object} req.query - Objeto con parámetros de consulta.
 * @param {string} req.query.seriePlaca - Serie de la placa del vehículo.
 * @param {string} req.query.folio - Folio de la concesión.
 * @returns {Object} Respuesta JSON con `data` (concesiones) y `returnValue`, o error 400/404/500.
 */
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

/**
 * Ruta para obtener la información de una concesión por el número de autorización (Id)
 * @name GET /concesion/autorizacion/:id
 * @function
 * @param {Object} req.params - Objeto con parámetros de ruta.
 * @param {string} req.params.id - ID de la concesión.
 * @returns {Object} Respuesta JSON con detalles de la concesión, o error 404/500.
 */
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

/**
 * Ruta para buscar concesionarios por nombre con paginación.
 * @name GET /concesion/titular
 * @function
 * @param {Object} req.query - Objeto con parámetros de consulta.
 * @param {string} req.query.nombre - Nombre del concesionario.
 * @param {string} req.query.paterno - Apellido paterno.
 * @param {string} req.query.materno - Apellido materno.
 * @param {number} [req.query.page=1] - Número de página.
 * @param {number} [req.query.pageSize=15] - Tamaño de página.
 * @returns {Object} Respuesta JSON con `data` (concesionarios), `totalRecords`, `totalPages`, etc., o error 400/404/500.
 */
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

/**
 * Ruta para obtener concesiones asociadas a un concesionario.
 * @name GET /concesion/concesionario/:idConcesionario
 * @function
 * @param {Object} req.params - Objeto con parámetros de ruta.
 * @param {number} req.params.idConcesionario - ID del concesionario.
 * @returns {Object} Respuesta JSON con `data` (concesiones) y `returnValue`, o error 404/500.
 */
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

/**
 * Ruta para obtener la información completa de una concesión por su ID.
 * @name GET /concesion/:id
 * @function
 * @param {Object} req.params - Objeto con parámetros de ruta.
 * @param {string} req.params.id - ID de la concesión.
 * @returns {Object} Respuesta JSON con detalles de la concesión y relacionados, o error 404/500.
 */
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

/**
 * Ruta para buscar vehículos por placa, número de serie o número de motor.
 * @name GET /vehiculo/buscar
 * @function
 * @param {Object} req.query - Objeto con parámetros de consulta.
 * @param {string} req.query.placa - Placa del vehículo.
 * @param {string} req.query.numSerie - Número de serie del vehículo.
 * @param {string} req.query.numMotor - Número de motor del vehículo.
 * @returns {Object} Respuesta JSON con `data` (vehículos) y `returnValue`, o error 400/404/500.
 */

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

/**
 * Ruta para obtener el reporte de inspecciones realizadas entre dos fechas, con paginación.
 * @name GET /reporte/inspecciones
 * @function
 * @param {Object} req.query - Objeto con parámetros de consulta.
 * @param {string} req.query.fechaInicio - Fecha de inicio del rango (formato: DD/MM/YYYY).
 * @param {string} req.query.fechaFin - Fecha de fin del rango (formato: DD/MM/YYYY).
 * @param {string} [req.query.page=1] - Número de página (entero positivo, por defecto 1).
 * @returns {Object} Respuesta JSON con `data` (lista de inspecciones paginada), `page` (página actual), `totalRecords`, `totalPages`, y `returnValue`, o error 400/404/500.
 */
router.get('/reporte/inspecciones', async (req, res) => {
    try {
        const { fechaInicio, fechaFin, page = '1' } = req.query;

        // Validar que se proporcionen ambas fechas
        if (!fechaInicio || !fechaFin) {
            return res.status(400).json({ error: 'Se requieren fechaInicio y fechaFin' });
        }

        // Validar formato de fecha DD/MM/YYYY
        const dateRegex = /^(0[1-9]|[12]\d|3[01])\/(0[1-9]|1[0-2])\/\d{4}$/;
        if (!dateRegex.test(fechaInicio) || !dateRegex.test(fechaFin)) {
            return res.status(400).json({ error: 'Las fechas deben estar en formato DD/MM/YYYY' });
        }

        // Validar que page sea un entero positivo
        const pageNumber = parseInt(page, 10);
        if (isNaN(pageNumber) || pageNumber < 1) {
            return res.status(400).json({ error: 'El parámetro page debe ser un entero positivo' });
        }

        // Convertir fechas de DD/MM/YYYY a MM/DD/YYYY
        const convertDateFormat = (date) => {
            const [day, month, year] = date.split('/');
            return `${month}/${day}/${year}`;
        };
        const fechaInicioConverted = convertDateFormat(fechaInicio);
        const fechaFinConverted = convertDateFormat(fechaFin);

        const result = await dbService.obtenerReporteInspecciones(fechaInicioConverted, fechaFinConverted, pageNumber, 20);
        if (!result.data || result.data.length === 0) {
            return res.status(404).json({ 
                message: 'No se encontraron inspecciones', 
                totalRecords: 0, 
                totalPages: 0, 
                returnValue: result.returnValue 
            });
        }
        res.json(result);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error al obtener el reporte de inspecciones' });
    }
});

module.exports = router;