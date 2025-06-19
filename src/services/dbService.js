/**
 * Módulo de servicios para interactuar con las bases de datos de concesiones y vehículos.
 * @module dbService
 */
const poolPromise = require('../config/db');
const poolVehiclePromise = require('../config/dbVehicle');
const sql = require('mssql');
const ExcelJS = require('exceljs');
// Catálogos en memoria
let generoMap = new Map();
let nacionalidadMap = new Map();
let estatusMap = new Map();

/**
 * Inicializa los catálogos en memoria (género, nacionalidad, estatus del vehículo) al cargar el módulo.
 * @async
 * @function initializeCatalogs
 * @throws {Error} Si falla la consulta a la base de datos.
 */
async function initializeCatalogs() {
    try {
        const pool = await poolPromise;
        const generoResult = await pool.request().query('SELECT [IdGenero], [Genero] FROM [Catalogo].[Genero]');
        generoMap = new Map(generoResult.recordset.map(item => [item.IdGenero, item.Genero]));

        const nacionalidadResult = await pool.request().query('SELECT [IdNacionalidad], [Nacionalidad] FROM [Catalogo].[Nacionalidad]');
        nacionalidadMap = new Map(nacionalidadResult.recordset.map(item => [item.IdNacionalidad, item.Nacionalidad]));

        const poolVehicle = await poolVehiclePromise;
        const estatusResult = await poolVehicle.request().query('SELECT [IdEstatus], [Estatus] FROM [Vehiculo].[Estatus]');
        estatusMap = new Map(estatusResult.recordset.map(item => [item.IdEstatus, item.Estatus]));
    } catch (err) {
        console.error('Error al inicializar los catálogos:', err.message);
        throw err;
    }
}

// Llamar a initializeCatalogs al cargar el módulo
initializeCatalogs().catch(err => console.error('Fallo al inicializar catálogos:', err));

/**
 * Mapea un ID a su valor descriptivo en un catálogo dado.
 * @function mapCatalogValue
 * @param {number|string} id - El ID a mapear.
 * @param {Map} catalogMap - El mapa de catálogo (generoMap, nacionalidadMap o estatusMap).
 * @returns {string} El valor descriptivo o el ID original si no se encuentra.
 */
function mapCatalogValue(id, catalogMap) {
    return catalogMap.get(parseInt(id)) || id; // Devuelve el valor descriptivo o el ID si no se encuentra
}

/**
 * Obtiene los detalles de una concesión por su ID.
 * @async
 * @function obtenerConcesionPorId
 * @param {number} idConcesion - El ID de la concesión.
 * @returns {Promise<Object>} Objeto con `data` (detalles de la concesión) y `returnValue` (código de retorno).
 * @throws {Error} Si falla la ejecución del procedimiento.
 */
async function obtenerConcesionPorId(idConcesion) {
    try {
        const pool = await poolPromise;
        const request = pool.request();
        request.input('idConcesion', sql.Int, idConcesion);
        const result = await request.execute('ConcesionObtenerPorId');
        return {
            data: result.recordset[0] || null,
            returnValue: result.returnValue
        };
    } catch (err) {
        throw new Error(`Error al ejecutar ConcesionObtenerPorId: ${err.message}`);
    }
}

/**
 * Busca concesiones por folio y/o la serie de la placa.
 * @async
 * @function obtenerConcesionPorFolioPlaca
 * @param {string} seriePlaca - La serie de la placa del vehículo.
 * @param {string} folio - El folio de la concesión.
 * @returns {Promise<Object>} Objeto con `data` (lista de concesiones) y `returnValue` (código de retorno).
 * @throws {Error} Si falla la ejecución del procedimiento.
 */
async function obtenerConcesionPorFolioPlaca(seriePlaca, folio) {
    try {
        const pool = await poolPromise;
        const request = pool.request();
        if (seriePlaca) {
            request.input('seriePlaca', sql.NVarChar, seriePlaca);
        } else {
            request.input('seriePlaca', sql.NVarChar, null);
        }
        if (folio) {
            request.input('folio', sql.NVarChar, folio);
        } else {
            request.input('folio', sql.NVarChar, null);
        }
        const result = await request.execute('ConcesionObtenerPorFolioPlaca');
        // Filtrar solo los campos básicos para la tabla
        const filteredData = result.recordset.map(item => ({
            idConcesion: item.IdConcesion,
            folio: item.Folio,
            seriePlaca: item.SeriePlacaActual,
            numeroExpediente: item.NumeroExpediente
        }));
        return {
            data: filteredData.length > 0 ? filteredData : null,
            returnValue: result.returnValue
        };
    } catch (err) {
        throw new Error(`Error al ejecutar ConcesionObtenerPorFolioPlaca: ${err.message}`);
    }
}

/**
 * Busca concesionarios por nombre con paginación.
 * @async
 * @function obtenerConcesionariosPorNombre
 * @param {string} nombre - Nombre del concesionario.
 * @param {string} paterno - Apellido paterno.
 * @param {string} materno - Apellido materno.
 * @param {number} page - Número de página (por defecto 1).
 * @param {number} pageSize - Tamaño de página (por defecto 15).
 * @returns {Promise<Object>} Objeto con `data` (lista de concesionarios), `totalRecords`, `totalPages`, `returnValue`, `page`, y `pageSize`.
 * @throws {Error} Si falla la ejecución del procedimiento.
 */
