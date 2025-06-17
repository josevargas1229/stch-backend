/**
 * Módulo de rutas de la API para gestionar concesiones y vehículos.
 * @module apiRoutes
 */
const express = require('express');
const router = express.Router();
const dbService = require('../services/dbService');
const loginService = require('../services/loginService');
const { logRequest, authenticateApiKeyOrSession } = require('../middlewares/middlewares');
const fileUpload = require('express-fileupload');

router.use(fileUpload()); // Middleware para manejar subida de archivos
router.use(logRequest);
/**
 * Ruta para autenticar un usuario y establecer una sesión.
 * @name POST /auth/login
 * @function
 * @param {Object} req.body - Cuerpo de la solicitud.
 * @param {string} req.body.username - Nombre de usuario.
 * @param {string} req.body.password - Contraseña del usuario.
 * @returns {Object} Respuesta JSON con `user`, `apiKey` y `returnValue`.
 */
router.post('/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({ error: 'Se requieren username y password' });
        }

        const result = await loginService.loginUser(username, password);
        
        // Establecer sesión
        req.session.userId = result.user.id;
        
        res.json(result);
    } catch (err) {
        console.error(err);
        res.status(401).json({ 
            error: err.message.includes('Usuario no encontrado') || err.message.includes('Contraseña incorrecta') 
                ? err.message 
                : 'Error al autenticar usuario' 
        });
    }
});

/**
 * Aplicar autenticación a todas las rutas excepto /auth/login.
 */
router.use((req, res, next) => {
    if (req.path === '/auth/login' && req.method === 'POST') {
        return next();
    }
    return authenticateApiKeyOrSession(req, res, next);
});

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
        return res.status(200).json(result);
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
 * Ruta para obtener los datos del vehículo y la aseguradora por ID de concesión e ID de vehículo
 * @name GET /concesion/:idConcesion/vehiculo/:idVehiculo
 * @function
 * @param {Object} req.params - Parámetros de ruta.
 * @param {string} req.params.idConcesion - ID de la concesión.
 * @param {string} req.params.idVehiculo - ID del vehículo.
 * @returns {Object} Respuesta JSON con datos del vehículo y aseguradora, o error 400/404/500.
 */
