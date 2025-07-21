/**
 * Módulo de rutas de la API para gestionar concesiones y vehículos.
 * @module apiRoutes
 */
const express = require('express');
const router = express.Router();
const dbService = require('../services/dbService');
const loginService = require('../services/loginService');
// const poolUsers = require('../config/dbUsers'); // Asume que ya tienes poolUsers configurado

const { logRequest, authenticateApiKeyOrSession } = require('../middlewares/middlewares');
const fileUpload = require('express-fileupload');
const multer = require('multer');
const sql = require('mssql');
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 }, // Límite de 10MB
    fileFilter: (req, file, cb) => {
        const allowedMimes = ['image/jpeg', 'image/png'];
        if (allowedMimes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Solo se permiten imágenes JPG o PNG'), false);
        }
    }
});
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
        req.session.userName = result.user.name; // Guardar nombre completo para Inspector

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
 * Ruta para buscar concesiones solo por folio.
 * @name GET /concesion/folio
 * @function
 * @param {Object} req.query - Objeto con parámetros de consulta.
 * @param {string} req.query.folio - Folio de la concesión.
 * @returns {Object} Respuesta JSON con `data` (concesiones) y `returnValue`, o error 400/404/500.
 */
router.get('/concesion/folio', async (req, res) => {
    try {
        const { folio } = req.query;
        if (!folio) {
            return res.status(400).json({ error: 'Se requiere el folio' });
        }
        const result = await dbService.obtenerConcesionPorFolio(folio);
        if (!result.data) {
            return res.status(404).json({ message: 'No se encontraron concesiones', returnValue: result.returnValue });
        }
        return res.status(200).json(result);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error al buscar concesiones por folio' });
    }
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
        // Validación modificada: solo falla si faltan TODOS los parámetros
        if (!nombre && !paterno && !materno) {
            return res.status(400).json({
                error: 'Se requiere al menos uno de los siguientes parámetros: nombre, paterno o materno'
            });
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
 * Ruta para obtener el reporte de inspecciones realizadas entre dos fechas, con paginación y exportación.
 * @name GET /reporte/inspecciones
 * @function
 * @param {Object} req.query - Objeto con parámetros de consulta.
 * @param {string} req.query.fechaInicio - Fecha de inicio del rango (formato: DD/MM/YYYY).
 * @param {string} req.query.fechaFin - Fecha de fin del rango (formato: DD/MM/YYYY).
 * @param {string} [req.query.page=1] - Número de página (entero positivo, por defecto 1).
 * @param {string} [req.query.format=json] - Formato de salida (json, excel, pdf).
 * @param {string} [req.query.allPages=false] - Si es true, exporta todos los registros sin paginación.
 * @returns {Object} Respuesta JSON, archivo Excel o PDF según el formato solicitado.
 */
router.get('/reporte/inspecciones', async (req, res) => {
    await dbService.generarReporte(req, res);
});
/**
 * Ruta para generar un reporte de inspecciones realizadas entre dos fechas, con paginación y exportación, incluyendo un logo opcional.
 * @name POST /reporte/inspecciones
 * @function
 * @param {Object} req.body - Objeto con parámetros de la solicitud.
 * @param {string} req.body.fechaInicio - Fecha de inicio del rango (formato: DD/MM/YYYY).
 * @param {string} req.body.fechaFin - Fecha de fin del rango (formato: DD/MM/YYYY).
 * @param {number} [req.body.page=1] - Número de página (entero positivo, por defecto 1).
 * @param {string} [req.body.format=json] - Formato de salida (json, excel, pdf).
 * @param {boolean} [req.body.allPages=false] - Si es true, exporta todos los registros sin paginación.
 * @param {Object} [req.file] - Archivo de logo subido.
 * @returns {Object} Respuesta JSON, archivo Excel o PDF según el formato solicitado.
 * @throws {Object} Error con código de estado:
 * - 400: Si los parámetros `fechaInicio` o `fechaFin` no están en formato DD/MM/YYYY o faltan.
 * - 500: Si ocurre un error interno al generar el reporte.
 */
router.post('/reporte/inspecciones', upload.single('logo'), async (req, res) => {
    await dbService.generarReporte(req, res);
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
    console.log(req.body)
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
            folio
        } = req.body;

        // Validar campos requeridos
        if (!idConcesion || !idPropietario || !idTramite || !idVehiculo || !placa || !propietario) {
            return res.status(400).json({ error: 'Faltan campos requeridos' });
        }

        // Obtener IdUser y nombre completo desde la sesión
        const IdUser = req.session.userId || 0;
        const Inspector = req.session.userName || 'Desconocido';

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
router.post('/revista/imagen', upload.single('imagen'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No se proporcionó ninguna imagen' });
        }

        const { idRV, tipoImagen } = req.body;
        const imagen = req.file;

        // Validar tipo de imagen
        if (!tipoImagen || !['1', '2', '3', '4', '5', '6'].includes(tipoImagen)) {
            return res.status(400).json({ error: 'Tipo de imagen inválido. Debe ser 1, 2, 3, 4, 5 o 6' });
        }

        // Validar idRV
        if (!idRV || isNaN(parseInt(idRV))) {
            return res.status(400).json({ error: 'Se requiere un ID de inspección (idRV) válido' });
        }

        // Verificar si idRV existe en la base de datos
        const pool = await require('../config/db');
        const exists = await pool.request()
            .input('idRV', sql.BigInt, parseInt(idRV))
            .query('SELECT 1 FROM [dbo].[RevistaVehicular] WHERE IdRevistaVehicular = @idRV');
        if (exists.recordset.length === 0) {
            return res.status(404).json({ error: 'Inspección no encontrada' });
        }

        // Preparar objeto imagen para dbService
        const imagenObj = {
            data: imagen.buffer,
            mimetype: imagen.mimetype,
            name: imagen.originalname
        };

        const result = await dbService.guardarImagenRevista(idRV, tipoImagen, imagenObj);

        res.json({ success: true, message: 'Imagen subida correctamente' });
    } catch (err) {
        console.error('Error en /revista/imagen:', err);
        if (err.message.includes('Solo se permiten imágenes JPG o PNG')) {
            return res.status(400).json({ error: err.message });
        }
        if (err.message.includes('Inspección no encontrada')) {
            return res.status(404).json({ error: err.message });
        }
        res.status(500).json({ error: 'Error interno al procesar la imagen' });
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
/**
 * Ruta para eliminar una imagen asociada a una inspección vehicular.
 * @name DELETE /revista/imagen/:idImagen
 * @function
 * @param {Object} req.params - Parámetros de ruta.
 * @param {string} req.params.idImagen - ID de la imagen a eliminar.
 * @returns {Object} Respuesta JSON con `success` y `message`, o error 400/404/500.
 */
router.delete('/revista/imagen/:idImagen', async (req, res) => {
    try {
        const { idImagen } = req.params;

        // Validar idImagen
        if (!idImagen || isNaN(parseInt(idImagen))) {
            return res.status(400).json({ error: 'Se requiere un ID de imagen válido' });
        }

        // Verificar si la imagen existe
        const pool = await require('../config/db');
        const exists = await pool.request()
            .input('IdImagenRevistaVehicular', sql.BigInt, parseInt(idImagen))
            .query('SELECT 1 FROM RevistaVehicular.Imagen WHERE IdImagenRevistaVehicular = @IdImagenRevistaVehicular');
        if (exists.recordset.length === 0) {
            return res.status(404).json({ error: 'Imagen no encontrada' });
        }

        const result = await dbService.eliminarImagenRevista(idImagen);

        res.json({ success: true, message: 'Imagen eliminada correctamente' });
    } catch (err) {
        console.error('Error en /revista/imagen/:idImagen:', err);
        if (err.message.includes('Imagen no encontrada')) {
            return res.status(404).json({ error: err.message });
        }
        res.status(500).json({ error: 'Error interno al eliminar la imagen' });
    }
});
/**
 * Ruta para obtener la lista de clases de vehículos.
 * @name GET /vehiculo/clases
 * @function
 * @returns {Object} Respuesta JSON con `data` (lista de clases) y `returnValue`.
 */
router.get('/vehiculo/clases', async (req, res) => {
    try {
        const result = await dbService.obtenerClasesVehiculo();
        res.json({
            data: result.data,
            returnValue: result.returnValue
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error al obtener clases de vehículos' });
    }
});

/**
 * Ruta para obtener la lista de tipos de vehículos.
 * @name GET /vehiculo/tipos
 * @function
 * @returns {Object} Respuesta JSON con `data` (lista de tipos) y `returnValue`.
 */
router.get('/vehiculo/tipos', async (req, res) => {
    try {
        const result = await dbService.obtenerTiposVehiculo();
        res.json({
            data: result.data,
            returnValue: result.returnValue
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error al obtener tipos de vehículos' });
    }
});

/**
 * Ruta para obtener la lista de categorías de vehículos por ID de clase.
 * @name GET /vehiculo/categorias
 * @function
 * @param {Object} req.query - Parámetros de consulta.
 * @param {string} req.query.idClase - ID de la clase del vehículo.
 * @returns {Object} Respuesta JSON con `data` (lista de categorías) y `returnValue`.
 */
router.get('/vehiculo/categorias', async (req, res) => {
    try {
        const { idClase } = req.query;
        const idClaseInt = parseInt(idClase);
        if (isNaN(idClaseInt)) {
            return res.status(400).json({ error: 'ID de clase inválido' });
        }
        const result = await dbService.obtenerCategoriasVehiculo(idClaseInt);
        res.json({
            data: result.data,
            returnValue: result.returnValue
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error al obtener categorías de vehículos' });
    }
});

/**
 * Ruta para obtener la lista de marcas de vehículos por clave de categoría.
 * @name GET /vehiculo/marcas
 * @function
 * @param {Object} req.query - Parámetros de consulta.
 * @param {string} req.query.claveCategoria - Clave de la categoría del vehículo.
 * @returns {Object} Respuesta JSON con `data` (lista de marcas) y `returnValue`.
 */
router.get('/vehiculo/marcas', async (req, res) => {
    try {
        const { claveCategoria } = req.query;
        if (!claveCategoria) {
            return res.status(400).json({ error: 'Clave de categoría requerida' });
        }
        const result = await dbService.obtenerMarcasVehiculo(claveCategoria);
        res.json({
            data: result.data,
            returnValue: result.returnValue
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error al obtener marcas de vehículos' });
    }
});

/**
 * Ruta para obtener la lista de submarcas por marca y categoría.
 * @name GET /vehiculo/submarcas
 * @function
 * @param {Object} req.query - Parámetros de consulta.
 * @param {string} req.query.idMarca - ID de la marca del vehículo.
 * @param {string} req.query.idCategoria - ID de la categoría del vehículo.
 * @returns {Object} Respuesta JSON con `data` (lista de submarcas) y `returnValue`.
 */
router.get('/vehiculo/submarcas', async (req, res) => {
    try {
        const { idMarca, idCategoria } = req.query;
        const idMarcaInt = parseInt(idMarca);
        const idCategoriaInt = parseInt(idCategoria);
        if (isNaN(idMarcaInt) || isNaN(idCategoriaInt)) {
            return res.status(400).json({ error: 'ID de marca o categoría inválido' });
        }
        const result = await dbService.obtenerSubmarcasPorMarcaCategoria(idMarcaInt, idCategoriaInt);
        res.json({
            data: result.data,
            returnValue: result.returnValue
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error al obtener submarcas de vehículos' });
    }
});

/**
 * Ruta para obtener la lista de versiones por clase y submarca.
 * @name GET /vehiculo/versiones
 * @function
 * @param {Object} req.query - Parámetros de consulta.
 * @param {string} req.query.idClase - ID de la clase del vehículo.
 * @param {string} req.query.idSubMarca - ID de la submarca del vehículo.
 * @returns {Object} Respuesta JSON con `data` (lista de versiones) y `returnValue`.
 */
router.get('/vehiculo/versiones', async (req, res) => {
    try {
        const { idClase, idSubMarca } = req.query;
        const idClaseInt = parseInt(idClase);
        const idSubMarcaInt = parseInt(idSubMarca);
        if (isNaN(idClaseInt) || isNaN(idSubMarcaInt)) {
            return res.status(400).json({ error: 'ID de clase o submarca inválido' });
        }
        const result = await dbService.obtenerVersionesPorClaseSubmarca(idClaseInt, idSubMarcaInt);
        res.json({
            data: result.data,
            returnValue: result.returnValue
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error al obtener versiones de vehículos' });
    }
});


/**
 * Ruta para modificar los datos del vehículo y la aseguradora de una concesión.
 * @name PUT /concesion/:idConcesion/vehiculo/:idVehiculo
 * @function
 * @param {Object} req.params - Parámetros de ruta.
 * @param {string} req.params.idConcesion - ID de la concesión.
 * @param {string} req.params.idVehiculo - ID del vehículo.
 * @param {Object} req.body.vehiculoData - Datos del vehículo.
 * @param {Object} req.body.seguroData - Datos de la aseguradora.
 * @returns {Object} Respuesta JSON con `idVehiculo` y `returnValue`, o error 400/500.
 */
// router.put('/concesion/:idConcesion/vehiculo/:idVehiculo', async (req, res) => {
//     try {
//         const { idConcesion, idVehiculo } = req.params;
//         const { vehiculoData, seguroData } = req.body;
//         // Mostrar lo que llega al endpoint
//         console.log("🔵 Datos recibidos en la petición:");
//         console.log("🟡 vehiculoData:", JSON.stringify(vehiculoData, null, 2));
//         console.log("🟡 seguroData:", JSON.stringify(seguroData, null, 2));

//         const idConcesionInt = parseInt(idConcesion);
//         const idVehiculoInt = parseInt(idVehiculo);

//         if (isNaN(idConcesionInt) || isNaN(idVehiculoInt)) {
//             return res.status(400).json({ error: 'ID de concesión o vehículo inválido' });
//         }

//         const errores = [];

//         // Modificamos validarCampo para aceptar campos opcionales
//         const validarCampo = (obj, campo, tipoEsperado, origen = 'vehiculoData', esOpcional = false) => {
//             const valor = obj[campo];
//             const tipoReal = typeof valor;

//             // Si el campo es opcional y está ausente (null, undefined, o cadena vacía)
//             if (esOpcional && (valor === null || valor === undefined || valor === '')) {
//                 console.log(`❕ Campo "${campo}" en ${origen} es opcional y no está presente.`);
//                 return; // No se agrega error, el campo es opcional
//             }

//             // Si el campo es requerido y está ausente (null, undefined, o cadena vacía)
//             if (!esOpcional && (valor === null || valor === undefined || valor === '')) {
//                 console.error(`❌ Campo "${campo}" en ${origen} está vacío o es nulo/indefinido (campo requerido).`);
//                 errores.push(`Campo "${campo}" está vacío o es nulo.`);
//                 return;
//             }

//             const valido = tipoEsperado === 'number'
//                 ? (tipoReal === 'number' || tipoReal === 'bigint') && !isNaN(valor)
//                 : tipoReal === tipoEsperado;

//             console.log(`✅ Campo "${campo}" en ${origen} — Esperado: ${tipoEsperado}, Recibido: ${tipoReal}, Valor: ${valor}`);

//             if (!valido) {
//                 console.error(`❌ Tipo incorrecto para "${campo}" en ${origen}. Esperado: ${tipoEsperado}, Recibido: ${tipoReal}`);
//                 errores.push(`Campo "${campo}" tiene tipo incorrecto.`);
//             }
//         };

//         // Definir los campos del vehículo y sus tipos esperados
//         const camposVehiculo = {
//             Anio: 'number',
//             NumeroPasajeros: 'number',
//             Capacidad: 'string',
//             Cilindros: 'number', // Mantener aquí, pero se pasará 'esOpcional: true'
//             Clase: 'string',
//             ClaveVehicular: 'string',
//             Color: 'string',
//             Combustible: 'string',
//             IdVersion: 'number',
//             Marca: 'string',
//             NRPV: 'string',
//             NumeroMotor: 'string',
//             NumeroPuertas: 'number',
//             NumeroSerie: 'string',
//             Origen: 'string',
//             PlacaAnterior: 'string',
//             PlacaAsignada: 'string',
//             RFV: 'string',
//             Submarca: 'string',
//             Tipo: 'string',
//             Uso: 'string',
//             Version: 'string',
//             IdTipoPlaca: 'number',
//             NumeroToneladas: 'string',
//             IdEstatus: 'number',
//             // Si 'servicio' y 'idPropietario' son campos reales que esperas, agrégalos aquí con su tipo.
//             // servicio: 'string', 
//             // idPropietario: 'number',
//         };

//         // Lista de campos opcionales para vehiculoData
//         const camposOpcionalesVehiculo = [
//             'Cilindros',
//             'Color',
//             'Combustible',
//             'NRPV',
//             'Origen',
//             'RFV',
//             'Submarca',
//             'Uso',
//             'Version',
//             'NumeroToneladas',
//             // 'servicio', // Descomentar si realmente es un campo esperado y opcional
//             // 'idPropietario' // Descomentar si realmente es un campo esperado y opcional
//         ];

//         for (const campo in camposVehiculo) {
//             const esOpcional = camposOpcionalesVehiculo.includes(campo);
//             validarCampo(vehiculoData, campo, camposVehiculo[campo], 'vehiculoData', esOpcional);
//         }

//         // Validar seguroData
//         const camposSeguro = {
//             nombre: 'string',
//             numeroPoliza: 'string',
//             fechaExp: 'string', // asumimos formato ISO
//             fechaVence: 'string',
//             folioPago: 'string',
//             observaciones: 'string',
//         };

//         // Lista de campos opcionales para seguroData
//         const camposOpcionalesSeguro = [
//             'observaciones'
//         ];

//         for (const campo in camposSeguro) {
//             const esOpcional = camposOpcionalesSeguro.includes(campo);
//             validarCampo(seguroData, campo, camposSeguro[campo], 'seguroData', esOpcional);
//         }

//         if (errores.length > 0) {
//             return res.status(400).json({
//                 error: 'Validación fallida. Algunos campos no cumplen el formato esperado o son requeridos y están vacíos.',
//                 detalles: errores
//             });
//         }

//         // Obtener datos de usuario
//         const poolUsers = await require('../config/dbUsers');
//         const userRequest = poolUsers.request();
//         userRequest.input('UserID', sql.Int, req.session.userId || 0);
//         const userResult = await userRequest.query(`
//             SELECT 
//                 p.ProfileID,
//                 COALESCE(sc.SmartCardID, 0) AS SmartCardID,
//                 COALESCE(ud.DelegationID, 0) AS DelegationID
//             FROM [dbo].[mUsers] u
//             LEFT JOIN [dbo].[dUserProfiles] p ON u.UserID = p.UserID
//             LEFT JOIN [dbo].[mSmartCards] sc ON u.UserID = sc.UserID
//             LEFT JOIN [dbo].[UserDelegations] ud ON u.UserID = ud.UserID
//             WHERE u.UserID = @UserID
//         `);
//         const userData = userResult.recordset[0] || {};

//         seguroData.idConcesion = idConcesionInt;
//         seguroData.idVehiculo = idVehiculoInt;
//         seguroData.idUsuario = req.session.userId || 0;
//         seguroData.idPerfil = userData.ProfileID || 0;
//         seguroData.idSmartCard = userData.SmartCardID || 0;
//         seguroData.idDelegacion = userData.DelegationID || 0;

//         // --- INICIO DE LA MODIFICACIÓN CLAVE PARA ENVIAR UN 0 EN LUGAR DE NULL ---
//         // Limpiar y preparar los campos de vehiculoData que son opcionales
//         // Si 'Cilindros' no está presente, es null, o no es un número válido,
//         // lo forzamos a 0. Esto evita el error de "parameter not supplied" si
//         // el SP no está configurado para aceptar NULLs explícitamente.
//         if (vehiculoData.Cilindros === undefined || vehiculoData.Cilindros === null || isNaN(vehiculoData.Cilindros) || vehiculoData.Cilindros === '') {
//             vehiculoData.Cilindros = 0; // Forzar a 0 en lugar de null
//         } else {
//             vehiculoData.Cilindros = parseInt(vehiculoData.Cilindros); // Asegurarse de que sea un número si no es 0
//         }
        
//         // Limpiar otros campos de vehiculoData que son opcionales y vienen vacíos o nulos
//         camposOpcionalesVehiculo.forEach(campo => {
//             // Asegurarse de no sobrescribir la lógica de Cilindros que ya se manejó
//             if (campo !== 'Cilindros' && vehiculoData.hasOwnProperty(campo) && vehiculoData[campo] === '') {
//                 vehiculoData[campo] = null; // Convertir cadena vacía a null para otros campos
//             }
//         });

//         // Limpiar campos de seguroData que son opcionales y vienen vacíos o nulos
//         camposOpcionalesSeguro.forEach(campo => {
//             if (seguroData.hasOwnProperty(campo) && seguroData[campo] === '') {
//                 seguroData[campo] = null;
//             }
//         });
//         // --- FIN DE LA MODIFICACIÓN CLAVE ---

//         const result = await dbService.modificarVehiculoYAseguradora(vehiculoData, seguroData);

//         res.json({
//             idVehiculo: result.idVehiculo,
//             returnValue: result.returnValue,
//             message: 'Vehículo y aseguradora modificados correctamente'
//         });
//     } catch (err) {
//         console.error('❌ Error en la ruta PUT /concesion/:idConcesion/vehiculo/:idVehiculo:', err);
//         res.status(500).json({ error: err.message || 'Error al modificar vehículo y aseguradora' });
//     }
// });

router.put('/concesion/:idConcesion/vehiculo/:idVehiculo', async (req, res) => {
    try {
        console.log('🔵 Iniciando modificación de vehículo');
        const { idConcesion, idVehiculo } = req.params;
        const { vehiculoData, seguroData } = req.body;

        console.log('📌 Parámetros recibidos:', { idConcesion, idVehiculo });
        console.log('🚗 Datos del vehículo recibidos:', JSON.stringify(vehiculoData, null, 2));
        console.log('🛡️ Datos del seguro recibidos:', JSON.stringify(seguroData, null, 2));

        // Validar IDs
        const idConcesionInt = parseInt(idConcesion);
        const idVehiculoInt = parseInt(idVehiculo);
        if (isNaN(idConcesionInt) || isNaN(idVehiculoInt)) {
            console.error('❌ IDs inválidos:', { idConcesion, idVehiculo });
            return res.status(400).json({ error: 'ID de concesión o vehículo inválido' });
        }

        console.log('🔍 Obteniendo datos de usuario...');
        // Obtener datos de usuario, perfil, smartcard y delegación
        const poolUsers = await require('../config/dbUsers');
        const userRequest = poolUsers.request();
        userRequest.input('UserID', sql.Int, req.session.userId || 0);
        const userResult = await userRequest.query(`
            SELECT 
                u.UserID,
                p.ProfileID,
                COALESCE(sc.SmartCardID, 0) AS SmartCardID,
                COALESCE(ud.DelegationID, 0) AS DelegationID
            FROM [dbo].[mUsers] u
            LEFT JOIN [dbo].[dUserProfiles] p ON u.UserID = p.UserID
            LEFT JOIN [dbo].[mSmartCards] sc ON u.UserID = sc.UserID
            LEFT JOIN [dbo].[UserDelegations] ud ON u.UserID = ud.UserID
            WHERE u.UserID = @UserID
        `);
        const userData = userResult.recordset[0] || {};
<<<<<<< HEAD
        console.log('👤 Datos de usuario obtenidos:', userData);

=======
>>>>>>> 806dd7cf6f0fbe56e8027c3e145b141e4c6d89f5
        // Agregar datos de usuario a seguroData
        seguroData.idConcesion = idConcesionInt;

        console.log('🛡️ Datos del seguro actualizados:', JSON.stringify(seguroData, null, 2));

        console.log('🔄 Ejecutando modificación en la base de datos...');
        // Ejecutar la modificación
<<<<<<< HEAD
        const result = await dbService.modificarVehiculoYAseguradora(vehiculoData, seguroData);
        
        console.log('✅ Resultado de la modificación:', result);
=======
        const result = await dbService.modificarVehiculoYAseguradora(vehiculoData, seguroData, userData);
>>>>>>> 806dd7cf6f0fbe56e8027c3e145b141e4c6d89f5
        res.json({
            idVehiculo: result.idVehiculo,
            returnValue: result.returnValue,
            message: 'Vehículo y aseguradora modificados correctamente'
        });
    } catch (err) {
        console.error('❌ Error en el endpoint:', err);
        res.status(500).json({ 
            error: 'Error al modificar vehículo y aseguradora',
            details: err.message 
        });
    }
});


/**
 * Ruta para registrar la impresión de una revista vehicular usando el procedimiento RV_ImprimirRevista.
 * @name POST /revista/imprimir
 * @function
 * @param {Object} req.body - Cuerpo de la solicitud con `idRV` y `folio` (opcional).
 * @returns {Object} Respuesta JSON con `success` y `message`, o error 400/401/500.
 */
router.post('/revista/imprimir', async (req, res) => {
    try {
        const { idRV, folio = '' } = req.body;
        const idUsuario = req.session.userId || 0;

        // Validar idRV
        if (!idRV || isNaN(parseInt(idRV))) {
            return res.status(400).json({ error: 'Se requiere un ID de inspección (idRV) válido' });
        }
        const result = await dbService.imprimirRevista(idRV, idUsuario, folio);

        res.json({ success: true, message: 'Impresión registrada correctamente' });
    } catch (err) {
        console.error('Error en /revista/imprimir:', err);
        res.status(500).json({ error: 'Error interno al registrar la impresión' });
    }
});
/**
 * Ruta para buscar revistas vehiculares según criterios específicos.
 * @name GET /revista/buscar
 * @function
 * @param {Object} req.query - Parámetros de consulta:
 * @param {number} [req.query.noConcesion] - Número de concesión para filtrar revistas (opcional).
 * @param {string} [req.query.placa] - Placa del vehículo para filtrar revistas (opcional).
 * @param {number} [req.query.estatus] - ID del estatus de la revista (opcional).
 * @param {string} [req.query.fechaInicio] - Fecha de inicio en formato DD/MM/YYYY (opcional).
 * @param {string} [req.query.fechaFin] - Fecha de fin en formato DD/MM/YYYY (opcional).
 * @param {number} [req.query.page=1] - Número de página para paginación.
 * @param {number} [req.query.pageSize=10] - Cantidad de registros por página.
 * @returns {Object} Respuesta JSON con los resultados de la búsqueda:
 * - `data`: Array de revistas vehiculares con sus detalles y el campo `Estatus` enriquecido.
 * - `totalRecords`: Número total de registros devueltos.
 * - `page`: Página actual.
 * - `pageSize`: Tamaño de la página.
 * - `returnValue`: Valor de retorno (0 para éxito).
 * @throws {Object} Error con código de estado:
 * - 400: Si las fechas no están en formato DD/MM/YYYY.
 * - 404: Si no se encuentran revistas vehiculares.
 * - 500: Si ocurre un error interno al buscar revistas.
 */
router.get('/revista/buscar', async (req, res) => {
    try {
        const { noConcesion, placa, estatus, fechaInicio, fechaFin, page = 1, pageSize = 10 } = req.query;

        // Validar fechas
        const dateRegex = /^(0[1-9]|[12]\d|3[01])\/(0[1-9]|1[0-2])\/\d{4}$/;
        if ((fechaInicio && !dateRegex.test(fechaInicio)) || (fechaFin && !dateRegex.test(fechaFin))) {
            return res.status(400).json({ error: 'Las fechas deben estar en formato DD/MM/YYYY' });
        }

        const result = await dbService.buscarRevistasVehiculares(
            noConcesion || null,
            placa || null,
            estatus || null,
            fechaInicio ? `${fechaInicio.split('/')[1]}/${fechaInicio.split('/')[0]}/${fechaInicio.split('/')[2]}` : null,
            fechaFin ? `${fechaFin.split('/')[1]}/${fechaFin.split('/')[0]}/${fechaFin.split('/')[2]}` : null,
            parseInt(page),
            parseInt(pageSize)
        );

        if (!result.data || result.data.length === 0) {
            return res.status(404).json({ message: 'No se encontraron revistas vehiculares', returnValue: result.returnValue });
        }
        // Mostrar la respuesta en consola
        console.log('Respuesta de /revista/buscar:', JSON.stringify(result, null, 2));
        res.json(result);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error al buscar revistas vehiculares' });
    }
});
/**        
 * Ruta para obtener los detalles de una inspección vehicular por su ID.
 * @name GET /revista/:idRV
 * @function
 * @param {Object} req.params - Parámetros de ruta.
 * @param {string} req.params.idRV - ID de la inspección vehicular.
 * @returns {Object} Respuesta JSON con `data` (detalles de la inspección) y `returnValue`, o error 400/404/500.
 */
router.get('/revista/:idRV', async (req, res) => {
    try {
        const { idRV } = req.params;

        // Validar idRV
        if (!idRV || isNaN(parseInt(idRV))) {
            return res.status(400).json({ error: 'Se requiere un ID de inspección (idRV) válido' });
        }

        const result = await dbService.obtenerRevistaPorId(idRV);
        if (!result.data) {
            return res.status(404).json({ message: 'Inspección no encontrada', returnValue: result.returnValue });
        }

        res.json(result);
    } catch (err) {
        console.error('Error en /revista/:idRV:', err);
        res.status(500).json({ error: 'Error al obtener la inspección' });
    }
});
module.exports = router;