async function obtenerConcesionariosPorNombre(nombre, paterno, materno, page, pageSize) {
    try {
        const pool = await poolPromise;
        const request = pool.request();
        request.input('nombre', sql.VarChar, nombre || null);
        request.input('paterno', sql.VarChar, paterno || null);
        request.input('materno', sql.VarChar, materno || null);
        request.input('RFC', sql.VarChar, null);

        // Obtener todos los resultados del procedimiento
        const result = await request.execute('ConcesionarioObtenerPorNombreRfc');
        const totalRecords = result.recordset.length;

        // Obtener resultados paginados
        const offset = (page - 1) * pageSize;
        const data = result.recordset
            .sort((a, b) => a.IdConcesionario - b.IdConcesionario)
            .slice(offset, offset + pageSize)
            .map(item => ({
                idConcesionario: item.IdConcesionario,
                tipoPersona: item.TipoPersona === 0 ? 'Física' : item.TipoPersona === 1 ? 'Moral' : item.TipoPersona,
                nombreCompleto: item.NombreConcesionario,
                RFC: item.RFC
            }));

        // Calcular el número total de páginas
        const totalPages = Math.ceil(totalRecords / pageSize);

        return {
            data: data,
            totalRecords: totalRecords,
            totalPages: totalPages,
            returnValue: result.returnValue,
            page: page,
            pageSize: pageSize
        };
    } catch (err) {
        throw new Error(`Error al ejecutar ConcesionarioObtenerPorNombreRfc: ${err.message}`);
    }
}

/**
 * Obtiene las concesiones asociadas a un concesionario.
 * @async
 * @function obtenerConcesionesPorConcesionario
 * @param {number} idConcesionario - El ID del concesionario.
 * @returns {Promise<Object>} Objeto con `data` (lista de concesiones) y `returnValue` (código de retorno).
 * @throws {Error} Si falla la ejecución del procedimiento.
 */
async function obtenerConcesionesPorConcesionario(idConcesionario) {
    try {
        const pool = await poolPromise;
        const request = pool.request();
        request.input('idConcesionario', sql.Int, idConcesionario);
        const result = await request.execute('ConcesionObtenerPorConcesionario');
        const data = result.recordset.map(item => ({
            idConcesion: item.IdConcesion,
            // documento: 'Concesión',
            folio: item.Folio,
            seriePlaca: item.SeriePlacaActual || 'SIN PLACA',
            numeroExpediente: item.NumeroExpediente
        }));
        return {
            data: data,
            returnValue: result.returnValue
        };
    } catch (err) {
        throw new Error(`Error al ejecutar ConcesionObtenerPorConcesionario: ${err.message}`);
    }
}

/**
 * Busca vehículos por placa, número de serie o número de motor.
 * @async
 * @function obtenerVehiculosPorPlacaNumSerie
 * @param {string} placa - La placa del vehículo.
 * @param {string} numSerie - El número de serie del vehículo.
 * @param {string} numMotor - El número de motor del vehículo.
 * @returns {Promise<Object>} Objeto con `data` (lista de vehículos) y `returnValue` (código de retorno).
 * @throws {Error} Si falla la ejecución del procedimiento.
 */
async function obtenerVehiculosPorPlacaNumSerie(placa, numSerie, numMotor) {
    try {
        const pool = await poolVehiclePromise;
        const request = pool.request();
        request.input('placa', sql.VarChar, placa || null);
        request.input('numSerie', sql.VarChar, numSerie || null);
        request.input('numMotor', sql.VarChar, numMotor || null);

        const result = await request.execute('VehiculoObtenerPorPlacaNumSerie');
        const data = result.recordset.map(item => ({
            IdVehiculo: item.IdVehiculo,
            IdConcesion: item.IdConcesion,
            PlacaAsignada: item.PlacaAsignada,
            SerieNIV: item.SerieNIV,
            Motor: item.Motor,
            Estatus: mapCatalogValue(item.IdEstatus, estatusMap),
            Marca: item.Marca,
            SubMarca: item.SubMarca,
            TipoVehiculo: item.TipoVehiculo,
            PlacaAnterior: item.PlacaAnterior,
            ClaseVehiculo: item.ClaseVehiculo
        }));
        return {
            data: data,
            returnValue: result.returnValue
        };
    } catch (err) {
        throw new Error(`Error al ejecutar VehiculoObtenerPorPlacaNumSerie: ${err.message}`);
    }
}

/**
 * Obtiene el reporte de inspecciones realizadas entre dos fechas, con paginación opcional.
 * @async
 * @function obtenerReporteInspecciones
 * @param {string} fechaInicio - Fecha de inicio del rango (formato: MM/DD/YYYY).
 * @param {string} fechaFin - Fecha de fin del rango (formato: MM/DD/YYYY).
 * @param {number} page - Número de página (entero positivo).
 * @param {number} pageSize - Tamaño de página (número de registros por página).
 * @param {boolean} [allPages=false] - Si es true, devuelve todos los registros sin paginación.
 * @returns {Promise<Object>} Objeto con `data` (lista de inspecciones), `totalRecords`, `totalPages`, y `returnValue`.
 * @throws {Error} Si falla la ejecución del procedimiento.
 */