router.get('/concesion/:idConcesion/vehiculo/:idVehiculo', async (req, res) => {
    try {
        const idConcesion = parseInt(req.params.idConcesion);
        const idVehiculo = parseInt(req.params.idVehiculo);

        if (isNaN(idConcesion) || isNaN(idVehiculo)) {
            return res.status(400).json({ error: 'ID de concesión o vehículo inválido' });
        }

        const result = await dbService.obtenerVehiculoYAseguradora(idConcesion, idVehiculo);
        if (result.message) {
            return res.status(404).json(result);
        }
        res.json(result);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error al obtener vehículo y aseguradora' });
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

/**
 * Ruta para obtener los tipos de trámite disponibles para la inspección vehicular.
 * @name GET /revista/tipos-tramite
 * @function
 * @returns {Object} Respuesta JSON con `data` (tipos de trámite) y `returnValue`, o error 500.
 */
router.get('/revista/tipos-tramite', async (req, res) => {
    try {
        const result = await dbService.obtenerTiposTramite();
        res.json(result);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error al obtener los tipos de trámite' });
    }
});

/**
 * Ruta para obtener los tipos de imagen disponibles para la inspección vehicular.
 * @name GET /revista/tipos-imagen
 * @function
 * @returns {Object} Respuesta JSON con `data` (tipos de imagen) y `returnValue`, o error 500.
 */
router.get('/revista/tipos-imagen', async (req, res) => {
    try {
        const result = await dbService.obtenerTiposImagen();
        res.json(result);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error al obtener los tipos de imagen' });
    }
});

/**
 * Ruta para guardar una inspección vehicular.
 * @name POST /revista
 * @function
 * @param {Object} req.body - Cuerpo de la solicitud con los datos de la inspección.
 * @returns {Object} Respuesta JSON con `idRV` (ID de la inspección) y `success`, o error 400/500.
 */
router.post('/revista', async (req, res) => {
    try {
        const {
            idConcesion,
            idPropietario,
            idTramite,
            idVehiculo,
            placa,
            propietario,
            placaDelanteraVer,
            placaTraseraVer,
            calcaVerificacionVer,
            calcaTenenciaVer,
            pinturaCarroceriaVer,
            estadoLlantasVer,
            defensasVer,
            vidriosVer,
            limpiadoresVer,
            espejosVer,
            llantaRefaccionVer,
            parabrisasMedallonVer,
            claxonVer,
            luzBajaVer,
            luzAltaVer,
            cuartosVer,
            direccionalesVer,
            intermitentesVer,
            stopVer,
            timbreVer,
            estinguidorVer,
            herramientasVer,
            sistemaFrenadoVer,
            sistemaDireccionVer,
            sistemaSuspensionVer,
            interioresVer,
            botiquinVer,
            cinturonSeguridadVer,
            observaciones,
            aprobado,
            imagenCromaticaVer,
            folio,
            Inspector
        } = req.body;

        // Validar campos requeridos
        if (!idConcesion || !idPropietario || !idTramite || !idVehiculo || !placa || !propietario) {
            return res.status(400).json({ error: 'Faltan campos requeridos' });
        }

        // Obtener IdUser desde la sesión
        const IdUser = req.session.userId || 0;

        const result = await dbService.insertarRevista({
            idConcesion,
            idPropietario,
            idTramite,
            idVehiculo,
            placa,
            propietario,
            placaDelanteraVer,
            placaTraseraVer,
            calcaVerificacionVer,
            calcaTenenciaVer,
            pinturaCarroceriaVer,
            estadoLlantasVer,
            defensasVer,
            vidriosVer,
            limpiadoresVer,
            espejosVer,
            llantaRefaccionVer,
            parabrisasMedallonVer,
            claxonVer,
            luzBajaVer,
            luzAltaVer,
            cuartosVer,
            direccionalesVer,
            intermitentesVer,
            stopVer,
            timbreVer,
            estinguidorVer,
            herramientasVer,
            sistemaFrenadoVer,
            sistemaDireccionVer,
            sistemaSuspensionVer,
            interioresVer,
            botiquinVer,
            cinturonSeguridadVer,
            observaciones,
            aprobado,
            imagenCromaticaVer,
            folio,
            IdUser,
            Inspector
        });

        res.json({ success: true, idRV: result.idRV });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error al guardar la inspección' });
    }
});

/**
 * Ruta para subir una imagen asociada a una inspección vehicular.
 * @name POST /revista/imagen
 * @function
 * @param {Object} req.files - Objeto con el archivo subido (imagen).
 * @param {Object} req.body - Cuerpo de la solicitud con `idRV` y `tipoImagen`.
 * @returns {Object} Respuesta JSON con `success` y mensaje, o error 400/500.
 */
router.post('/revista/imagen', async (req, res) => {
    try {
        if (!req.files || !req.files.imagen) {
            return res.status(400).json({ error: 'No se proporcionó ninguna imagen' });
        }

        const { idRV, tipoImagen } = req.body;
        const imagen = req.files.imagen;

        // Validar tipo de imagen
        if (!tipoImagen || !['1', '2', '3', '4', '5', '6'].includes(tipoImagen)) {
            return res.status(400).json({ error: 'Tipo de imagen inválido' });
        }

        // Validar formato de imagen
        if (!imagen.mimetype.includes('image/jpeg')) {
            return res.status(400).json({ error: 'Solo se permiten imágenes JPG' });
        }

        // Validar idRV
        if (!idRV) {
            return res.status(400).json({ error: 'Se requiere el ID de la inspección (idRV)' });
        }

        const result = await dbService.guardarImagenRevista(idRV, tipoImagen, imagen);

        res.json({ success: true, message: 'Imagen subida correctamente' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error al subir la imagen' });
    }
});

/**
 * Ruta para obtener las imágenes asociadas a una inspección vehicular.
 * @name GET /revista/:idRV/imagenes
 * @function
 * @param {Object} req.params - Objeto con parámetros de ruta.
 * @param {string} req.params.idRV - ID de la inspección.
 * @param {Object} req.query - Objeto con parámetros de consulta.
 * @param {string} [req.query.tipoImagen] - Tipo de imagen (opcional, filtra por tipo).
 * @returns {Object} Respuesta JSON con `data` (imágenes en base64 o rutas) y `returnValue`, o error 404/500.
 */
router.get('/revista/:idRV/imagenes', async (req, res) => {
    try {
        const { idRV } = req.params;
        const { tipoImagen } = req.query; // Opcional: filtrar por tipo de imagen
        const result = await dbService.obtenerImagenesRevista(idRV, tipoImagen);
        if (!result.data || result.data.length === 0) {
            return res.status(404).json({ message: 'No se encontraron imágenes para esta inspección' });
        }
        res.json(result);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error al obtener las imágenes' });
    }
});

module.exports = router;