async function obtenerReporteInspecciones(fechaInicio, fechaFin, page, pageSize, allPages = false) {
    try {
        // Convertir fechas de MM/DD/YYYY a objeto Date
        const parseDate = (dateStr) => {
            const [month, day, year] = dateStr.split('/').map(Number);
            return new Date(year, month - 1, day);
        };
        const startDate = parseDate(fechaInicio);
        const endDate = parseDate(fechaFin);
        endDate.setHours(23, 59, 59, 999); // Incluir todo el día

        if (isNaN(startDate) || isNaN(endDate)) {
            throw new Error('Formato de fecha inválido');
        }

        const pool = await poolPromise;
        const request = pool.request();
        request.input('fechaInspeccionInicio', sql.DateTime, startDate);
        request.input('fechaInspeccionFin', sql.DateTime, endDate);
        const result = await request.execute('RV_ReporteRealizadasUsuario');

        // Función para formatear la fecha al formato DD/MM/YYYY HH:mm
        const formatDate = (date) => {
            const d = new Date(date);
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            const year = d.getFullYear();
            const hours = String(d.getUTCHours()).padStart(2, '0');
            const minutes = String(d.getMinutes()).padStart(2, '0');
            return `${day}/${month}/${year} ${hours}:${minutes}`;
        };

        // Mapear y ordenar los resultados por FechaInspeccion
        const sortedData = result.recordset
            .map(item => ({
                IdRevistaVehicular: item.IdRevistaVehicular,
                FechaInspeccion: formatDate(item.FechaInspeccion),
                IdConsesion: item.IdConsesion,
                Tramite: item.Tramite,
                Concesionario: item.Propietario,
                Modalidad: item.Modalidad,
                Municipio: item.Municipio,
                Inspector: item.Inspector,
                Observaciones: item.Observaciones,
                _sortDate: new Date(item.FechaInspeccion)
            }))
            .sort((a, b) => a._sortDate - b._sortDate);

        // Calcular paginación
        const totalRecords = sortedData.length;
        const totalPages = allPages ? 1 : Math.ceil(totalRecords / pageSize);
        const data = allPages
            ? sortedData.map(({ _sortDate, ...item }) => item) // Todos los registros
            : sortedData
                .slice((page - 1) * pageSize, (page - 1) * pageSize + pageSize)
                .map(({ _sortDate, ...item }) => item); // Paginado

        return {
            data,
            page: allPages ? 1 : page,
            totalRecords,
            totalPages,
            returnValue: result.returnValue
        };
    } catch (err) {
        throw new Error(`Error al ejecutar RV_ReporteRealizadasUsuario: ${err.message}`);
    }
}
/**
 * Genera el reporte en el formato solicitado.
 * @async
 * @function generarReporte
 * @param {Object} req - Objeto de solicitud.
 * @param {Object} res - Objeto de respuesta.
 * @param {File} [req.file] - Archivo del logo (opcional para POST).
 * @returns {void}
 */
async function generarReporte(req, res) {
    const { fechaInicio, fechaFin, page = '1', format = 'json', allPages = 'false' } =  req.query;

    if (!fechaInicio || !fechaFin) {
        return res.status(400).json({ error: 'Se requieren fechaInicio y fechaFin' });
    }

    const dateRegex = /^(0[1-9]|[12]\d|3[01])\/(0[1-9]|1[0-2])\/\d{4}$/;
    if (!dateRegex.test(fechaInicio) || !dateRegex.test(fechaFin)) {
        return res.status(400).json({ error: 'Las fechas deben estar en formato DD/MM/YYYY' });
    }

    const pageNumber = parseInt(page, 10);
    if (isNaN(pageNumber) || pageNumber < 1) {
        return res.status(400).json({ error: 'El parámetro page debe ser un entero positivo' });
    }

    if (!['json', 'excel', 'pdf'].includes(format)) {
        return res.status(400).json({ error: 'Formato inválido. Use json, excel o pdf' });
    }

    const exportAllPages = allPages.toLowerCase() === 'true';

    const convertDateFormat = (date) => {
        const [day, month, year] = date.split('/');
        return `${month}/${day}/${year}`;
    };
    const fechaInicioConverted = convertDateFormat(fechaInicio);
    const fechaFinConverted = convertDateFormat(fechaFin);

    const pageSize = 20;
    const result = await obtenerReporteInspecciones(
        fechaInicioConverted,
        fechaFinConverted,
        pageNumber,
        pageSize,
        exportAllPages && format !== 'json'
    );

    if (!result.data || result.data.length === 0) {
        return res.status(404).json({
            message: 'No se encontraron inspecciones',
            totalRecords: 0,
            totalPages: 0,
            returnValue: result.returnValue
        });
    }
const headers = [
    'ID Revista', 'Fecha Inspección', 'ID Concesión', 'Trámite', 'Concesionario',
    'Modalidad', 'Municipio', 'Inspector', 'Observaciones'
];
    // Exportar a Excel
    if (format === 'excel') {
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Reporte de Inspecciones');

        // Agregar logo si está presente (solo para POST)
        let logoBase64 = null;
        if (req.file) {
            logoBase64 = `data:image/${req.file.mimetype.split('/')[1]};base64,${req.file.buffer.toString('base64')}`;
        }

        if (logoBase64) {
            const imageId = workbook.addImage({
                base64: logoBase64.replace(/^data:image\/(png|jpg|jpeg);base64,/, ''),
                extension: req.file.mimetype.split('/')[1]
            });
            worksheet.addImage(imageId, {
                tl: { col: 0, row: 0 },
                ext: { width: 100, height: 50 }
            });
        }

        // Título
        worksheet.addRow(['Reporte de Inspecciones Vehiculares']);
        worksheet.getRow(logoBase64 ? 2 : 1).font = { bold: true, size: 14 };
        worksheet.getRow(logoBase64 ? 2 : 1).alignment = { horizontal: 'center' };
        worksheet.getRow(logoBase64 ? 2 : 1).height = 20;

        // Rango de fechas
        worksheet.addRow([`Rango de fechas: ${fechaInicio} - ${fechaFin}`]);
        worksheet.getRow(logoBase64 ? 3 : 2).font = { italic: true };
        worksheet.getRow(logoBase64 ? 3 : 2).alignment = { horizontal: 'center' };
        worksheet.getRow(logoBase64 ? 3 : 2).height = 15;

        // Espacio
        worksheet.addRow([]);
        worksheet.getRow(logoBase64 ? 4 : 3).height = 5;

        // Encabezados manuales
        const headerRow = worksheet.addRow(headers);
        headerRow.font = { bold: true };
        headerRow.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFCCCCCC' }
        };
        headerRow.alignment = { horizontal: 'center' };
        headerRow.border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'medium' },
            right: { style: 'thin' }
        };
        worksheet.getRow(logoBase64 ? 5 : 4).height = 25;

        // Definir columnas solo para claves y anchos
        worksheet.columns = [
            { key: 'IdRevistaVehicular', width: 15 },
            { key: 'FechaInspeccion', width: 20 },
            { key: 'IdConsesion', width: 15 },
            { key: 'Tramite', width: 20 },
            { key: 'Concesionario', width: 25 },
            { key: 'Modalidad', width: 15 },
            { key: 'Municipio', width: 20 },
            { key: 'Inspector', width: 20 },
            { key: 'Observaciones', width: 30 },
        ];

        // Agregar datos con formato
        const dataRows = worksheet.addRows(result.data);
        dataRows.forEach((row, index) => {
            const excelRow = worksheet.getRow(logoBase64 ? index + 6 : index + 5);
            excelRow.border = {
                top: { style: 'thin' },
                left: { style: 'thin' },
                bottom: { style: 'thin' },
                right: { style: 'thin' }
            };
            excelRow.alignment = { horizontal: 'left' };
        });

        // Pie de página
        worksheet.headerFooter.oddFooter = '&LGenerated on &D&RPage &P of &N';

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename=Reporte_Inspecciones.xlsx');
        await workbook.xlsx.write(res);
        return res.end();
    }

    // Exportar a PDF
    if (format === 'pdf') {
        const { jsPDF } = require('jspdf');
        const { autoTable } = require('jspdf-autotable');
        const doc = new jsPDF({ orientation: 'landscape' });
        const maxTextLength = 50;

        // Agregar logo si está presente (solo para POST)
        let logoBase64 = null;
        if (req.file) {
            logoBase64 = `data:image/${req.file.mimetype.split('/')[1]};base64,${req.file.buffer.toString('base64')}`;
        }

        if (logoBase64) {
            const logoData = logoBase64.replace(/^data:image\/(png|jpg|jpeg);base64,/, '');
            doc.addImage(logoData, req.file.mimetype.split('/')[1].toUpperCase(), 10, 10, 30, 15);
        }

        // Título
        doc.setFontSize(16);
        doc.text('Reporte de Inspecciones Vehiculares', doc.internal.pageSize.width / 2, logoBase64 ? 30 : 20, { align: 'center' });

        // Rango de fechas
        doc.setFontSize(12);
        doc.text(`Rango de fechas: ${fechaInicio} - ${fechaFin}`, doc.internal.pageSize.width / 2, logoBase64 ? 40 : 30, { align: 'center' });

        // Preparar datos para la tabla
        const tableData = result.data.map(item => [
            item.IdRevistaVehicular,
            item.FechaInspeccion,
            item.IdConsesion,
            item.Tramite,
            item.Concesionario,
            item.Modalidad,
            item.Municipio,
            item.Inspector,
            (item.Observaciones || '').substring(0, maxTextLength) + ((item.Observaciones || '').length > maxTextLength ? '...' : '')
        ]);

        // Generar tabla
        autoTable(doc, {
            head: [headers],
            body: tableData,
            startY: logoBase64 ? 60 : 50,
            margin: { left: 10, right: 10 },
            styles: { fontSize: 10, cellPadding: 2 },
            headStyles: { fillColor: [200, 200, 200], textColor: [0, 0, 0], fontStyle: 'bold' },
            columnStyles: {
                0: { cellWidth: 20 },
                1: { cellWidth: 25 },
                2: { cellWidth: 20 },
                3: { cellWidth: 20 },
                4: { cellWidth: 50 },
                5: { cellWidth: 30 },
                6: { cellWidth: 30 },
                7: { cellWidth: 30 },
                8: { cellWidth: 55 }
            },
            didDrawPage: (data) => {
                doc.setFontSize(10);
                doc.text(`Generado el ${new Date().toLocaleDateString()} - Página ${doc.getNumberOfPages()}`, doc.internal.pageSize.width / 2, doc.internal.pageSize.height - 10, { align: 'center' });
            }
        });

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename=Reporte_Inspecciones.pdf');
        res.send(Buffer.from(doc.output('arraybuffer')));
        return;
    }

    // Respuesta JSON por defecto
    res.json(result);
}
/**
 * Obtiene los detalles de un concesionario por su ID.
 * @async
 * @function obtenerConcesionarioPorId
 * @param {number} idConcesionario - El ID del concesionario.
 * @returns {Promise<Object>} Objeto con `data` (detalles del concesionario) y `returnValue` (código de retorno).
 * @throws {Error} Si falla la ejecución del procedimiento.
 */
async function obtenerConcesionarioPorId(idConcesionario) {
    try {
        const pool = await poolPromise;
        const request = pool.request();
        request.input('idConcesionario', sql.Int, idConcesionario);
        const result = await request.execute('ConcesionarioObtenerPorId');
        let data = result.recordset[0] || null;
        if (data) {
            data.Genero = mapCatalogValue(data.IdGenero, generoMap);
            data.Nacionalidad = mapCatalogValue(data.IdNacionalidad, nacionalidadMap);
            data.TipoPersona = data.TipoPersona === 0 ? 'Física' : data.TipoPersona === 1 ? 'Moral' : data.TipoPersona;
        }
        return {
            data: data,
            returnValue: result.returnValue
        };
    } catch (err) {
        throw new Error(`Error al ejecutar ConcesionarioObtenerPorId: ${err.message}`);
    }
}

/**
 * Obtiene los beneficiarios asociados a un concesionario.
 * @async
 * @function obtenerBeneficiariosPorConcesionario
 * @param {number} idConcesionario - El ID del concesionario.
 * @returns {Promise<Object>} Objeto con `data` (lista de beneficiarios) y `returnValue` (código de retorno).
 * @throws {Error} Si falla la ejecución del procedimiento.
 */
async function obtenerBeneficiariosPorConcesionario(idConcesionario) {
    try {
        const pool = await poolPromise;
        const request = pool.request();
        request.input('idConcesionario', sql.Int, idConcesionario);
        const result = await request.execute('ConcesionarioBeneficiarios');
        return {
            data: result.recordset || null,
            returnValue: result.returnValue
        };
    } catch (err) {
        throw new Error(`Error al ejecutar ConcesionarioBeneficiarios: ${err.message}`);
    }
}

/**
 * Obtiene las direcciones asociadas a un concesionario.
 * @async
 * @function obtenerDireccionesPorConcesionario
 * @param {number} idConcesionario - El ID del concesionario.
 * @returns {Promise<Object>} Objeto con `data` (lista de direcciones) y `returnValue` (código de retorno).
 * @throws {Error} Si falla la ejecución del procedimiento.
 */
async function obtenerDireccionesPorConcesionario(idConcesionario) {
    try {
        const pool = await poolPromise;
        const request = pool.request();
        request.input('idConcesionario', sql.Int, idConcesionario);
        const result = await request.execute('ConcesionarioObtenerDirecciones');
        return {
            data: result.recordset || null,
            returnValue: result.returnValue
        };
    } catch (err) {
        throw new Error(`Error al ejecutar ConcesionarioObtenerDirecciones: ${err.message}`);
    }
}

/**
 * Obtiene las referencias asociadas a un concesionario.
 * @async
 * @function obtenerReferenciasPorConcesionario
 * @param {number} idConcesionario - El ID del concesionario.
 * @returns {Promise<Object>} Objeto con `data` (lista de referencias) y `returnValue` (código de retorno).
 * @throws {Error} Si falla la ejecución del procedimiento.
 */
async function obtenerReferenciasPorConcesionario(idConcesionario) {
    try {
        const pool = await poolPromise;
        const request = pool.request();
        request.input('idConcesionario', sql.Int, idConcesionario);
        const result = await request.execute('ConcesionarioObtenerReferencias');
        return {
            data: result.recordset || null,
            returnValue: result.returnValue
        };
    } catch (err) {
        throw new Error(`Error al ejecutar ConcesionarioObtenerReferencias: ${err.message}`);
    }
}

/**
 * Obtiene los datos del seguro para una concesión.
 * @async
 * @function obtenerSeguroPorConcesion
 * @param {number} idConcesion - El ID de la concesión.
 * @returns {Promise<Object>} Objeto con `data` (detalles del seguro) y `returnValue` (código de retorno).
 * @throws {Error} Si falla la ejecución del procedimiento.
 */
async function obtenerSeguroPorConcesion(idConcesion) {
    try {
        const pool = await poolPromise;
        const request = pool.request();
        request.input('idConcesion', sql.Int, idConcesion);
        const result = await request.execute('AseguradoraObtener');
        return {
            data: result.recordset[0] || null,
            returnValue: result.returnValue
        };
    } catch (err) {
        throw new Error(`Error al ejecutar AseguradoraObtener: ${err.message}`);
    }
}

/**
 * Obtiene los detalles de un vehículo por su ID.
 * @async
 * @function obtenerVehiculoPorId
 * @param {number} idVehiculo - El ID del vehículo.
 * @returns {Promise<Object>} Objeto con `data` (detalles del vehículo) y `returnValue` (código de retorno).
 * @throws {Error} Si falla la ejecución del procedimiento.
 */
async function obtenerVehiculoPorId(idVehiculo) {
    try {
        const pool = await poolVehiclePromise;
        const request = pool.request();
        request.input('idVehiculo', sql.Int, idVehiculo);
        const result = await request.execute('VehiculoObtenerPorId');
        return {
            data: result.recordset[0] || null,
            returnValue: result.returnValue
        };
    } catch (err) {
        throw new Error(`Error al ejecutar VehiculoObtenerPorId: ${err.message}`);
    }
}

/**
 * Obtiene la información completa de una concesión, incluyendo datos relacionados.
 * @async
 * @function obtenerInformacionCompletaPorConcesion
 * @param {number} idConcesion - El ID de la concesión.
 * @returns {Promise<Object>} Objeto con detalles de la concesión, concesionario (información personal, beneficiarios, direcciones, referencias), seguro y vehículo.
 * @throws {Error} Si falla la ejecución de alguna consulta.
 */
async function obtenerInformacionCompletaPorConcesion(idConcesion) {
    try {
        // Obtener datos de la concesión
        const concesionResult = await obtenerConcesionPorId(idConcesion);
        if (!concesionResult.data) {
            return {
                message: 'Concesión no encontrada',
                returnValue: concesionResult.returnValue
            };
        }

        // Convertir IdConcesionarioActual e IdVehiculoActual de string a entero
        const idConcesionarioActual = parseInt(concesionResult.data.IdConcesionarioActual);
        const idVehiculoActual = parseInt(concesionResult.data.IdVehiculoActual);

        if (isNaN(idConcesionarioActual)) {
            throw new Error('IdConcesionarioActual no es un número válido');
        }
        if (isNaN(idVehiculoActual)) {
            throw new Error('IdVehiculoActual no es un número válido');
        }

        // Obtener datos relacionados
        const [concesionario, beneficiarios, direcciones, referencias, seguro, vehiculo] = await Promise.all([
            obtenerConcesionarioPorId(idConcesionarioActual),
            obtenerBeneficiariosPorConcesionario(idConcesionarioActual),
            obtenerDireccionesPorConcesionario(idConcesionarioActual),
            obtenerReferenciasPorConcesionario(idConcesionarioActual),
            obtenerSeguroPorConcesion(idConcesion),
            obtenerVehiculoPorId(idVehiculoActual)
        ]);

        return {
            concesion: {
                data: concesionResult.data,
                returnValue: concesionResult.returnValue
            },
            concesionario: {
                data: concesionario.data,
                returnValue: concesionario.returnValue
            },
            beneficiarios: {
                data: beneficiarios.data,
                returnValue: beneficiarios.returnValue
            },
            direcciones: {
                data: direcciones.data,
                returnValue: direcciones.returnValue
            },
            referencias: {
                data: referencias.data,
                returnValue: referencias.returnValue
            },
            seguro: {
                data: seguro.data,
                returnValue: seguro.returnValue
            },
            vehiculo: {
                data: vehiculo.data,
                returnValue: vehiculo.returnValue
            }
        };
    } catch (err) {
        throw new Error(`Error al obtener información completa: ${err.message}`);
    }
}

async function obtenerTiposTramite() {
        try {
            const pool = await poolPromise;
            const result = await pool.request().execute('RV_ObtenerTipoTramite');
            return {
                data: result.recordset,
                returnValue: result.returnValue
            };
        } catch (err) {
            throw new Error('Error al obtener tipos de trámite: ' + err.message);
        }
}

// Nueva función: Insertar inspección vehicular
async function insertarRevista(data) {
    try {
        const pool = await poolPromise;
        const request = pool.request();

        // Mapear los datos a los parámetros del procedimiento almacenado
        request.input('idConcesion', sql.Int, parseInt(data.idConcesion));
        request.input('idPropietario', sql.Int, parseInt(data.idPropietario));
        request.input('idTramite', sql.Int, parseInt(data.idTramite));
        request.input('idVehiculo', sql.Int, parseInt(data.idVehiculo));
        request.input('placa', sql.NVarChar(20), data.placa);
        request.input('propietario', sql.NVarChar(150), data.propietario);
        request.input('placaDelanteraVer', sql.Bit, parseInt(data.placaDelanteraVer));
        request.input('placaTraseraVer', sql.Bit, parseInt(data.placaTraseraVer));
        request.input('calcaVerificacionVer', sql.Bit, parseInt(data.calcaVerificacionVer));
        request.input('calcaTenenciaVer', sql.Bit, parseInt(data.calcaTenenciaVer));
        request.input('pinturaCarroceriaVer', sql.Bit, parseInt(data.pinturaCarroceriaVer));
        request.input('estadoLlantasVer', sql.Bit, parseInt(data.estadoLlantasVer));
        request.input('defensasVer', sql.TinyInt, parseInt(data.defensasVer));
        request.input('vidriosVer', sql.TinyInt, parseInt(data.vidriosVer));
        request.input('limpiadoresVer', sql.TinyInt, parseInt(data.limpiadoresVer));
        request.input('espejosVer', sql.TinyInt, parseInt(data.espejosVer));
        request.input('llantaRefaccionVer', sql.TinyInt, parseInt(data.llantaRefaccionVer));
        request.input('parabrisasMedallonVer', sql.TinyInt, parseInt(data.parabrisasMedallonVer));
        request.input('claxonVer', sql.Bit, parseInt(data.claxonVer));
        request.input('luzBajaVer', sql.Bit, parseInt(data.luzBajaVer));
        request.input('luzAltaVer', sql.Bit, parseInt(data.luzAltaVer));
        request.input('cuartosVer', sql.Bit, parseInt(data.cuartosVer));
        request.input('direccionalesVer', sql.Bit, parseInt(data.direccionalesVer));
        request.input('intermitentesVer', sql.Bit, parseInt(data.intermitentesVer));
        request.input('stopVer', sql.Bit, parseInt(data.stopVer));
        request.input('timbreVer', sql.Bit, parseInt(data.timbreVer));
        request.input('estinguidorVer', sql.TinyInt, parseInt(data.estinguidorVer));
        request.input('herramientasVer', sql.Bit, parseInt(data.herramientasVer));
        request.input('sistemaFrenadoVer', sql.Bit, parseInt(data.sistemaFrenadoVer));
        request.input('sistemaDireccionVer', sql.Bit, parseInt(data.sistemaDireccionVer));
        request.input('sistemaSuspensionVer', sql.Bit, parseInt(data.sistemaSuspensionVer));
        request.input('interioresVer', sql.Bit, parseInt(data.interioresVer));
        request.input('botiquinVer', sql.Bit, parseInt(data.botiquinVer));
        request.input('cinturonSeguridadVer', sql.Bit, parseInt(data.cinturonSeguridadVer));
        request.input('observaciones', sql.NVarChar(500), data.observaciones || '');
        request.input('aprobado', sql.Bit, parseInt(data.aprobado));
        request.input('imagenCromaticaVer', sql.Bit, parseInt(data.imagenCromaticaVer));
        request.input('folio', sql.NVarChar(12), data.folio || '');
        request.input('IdUser', sql.Int, parseInt(data.IdUser));
        request.input('Inspector', sql.NVarChar(200), data.Inspector || '');

        const result = await request.execute('RV_InsertarRevista');
        return { idRV: result.recordset[0][''] };
    } catch (err) {
        throw new Error('Error al insertar la inspección: ' + err.message);
    }
}

// Nueva función: Guardar imagen de inspección
async function guardarImagenRevista(idRV, tipoImagen, imagen) {
    try {
        const pool = await poolPromise;

        // **Opción 1: Almacenar imagen en la base de datos como tipo image**
        // Asumimos una tabla ImagenesRevista con columnas: IdImagen, IdRevistaVehicular, TipoImagen, Imagen (tipo image)
        const imagenBuffer = imagen.data; // Buffer de la imagen

        await pool.request()
            .input('IdRevistaVehicular', sql.BigInt, idRV)
            .input('TipoImagen', sql.Int, parseInt(tipoImagen))
            .input('Imagen', sql.Image, imagenBuffer)
            .query(`
                INSERT INTO ImagenesRevista (IdRevistaVehicular, TipoImagen, Imagen)
                VALUES (@IdRevistaVehicular, @TipoImagen, @Imagen)
            `);

        return { success: true };

        // **Opción 2: Almacenar imagen en el servidor y guardar la ruta**
        // Descomenta y configura esta sección si el PM decide usar esta opción
        /*
        const fs = require('fs').promises;
        const path = require('path');
        const uploadDir = path.join(__dirname, '../uploads');
        
        // Crear directorio si no existe
        await fs.mkdir(uploadDir, { recursive: true });
        
        // Generar nombre único para la imagen
        const fileName = `${idRV}_${tipoImagen}_${Date.now()}_${imagen.name}`;
        const uploadPath = path.join(uploadDir, fileName);
        
        // Guardar imagen en el servidor
        await imagen.mv(uploadPath);
        
        // Insertar referencia en la base de datos
        // Asumimos una tabla ImagenesRevista con columnas: IdImagen, IdRevistaVehicular, TipoImagen, Ruta, Imagen (tipo image para compatibilidad con sistema anterior)
        await pool.request()
            .input('IdRevistaVehicular', sql.BigInt, idRV)
            .input('TipoImagen', sql.Int, parseInt(tipoImagen))
            .input('Ruta', sql.NVarChar(255), uploadPath)
            .query(`
                INSERT INTO ImagenesRevista (IdRevistaVehicular, TipoImagen, Ruta)
                VALUES (@IdRevistaVehicular, @TipoImagen, @Ruta)
            `);
        
        return { success: true };
        */
    } catch (err) {
        throw new Error('Error al guardar la imagen: ' + err.message);
    }
}

// Nueva función: Obtener imágenes de una inspección (opcional)
async function obtenerImagenesRevista(idRV, tipoImagen) {
    try {
        const pool = await poolPromise;
        let imagenes = [];

        if (tipoImagen) {
            // Obtener una imagen específica
            const request = pool.request()
                .input('idRevistaVehicular', sql.BigInt, idRV)
                .input('idTipoImagen', sql.Int, parseInt(tipoImagen));
            const result = await request.execute('RV_ObtenerImagenRV');
            imagenes = result.recordset;
        } else {
            // Obtener todos los tipos de imagen
            const tiposImagen = await this.obtenerTiposImagen();
            // Iterar sobre cada tipo de imagen
            for (const tipo of tiposImagen.data) {
                const request = pool.request()
                    .input('idRevistaVehicular', sql.BigInt, idRV)
                    .input('idTipoImagen', sql.Int, tipo.IdTipoImagen); // Asumiendo que el campo es IdTipoImagen
                const result = await request.execute('RV_ObtenerImagenRV');
                if (result.recordset.length > 0) {
                    imagenes = imagenes.concat(result.recordset);
                }
            }
        }

        // Convertir imágenes binarias a base64
        const mappedImagenes = imagenes.map(img => ({
            IdImagen: img.IdImagen,
            IdRevistaVehicular: img.IdRevistaVehicular,
            TipoImagen: img.TipoImagen,
            ImagenBase64: img.Imagen ? Buffer.from(img.Imagen, 'binary').toString('base64') : null,
            Ruta: img.Ruta || null // Para compatibilidad futura
        }));

        return {
            data: mappedImagenes,
            returnValue: imagenes.length > 0 ? 0 : -1
        };
    } catch (err) {
        throw new Error('Error al obtener las imágenes: ' + err.message);
    }
}

async function obtenerTiposImagen() {
    try {
        const pool = await poolPromise;
        const result = await pool.request().execute('RV_ObtenerTipoImagen');
        return {
            data: result.recordset,
            returnValue: result.returnValue
        };
    } catch (err) {
        throw new Error('Error al obtener tipos de imagen: ' + err.message);
    }
}

/**
 * Obtiene los detalles del vehículo y la aseguradora para una concesión y vehículo específicos.
 * @async
 * @function obtenerVehiculoYAseguradora
 * @param {number} idConcesion - El ID de la concesión.
 * @param {number} idVehiculo - El ID del vehículo.
 * @returns {Promise<Object>} Objeto con `data` (vehículo y aseguradora) y `returnValue`.
 * @throws {Error} Si falla la consulta o los procedimientos.
 */
async function obtenerVehiculoYAseguradora(idConcesion, idVehiculo) {
    try {
        // Obtener datos del vehículo
        const vehiculoResult = await obtenerVehiculoPorId(idVehiculo);
        if (!vehiculoResult.data) {
            return {
                message: 'Vehículo no encontrado',
                returnValue: vehiculoResult.returnValue
            };
        }

        // Obtener datos de la aseguradora
        const aseguradoraResult = await obtenerSeguroPorConcesion(idConcesion);
        if (!aseguradoraResult.data) {
            return {
                message: 'Aseguradora no encontrada',
                returnValue: aseguradoraResult.returnValue
            };
        }

        return {
            data: {
                vehiculo: vehiculoResult.data,
                aseguradora: aseguradoraResult.data
            },
            returnValue: 0
        };
    } catch (err) {
        throw new Error(`Error al obtener vehículo y aseguradora: ${err.message}`);
    }
}
module.exports = {
    obtenerInformacionCompletaPorConcesion,
    obtenerConcesionPorId,
    obtenerConcesionPorFolioPlaca,
    obtenerConcesionarioPorId,
    obtenerConcesionariosPorNombre,
    obtenerConcesionesPorConcesionario,
    obtenerReporteInspecciones,
    obtenerVehiculosPorPlacaNumSerie,
    obtenerBeneficiariosPorConcesionario,
    obtenerDireccionesPorConcesionario,
    obtenerReferenciasPorConcesionario,
    obtenerSeguroPorConcesion,
    obtenerVehiculoPorId,
    obtenerTiposTramite,
    insertarRevista,
    guardarImagenRevista,
    obtenerImagenesRevista,
    obtenerTiposImagen,
    obtenerVehiculoYAseguradora,
    generarReporte
};