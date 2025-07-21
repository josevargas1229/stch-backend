/**
 * Módulo de servicios para interactuar con las bases de datos de concesiones y vehículos.
 * @module dbService
 */
const poolPromise = require('../config/db');
const poolVehiclePromise = require('../config/dbVehicle');
const poolUsersPromise = require('../config/dbUsers');
const sql = require('mssql');
const ExcelJS = require('exceljs');
// Catálogos en memoria
let generoMap = new Map();
let nacionalidadMap = new Map();
let estatusMap = new Map();
let revistaEstatusMap = new Map();
require('dotenv').config();
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

        const revistaEstatusResult = await pool.request().query('SELECT [IdEstatus], [Estatus] FROM [RevistaVehicular].[Estatus]');
        revistaEstatusMap = new Map(revistaEstatusResult.recordset.map(item => [item.IdEstatus, item.Estatus]));

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
 * Obtiene los detalles de una concesión por su folio.
 * @async
 * @function obtenerConcesionPorFolio
 * @param {string} folio - El folio de la concesión.
 * @returns {Promise<Object>} Objeto con `data` (detalles de la concesión) y `returnValue` (código de retorno).
 * @throws {Error} Si falla la ejecución del procedimiento.
 */
async function obtenerConcesionPorFolio(folio) {
    try {
        const pool = await poolPromise;
        const request = pool.request();
        request.input('folioConcesion', sql.NVarChar, folio);
        const result = await request.execute('ConcesionObtenerPorFolio');
        return {
            data: result.recordset[0] || null,
            returnValue: result.returnValue
        };
    } catch (err) {
        throw new Error(`Error al ejecutar ConcesionObtenerPorFolio: ${err.message}`);
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
async function generarReporte(req, res) {     const { fechaInicio, fechaFin, page = '1', format, allPages = 'false' } = req.query;

    console.log('Parámetros recibidos:', { fechaInicio, fechaFin, page, format, allPages });

    // Permitir fechas en formato DD/MM/YYYY o YYYY-MM-DD
    const isDDMMYYYY = /^\d{2}\/\d{2}\/\d{4}$/.test(fechaInicio) && /^\d{2}\/\d{2}\/\d{4}$/.test(fechaFin);
    const isYYYYMMDD = /^\d{4}-\d{2}-\d{2}$/.test(fechaInicio) && /^\d{4}-\d{2}-\d{2}$/.test(fechaFin);

    if (!fechaInicio || !fechaFin) {
        console.log('Error: Faltan fechas');
        return res.status(400).json({ error: 'Se requieren fechaInicio y fechaFin' });
    }

    if (!isDDMMYYYY && !isYYYYMMDD) {
        console.log('Error: Formato de fecha inválido');
        return res.status(400).json({ error: 'Las fechas deben estar en formato DD/MM/YYYY o YYYY-MM-DD' });
    }

    const pageNumber = parseInt(page, 10);
    if (isNaN(pageNumber) || pageNumber < 1) {
        console.log('Error: page inválido');
        return res.status(400).json({ error: 'El parámetro page debe ser un entero positivo' });
    }

    if (!['json', 'excel', 'pdf'].includes(format)) {
        console.log('Error: Formato inválido');
        return res.status(400).json({ error: 'Formato inválido. Use json, excel o pdf' });
    }

    const exportAllPages = allPages.toLowerCase() === 'true';

    // Convertir fechas a MM/DD/YYYY para la función interna
    function toMMDDYYYY(dateStr) {
        if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateStr)) {
            // DD/MM/YYYY -> MM/DD/YYYY
            const [day, month, year] = dateStr.split('/');
            return `${month}/${day}/${year}`;
        }
        if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
            // YYYY-MM-DD -> MM/DD/YYYY
            const [year, month, day] = dateStr.split('-');
            return `${month}/${day}/${year}`;
        }
        return dateStr;
    }
    const fechaInicioConverted = toMMDDYYYY(fechaInicio);
    const fechaFinConverted = toMMDDYYYY(fechaFin);

    console.log('Fechas convertidas:', { fechaInicioConverted, fechaFinConverted });

    const pageSize = 20;
    let result;
    try {
        result = await obtenerReporteInspecciones(
            fechaInicioConverted,
            fechaFinConverted,
            pageNumber,
            pageSize,
            exportAllPages && format !== 'json'
        );
    } catch (err) {
        console.error('Error en obtenerReporteInspecciones:', err);
        return res.status(500).json({ error: 'Error interno al obtener el reporte' });
    }

    if (!result.data || result.data.length === 0) {
        console.log('No se encontraron inspecciones');
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

<<<<<<< HEAD
        worksheet.addRow(['Reporte de Inspecciones Vehiculares']);
        worksheet.getRow(logoBase64 ? 2 : 1).font = { bold: true, size: 14 };
        worksheet.getRow(logoBase64 ? 2 : 1).alignment = { horizontal: 'center' };
        worksheet.getRow(logoBase64 ? 2 : 1).height = 20;

        worksheet.addRow([`Rango de fechas: ${fechaInicio} - ${fechaFin}`]);
        worksheet.getRow(logoBase64 ? 3 : 2).font = { italic: true };
        worksheet.getRow(logoBase64 ? 3 : 2).alignment = { horizontal: 'center' };
        worksheet.getRow(logoBase64 ? 3 : 2).height = 15;
=======
        // Título
        const titleRow = 1;
        const titleColStart = logoBase64 ? 2 : 1;
        worksheet.getCell(`${String.fromCharCode(65 + titleColStart - 1)}${titleRow}`).value = 'Reporte de inspecciones vehiculares';
        worksheet.getCell(`${String.fromCharCode(65 + titleColStart - 1)}${titleRow}`).font = { bold: true, size: 14 };
        worksheet.getCell(`${String.fromCharCode(65 + titleColStart - 1)}${titleRow}`).alignment = { horizontal: 'left' };

        // Rango de fechas
        const dateRow =  2; 
        worksheet.getCell(`${String.fromCharCode(65 + titleColStart - 1)}${dateRow}`).value = `Rango de fechas: ${fechaInicio} - ${fechaFin}`;
        worksheet.getCell(`${String.fromCharCode(65 + titleColStart - 1)}${dateRow}`).font = { italic: true };
        worksheet.getCell(`${String.fromCharCode(65 + titleColStart - 1)}${dateRow}`).alignment = { horizontal: 'left' };
        worksheet.getRow(dateRow).height = 1
>>>>>>> 806dd7cf6f0fbe56e8027c3e145b141e4c6d89f5

        worksheet.addRow([]);
        worksheet.getRow(logoBase64 ? 4 : 3).height = 5;

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

        worksheet.headerFooter.oddFooter = '&LGenerated on &D&RPage &P of &N';

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename=Reporte_Inspecciones.xlsx');
        await workbook.xlsx.write(res);
        console.log('Excel generado y enviado');
        return res.end();
    }

    // Exportar a PDF
    if (format === 'pdf') {
        const { jsPDF } = require('jspdf');
        const { autoTable } = require('jspdf-autotable');
        const doc = new jsPDF({ orientation: 'landscape' });
        const maxTextLength = 50;

        let logoBase64 = null;
        if (req.file) {
            logoBase64 = `data:image/${req.file.mimetype.split('/')[1]};base64,${req.file.buffer.toString('base64')}`;
        }
        const headerY = 10;
        const logoWidth = 50;
        const logoHeight = 30;

        if (logoBase64) {
        const logoData = logoBase64.replace(/^data:image\/(png|jpg|jpeg);base64,/, '');
            doc.addImage(logoData, req.file.mimetype.split('/')[1].toUpperCase(), 10, headerY, logoWidth, logoHeight);
        }
<<<<<<< HEAD

        doc.setFontSize(16);
        doc.text('Reporte de Inspecciones Vehiculares', doc.internal.pageSize.width / 2, logoBase64 ? 30 : 20, { align: 'center' });

=======
        // Título
        const textX = doc.internal.pageSize.width / 2 - (logoBase64 ? logoWidth / 2 : 0) - 10;
        doc.setFontSize(16);
        doc.text('Reporte de inspecciones vehiculares', textX, headerY + 5); // Ajuste Y para centrar verticalmente con el logo
        // Rango de fechas
>>>>>>> 806dd7cf6f0fbe56e8027c3e145b141e4c6d89f5
        doc.setFontSize(12);
        doc.text(`Fechas: ${fechaInicio} - ${fechaFin}`, textX, headerY + 15); // Debajo del título, en la misma "línea"

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
                4: { cellWidth: 47 },
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
        console.log('PDF generado y enviado');
        return;
    }

    // Respuesta JSON por defecto
    console.log('Respuesta JSON enviada');
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
/**
 * Obtiene los tipos de trámite disponibles para revistas vehiculares.
 * @async
 * @function obtenerTiposTramite
 * @returns {Promise<Object>} Objeto con los resultados:
 * - `data`: Array de tipos de trámite devueltos por el procedimiento `RV_ObtenerTipoTramite`.
 * - `returnValue`: Valor de retorno del procedimiento almacenado.
 * @throws {Error} Si ocurre un error al ejecutar el procedimiento, con el mensaje "Error al obtener tipos de trámite: [mensaje de error]".
 */
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

/**
 * Inserta una nueva revista vehicular en la base de datos.
 * @async
 * @function insertarRevista
 * @param {Object} data - Datos de la revista vehicular.
 * @param {number} data.idConcesion - ID de la concesión.
 * @param {number} data.idPropietario - ID del propietario.
 * @param {number} data.idTramite - ID del tipo de trámite.
 * @param {number} data.idVehiculo - ID del vehículo.
 * @param {string} data.placa - Placa del vehículo.
 * @param {string} data.propietario - Nombre del propietario.
 * @param {number} data.placaDelanteraVer - Estado de la placa delantera (0 o 1).
 * @param {number} data.placaTraseraVer - Estado de la placa trasera (0 o 1).
 * @param {number} data.calcaVerificacionVer - Estado de la calca de verificación (0 o 1).
 * @param {number} data.calcaTenenciaVer - Estado de la calca de tenencia (0 o 1).
 * @param {number} data.pinturaCarroceriaVer - Estado de la pintura de la carrocería (0 o 1).
 * @param {number} data.estadoLlantasVer - Estado de las llantas (0 o 1).
 * @param {number} data.defensasVer - Estado de las defensas (0, 1 o 2).
 * @param {number} data.vidriosVer - Estado de los vidrios (0, 1 o 2).
 * @param {number} data.limpiadoresVer - Estado de los limpiadores (0, 1 o 2).
 * @param {number} data.espejosVer - Estado de los espejos (0, 1 o 2).
 * @param {number} data.llantaRefaccionVer - Estado de la llanta de refacción (0, 1 o 2).
 * @param {number} data.parabrisasMedallonVer - Estado del parabrisas/medallón (0, 1 o 2).
 * @param {number} data.claxonVer - Estado del claxon (0 o 1).
 * @param {number} data.luzBajaVer - Estado de las luces bajas (0 o 1).
 * @param {number} data.luzAltaVer - Estado de las luces altas (0 o 1).
 * @param {number} data.cuartosVer - Estado de los cuartos (0 o 1).
 * @param {number} data.direccionalesVer - Estado de las direccionales (0 o 1).
 * @param {number} data.intermitentesVer - Estado de las intermitentes (0 o 1).
 * @param {number} data.stopVer - Estado de las luces de freno (0 o 1).
 * @param {number} data.timbreVer - Estado del timbre (0 o 1).
 * @param {number} data.estinguidorVer - Estado del extintor (0, 1 o 2).
 * @param {number} data.herramientasVer - Estado de las herramientas (0 o 1).
 * @param {number} data.sistemaFrenadoVer - Estado del sistema de frenos (0 o 1).
 * @param {number} data.sistemaDireccionVer - Estado del sistema de dirección (0 o 1).
 * @param {number} data.sistemaSuspensionVer - Estado del sistema de suspensión (0 o 1).
 * @param {number} data.interioresVer - Estado de los interiores (0 o 1).
 * @param {number} data.botiquinVer - Estado del botiquín (0 o 1).
 * @param {number} data.cinturonSeguridadVer - Estado del cinturón de seguridad (0 o 1).
 * @param {string} [data.observaciones] - Observaciones de la inspección.
 * @param {number} data.aprobado - Estado de aprobación (0 o 1).
 * @param {number} data.imagenCromaticaVer - Estado de la imagen cromática (0 o 1).
 * @param {string} [data.folio] - Folio de la revista (opcional, por defecto '').
 * @param {number} data.IdUser - ID del usuario que registra la revista.
 * @param {string} [data.Inspector] - Nombre del inspector.
 * @returns {Promise<Object>} Objeto con el ID de la revista insertada:
 * - `idRV`: ID de la revista vehicular generada.
 * @throws {Error} Si ocurre un error al ejecutar el procedimiento `RV_InsertarRevista`, con el mensaje "Error al insertar la inspección: [mensaje de error]".
 */
async function insertarRevista(data) {
    try {
        const pool = await poolPromise;
        const request = pool.request();

        // Mapear los datos a los parámetros del procedimiento almacenado
        request.input('idConcesion', sql.Int, parseInt(data.idConcesion));
        request.input('idPropietario', sql.Int, parseInt(data.idPropietario));
        request.input('idTramite', sql.Int, parseInt(data.idTramite));
        request.input('idVehiculo', sql.Int, parseInt(data.idVehiculo));
        request.input('idEstatus', sql.Int, 1);
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

/**
 * Guarda una imagen asociada a una inspección vehicular usando el procedimiento RV_InsertaImagenRevista.
 * @param {number} idRV - ID de la inspección vehicular.
 * @param {number} tipoImagen - Tipo de imagen (1-6).
 * @param {Object} imagen - Objeto con data (buffer), mimetype y name.
 * @returns {Object} - Resultado con success y idImagen.
 */
async function guardarImagenRevista(idRV, tipoImagen, imagen) {
    try {
        const pool = await poolPromise;
        const imagenBuffer = imagen.data; // Buffer de la imagen

        const result = await pool.request()
            .input('idRevistaVehicular', sql.BigInt, idRV)
            .input('imagen', sql.Image, imagenBuffer)
            .input('tipoImagen', sql.Int, parseInt(tipoImagen))
            .execute('RV_InsertaImagenRevista');

        return {
            success: true,
            idImagen: result.recordset[0]?.[0] // SCOPE_IDENTITY() devuelve el ID
        };
    } catch (err) {
        throw new Error('Error al guardar la imagen: ' + err.message);
    }
}

/**
 * Obtiene las imágenes asociadas a una inspección vehicular.
 * @param {number} idRV - ID de la inspección vehicular.
 * @param {number} [tipoImagen] - Tipo de imagen (opcional).
 * @returns {Object} - Resultado con data (imágenes) y returnValue.
 */
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
            IdImagen: img.IdImagenRevistaVehicular,
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

/**
 * Elimina una imagen asociada a una inspección vehicular usando el procedimiento RV_EliminarImagenRevistaVehicular.
 * @param {number} idImagen - ID de la imagen a eliminar.
 * @returns {Object} - Resultado con success.
 */
async function eliminarImagenRevista(idImagen) {
    try {
        const pool = await poolPromise;
        const result = await pool.request()
            .input('IdImagenRevistaVehicular', sql.BigInt, idImagen)
            .execute('RV_EliminarImagenRevistaVehicular');

        if (result.rowsAffected[0] === 0) {
            throw new Error('Imagen no encontrada');
        }

        return { success: true };
    } catch (err) {
        throw new Error('Error al eliminar la imagen: ' + err.message);
    }
}
/**
 * Obtiene los detalles de una inspección vehicular por su ID consultando directamente las tablas.
 * @param {number} idRV - ID de la inspección vehicular.
 * @returns {Object} - Resultado con data (detalles de la inspección) y returnValue.
 */
async function obtenerRevistaPorId(idRV) {
    try {
        const pool = await poolPromise;
        const result = await pool.request()
            .input('IdRevistaVehicular', sql.BigInt, idRV)
            .query(`
                SELECT 
                    rv.IdRevistaVehicular,
                    rv.IdConsesion,
                    rv.Inspector,
                    DATEPART(DAY, rv.FechaInspeccion) AS DiaInspeccion,
                    DATEPART(MONTH, rv.FechaInspeccion) AS MesInspeccion,
                    DATEPART(YEAR, rv.FechaInspeccion) AS AnioInspeccion,
                    prop.NombreCompletoNA,
                    ISNULL(propInfo.Telefono, '') AS Telefono,
                    ct.Tramite,
                    cmun.Nombre AS Municipio,
                    cmod.Modalidad,
                    vehM.Marca,
                    veh.NumeroMotor,
                    veh.Anio AS Modelo,
                    veh.NumeroSerie,
                    rv.Placa AS PlacaAsignada,
                    vehT.TipoVehiculo,
                    vehS.SubMarca,
                    cda.NombreAseguradora AS ciaAseguradora,
                    cda.NumeroPoliza,
                    cda.FechaVencimiento,
                    rv.PlacaDelanteraVer AS PlacaDelantera,
                    rv.PlacaTraseraVer AS PlacaTrasera,
                    rv.CalcaVerificacionVer AS CalcaVerificacionVer,
                    rv.CalcaTenenciaVer AS CalcaTenenciaVer,
                    rv.PinturaCarroceriaVer AS PinturaCarroceriaVer,
                    rv.EstadoLlantasVer AS EstadoLlantasVer,
                    rv.DefensasVer AS DefensasVer,
                    rv.VidriosVer AS VidriosVer,
                    rv.LimpiadoresVer AS LimpiadoresVer,
                    rv.EspejosVer AS EspejosVer,
                    rv.LlantaRefaccionVer AS LlantaRefaccionVer,
                    rv.ParabrisasMedallonVer AS ParabrisasMedallonVer,
                    rv.ClaxonVer AS ClaxonVer,
                    rv.LuzBajaVer AS LuzBajaVer,
                    rv.LuzAltaVer AS LuzAltaVer,
                    rv.CuartosVer AS CuartosVer,
                    rv.DireccionalesVer AS DireccionalesVer,
                    rv.IntermitentesVer AS IntermitentesVer,
                    rv.StopVer AS StopVer,
                    rv.TimbreVer AS TimbreVer,
                    rv.EstinguidorVer AS EstinguidorVer,
                    rv.HerramientaVer AS HerramientaVer,
                    rv.SistemaFrenadoVer AS SistemaFrenadoVer,
                    rv.SistemaDireccionVer AS SistemaDireccionVer,
                    rv.SistemaSuspensionVer AS SistemaSuspensionVer,
                    rv.InterioresVer AS InterioresVer,
                    rv.BotiquinVer AS BotiquinVer,
                    rv.CinturonSeguridadVer AS CinturonSeguridadVer,
                    rv.Observaciones,
                    rv.Aprobado AS Aprobado,
                    rv.ImagenCromaticaVer AS ImagenCromaticaVer
                FROM dbo.RevistaVehicular AS rv 
                INNER JOIN Catalogo.Tramite AS ct ON rv.IdTramite = ct.IdTramite 
                INNER JOIN Concesion.Concesion AS cc ON rv.IdConsesion = cc.IdConcesion 
                INNER JOIN Concesion.DatosAseguradora AS cda ON cc.IdConcesion = cda.IdConcesion 
                INNER JOIN Catalogo.Municipio AS cmun ON cc.IdMunicipioAutorizado = cmun.IdMunicipio 
                    AND cc.IdEstadoExpedicion = cmun.IdEstado 
                INNER JOIN Concesion.Modalidad AS cmod ON cc.IdModalidad = cmod.IdModalidad 
                LEFT OUTER JOIN Concesion.Submodalidad AS csubmod ON cc.IdSubmodalidad = csubmod.IdSubmodalidad 
                    AND LEN(csubmod.NumeroSubserie) > 0 
                INNER JOIN Concesion.Servicio AS cser ON cc.IdServicio = cser.IdServicio 
                INNER JOIN [${process.env.DB_VEHICLE_NAME}].dbo.Propietario AS prop ON prop.IdPropietario = cc.IdPropietario 
                LEFT OUTER JOIN [${process.env.DB_VEHICLE_NAME}].Propietario.Direccion AS propInfo ON propInfo.IdPropietario = cc.IdPropietario 
                INNER JOIN [${process.env.DB_VEHICLE_NAME}].dbo.Vehiculo AS veh ON veh.IdVehiculo = cc.IdVehiculo 
                INNER JOIN [${process.env.DB_VEHICLE_NAME}].Vehiculo.Marca AS vehM ON vehM.IdMarca = veh.IdMarca 
                INNER JOIN [${process.env.DB_VEHICLE_NAME}].Vehiculo.SubMarca AS vehS ON vehS.IdSubMarca = veh.IdSubMarca 
                INNER JOIN [${process.env.DB_VEHICLE_NAME}].Vehiculo.Tipo AS vehT ON vehT.IdTipoVehiculo = veh.IdTipo 
                    AND veh.IdClase = vehT.IdClase
                WHERE rv.IdRevistaVehicular = @IdRevistaVehicular
            `);

        if (result.recordset.length === 0) {
            return { data: null, returnValue: 0 };
        }

        return {
            data: result.recordset[0],
            returnValue: 1
        };
    } catch (err) {
        throw new Error('Error al obtener la inspección: ' + err.message);
    }
}
/**
 * Obtiene los tipos de imagen disponibles para revistas vehiculares.
 * @async
 * @function obtenerTiposImagen
 * @returns {Promise<Object>} Objeto con los resultados:
 * - `data`: Array de tipos de imagen devueltos por el procedimiento `RV_ObtenerTipoImagen`.
 * - `returnValue`: Valor de retorno del procedimiento almacenado.
 * @throws {Error} Si ocurre un error al ejecutar el procedimiento, con el mensaje "Error al obtener tipos de imagen: [mensaje de error]".
 */
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
/**
 * Modifica los datos del vehículo y la aseguradora para una concesión específica.
 * @async
 * @function modificarVehiculoYAseguradora
 * @param {Object} vehiculoData - Datos del vehículo para emular CV_ModificarVehiculo.
 * @param {Object} seguroData - Datos de la aseguradora para el procedimiento AseguradoraInsertar.
 * @param {Object} userData - Datos del usuario (idUsuario, idPerfil, idSmartCard, idDelegacion).
 * @returns {Promise<Object>} Objeto con `idVehiculo` (ID del vehículo modificado) y `returnValue`.
 * @throws {Error} Si falla la ejecución de las consultas o procedimientos.
 */
<<<<<<< HEAD
// async function modificarVehiculoYAseguradora(vehiculoData, seguroData) {
//     try {
//         // Modificar vehículo usando poolVehiclePromise
//         const poolVehicle = await poolVehiclePromise;
//         const vehicleRequest = poolVehicle.request();
//         vehicleRequest.input('Anio', sql.Int, vehiculoData.Modelo);
//         vehicleRequest.input('NumeroPasajeros', sql.Int, vehiculoData.NumeroPasajeros);
//         vehicleRequest.input('Capacidad', sql.VarChar(15), vehiculoData.Capacidad);
//         vehicleRequest.input('Cilindros', sql.Int, vehiculoData.Cilindros);
//         vehicleRequest.input('Clase', sql.VarChar(50), vehiculoData.Clase);
//         vehicleRequest.input('ClaveVehicular', sql.VarChar(50), vehiculoData.ClaveVehicular);
//         vehicleRequest.input('Color', sql.VarChar(50), vehiculoData.Color);
//         vehicleRequest.input('Combustible', sql.VarChar(50), vehiculoData.Combustible);
//         vehicleRequest.input('servicio', sql.VarChar(100), vehiculoData.servicio);
//         vehicleRequest.input('IdVersion', sql.Int, vehiculoData.IdVersion);//me falta agregar la version en select
//         vehicleRequest.input('Marca', sql.VarChar(50), vehiculoData.Marca);
//         vehicleRequest.input('NRPV', sql.VarChar(20), vehiculoData.NRPV);
//         vehicleRequest.input('NumeroMotor', sql.VarChar(50), vehiculoData.NumeroMotor);
//         vehicleRequest.input('NumeroPuertas', sql.Int, vehiculoData.NumeroPuertas);
//         vehicleRequest.input('NumeroSerie', sql.VarChar(50), vehiculoData.NumeroSerie);
//         vehicleRequest.input('Origen', sql.VarChar(50), vehiculoData.Origen);
//         vehicleRequest.input('PlacaAnterior', sql.VarChar(20), vehiculoData.PlacaAnterior);
//         vehicleRequest.input('PlacaAsignada', sql.VarChar(20), vehiculoData.PlacaAsignada);
//         vehicleRequest.input('RFV', sql.VarChar(50), vehiculoData.RFV);
//         vehicleRequest.input('Submarca', sql.VarChar(50), vehiculoData.Submarca);
//         vehicleRequest.input('Tipo', sql.VarChar(50), vehiculoData.Tipo);
//         vehicleRequest.input('Uso', sql.VarChar(50), vehiculoData.Uso);
//         vehicleRequest.input('Version', sql.VarChar(50), vehiculoData.Version);
//         vehicleRequest.input('IdTipoPlaca', sql.Int, vehiculoData.IdTipoPlaca);
//         vehicleRequest.input('NumeroToneladas', sql.VarChar(10), vehiculoData.NumeroToneladas);
//         vehicleRequest.input('idPropietario', sql.Int, vehiculoData.idPropietario);

//         const vehicleResult = await vehicleRequest.execute('CV_ModificarVehiculo');
//         const idVehiculo = vehicleResult.recordset[0]?.[''];

//         // Modificar o insertar aseguradora usando poolPromise
//         const pool = await poolPromise;
//         const insuranceRequest = pool.request();
//         insuranceRequest.input('idConcesion', sql.Int, seguroData.idConcesion);
//         insuranceRequest.input('nombre', sql.VarChar(150), seguroData.nombre);
//         insuranceRequest.input('numeroPoliza', sql.VarChar(50), seguroData.numeroPoliza);
//         insuranceRequest.input('fechaExp', sql.Date, seguroData.fechaExp);
//         insuranceRequest.input('fechaVence', sql.Date, seguroData.fechaVence);
//         insuranceRequest.input('folioPago', sql.VarChar(50), seguroData.folioPago);
//         insuranceRequest.input('observaciones', sql.VarChar(5000), seguroData.observaciones);
//         insuranceRequest.input('idUsuario', sql.Int, seguroData.idUsuario || 0);
//         insuranceRequest.input('idPerfil', sql.Int, seguroData.idPerfil || 0);
//         insuranceRequest.input('idSmartCard', sql.Int, seguroData.idSmartCard || 0);
//         insuranceRequest.input('idDelegacion', sql.TinyInt, seguroData.idDelegacion || 0);

//         await insuranceRequest.execute('AseguradoraInsertar');

//         return {
//             idVehiculo,
//             returnValue: 0
//         };
//     } catch (err) {
//         console.error('🔥 Error detallado:', {
//             message: err.message,
//             stack: err.stack,
//             sqlError: err.originalError?.info?.message,
//             params: {
//                 vehiculo: vehiculoData,
//                 seguro: seguroData
//             }
//         });
//         throw new Error(`Error al modificar vehículo y aseguradora: ${err.message}`);
//     }
// }
async function modificarVehiculoYAseguradora(vehiculoData, seguroData) {
  try {
    // 🔄 Transformar nombres del frontend al formato que espera el backend
    const vehiculo = {
      Anio: parseInt(vehiculoData.Modelo) || 0,
      NumeroPasajeros: parseInt(vehiculoData.NumeroPasajeros) || 0,
      Capacidad: vehiculoData.Capacidad || "",
      Cilindros: parseInt(vehiculoData.Cilindros) || 0,
      Clase: vehiculoData.Clase || "",
      ClaveVehicular: vehiculoData.ClaveVehicular || "",
      Color: vehiculoData.Color || "",
      Combustible: vehiculoData.Combustible || "",
      servicio: vehiculoData.servicio || "",
      IdVersion: parseInt(vehiculoData.IdVersion) || 0,
      Marca: vehiculoData.Marca || "",
      NRPV: vehiculoData.NRPV || "",
      NumeroMotor: vehiculoData.NumeroMotor || "",
      NumeroPuertas: parseInt(vehiculoData.NumeroPuertas) || 0,
      NumeroSerie: vehiculoData.NumeroSerie || "",
      Origen: vehiculoData.Origen || "",
      PlacaAnterior: vehiculoData.PlacaAnterior || "",
      PlacaAsignada: vehiculoData.PlacaAsignada || "",
      RFV: vehiculoData.RFV || "",
      Submarca: vehiculoData.Submarca || "",
      Tipo: vehiculoData.Tipo || "",
      Uso: vehiculoData.Uso || "",
      Version: vehiculoData.Version || "",
      IdTipoPlaca: parseInt(vehiculoData.IdTipoPlaca) || 0,
      NumeroToneladas: vehiculoData.NumeroToneladas || "",
      idPropietario: parseInt(vehiculoData.IdPropietario) || 0
    };

    const poolVehicle = await poolVehiclePromise;
    const vehicleRequest = poolVehicle.request();

    // Enviar los campos esperados por el SP
    vehicleRequest.input('Anio', sql.Int, vehiculo.Anio);
    vehicleRequest.input('NumeroPasajeros', sql.Int, vehiculo.NumeroPasajeros);
    vehicleRequest.input('Capacidad', sql.VarChar(15), vehiculo.Capacidad);
    vehicleRequest.input('Cilindros', sql.Int, vehiculo.Cilindros);
    vehicleRequest.input('Clase', sql.VarChar(50), vehiculo.Clase);
    vehicleRequest.input('ClaveVehicular', sql.VarChar(50), vehiculo.ClaveVehicular);
    vehicleRequest.input('Color', sql.VarChar(50), vehiculo.Color);
    vehicleRequest.input('Combustible', sql.VarChar(50), vehiculo.Combustible);
    vehicleRequest.input('servicio', sql.VarChar(100), vehiculo.servicio);
    vehicleRequest.input('IdVersion', sql.Int, vehiculo.IdVersion);
    vehicleRequest.input('Marca', sql.VarChar(50), vehiculo.Marca);
    vehicleRequest.input('NRPV', sql.VarChar(20), vehiculo.NRPV);
    vehicleRequest.input('NumeroMotor', sql.VarChar(50), vehiculo.NumeroMotor);
    vehicleRequest.input('NumeroPuertas', sql.Int, vehiculo.NumeroPuertas);
    vehicleRequest.input('NumeroSerie', sql.VarChar(50), vehiculo.NumeroSerie);
    vehicleRequest.input('Origen', sql.VarChar(50), vehiculo.Origen);
    vehicleRequest.input('PlacaAnterior', sql.VarChar(20), vehiculo.PlacaAnterior);
    vehicleRequest.input('PlacaAsignada', sql.VarChar(20), vehiculo.PlacaAsignada);
    vehicleRequest.input('RFV', sql.VarChar(50), vehiculo.RFV);
    vehicleRequest.input('Submarca', sql.VarChar(50), vehiculo.Submarca);
    vehicleRequest.input('Tipo', sql.VarChar(50), vehiculo.Tipo);
    vehicleRequest.input('Uso', sql.VarChar(50), vehiculo.Uso);
    vehicleRequest.input('Version', sql.VarChar(50), vehiculo.Version);
    vehicleRequest.input('IdTipoPlaca', sql.Int, vehiculo.IdTipoPlaca);
    vehicleRequest.input('NumeroToneladas', sql.VarChar(10), vehiculo.NumeroToneladas);
    vehicleRequest.input('idPropietario', sql.Int, vehiculo.idPropietario);
=======
async function modificarVehiculoYAseguradora(vehiculoData, seguroData, userData) {
    let transaction;
    try {
        const poolVehicle = await poolVehiclePromise;
        transaction = new sql.Transaction(poolVehicle);
        await transaction.begin();

        const request = new sql.Request(transaction);

        // Obtener IDs de catálogos usando CV_ObtenerIDSVehiculo (como función con valores de tabla)
        request.input('Clase', sql.VarChar(50), vehiculoData.Clase);
        request.input('Color', sql.VarChar(50), vehiculoData.Color);
        request.input('Combustible', sql.VarChar(50), vehiculoData.Combustible);
        request.input('Marca', sql.VarChar(50), vehiculoData.Marca);
        request.input('Origen', sql.VarChar(50), vehiculoData.Origen);
        request.input('Submarca', sql.VarChar(50), vehiculoData.Submarca);
        request.input('Tipo', sql.VarChar(50), vehiculoData.Tipo);
        request.input('Uso', sql.VarChar(50), vehiculoData.Uso);
        request.input('IdTipoPlaca', sql.Int, vehiculoData.IdTipoPlaca);

        const idsResult = await request.query(`
            SELECT IdClase, IdColor, IdCombustible, IdMarca, ClaveOrigen, IdSubMarca, IdTipo, IdUso, IdTipoPlaca
            FROM dbo.CV_ObtenerIDSVehiculo(@Clase, @Color, @Combustible, @Marca, @Origen, @Submarca, @Tipo, @Uso, @IdTipoPlaca)
        `);
        const ids = idsResult.recordset[0] || {};
        let IdClase = ids.IdClase;
        let IdColor = ids.IdColor;
        let IdCombustible = ids.IdCombustible;
        let IdMarca = ids.IdMarca;
        let ClaveOrigen = ids.ClaveOrigen;
        let IdSubMarca = ids.IdSubMarca;
        let IdTipo = ids.IdTipo;
        let IdUso = ids.IdUso;
        let IdTipoPlacaWP = ids.IdTipoPlaca || vehiculoData.IdTipoPlaca;

        // Obtener IdServicio usando CV_ObtenerIDServicio (como función con valores de tabla)
        request.input('servicio', sql.VarChar(100), vehiculoData.servicio);
        const servicioResult = await request.query(`
            SELECT IdServicio
            FROM dbo.CV_ObtenerIDServicio(@servicio)
        `);
        const idServicio = servicioResult.recordset[0]?.IdServicio;

        // Obtener IdCategoria, IdMarca, IdSubMarca, IdVersion usando fn_ObtenerMarcaSubmarcaVersionCategoria
        request.input('ClaveVehicular', sql.VarChar(50), vehiculoData.ClaveVehicular);
        request.input('Version', sql.VarChar(50), vehiculoData.Version);
        const categoriaResult = await request.query(`
            SELECT IdCategoria, IdMarca, IdSubmarca, IdVersion
            FROM dbo.fn_ObtenerMarcaSubmarcaVersionCategoria(@ClaveVehicular, @Marca, @Submarca, @Version)
        `);
        const categoriaData = categoriaResult.recordset[0] || {};
        let IdCategoria = categoriaData.IdCategoria || 0;
        IdMarca = categoriaData.IdMarca || IdMarca;
        IdSubMarca = categoriaData.IdSubmarca || IdSubMarca;
        let IdVersion = categoriaData.IdVersion || vehiculoData.IdVersion;

        // Manejo de catálogos si no existen
        if (!IdClase || IdClase === 0) {
            const insertClase = await request.query(`
                INSERT INTO Vehiculo.Clase (Clase, Activo)
                OUTPUT inserted.IdClase
                VALUES (@Clase, 1)
            `);
            IdClase = insertClase.recordset[0].IdClase;
        }

        if (!IdTipo || IdTipo === 0) {
            const maxTipo = await request.query(`
                SELECT ISNULL(MAX(IdTipoVehiculo), 0) + 1 AS NewIdTipo
                FROM Vehiculo.Tipo
                WHERE IdClase = @IdClase
            `);
            IdTipo = maxTipo.recordset[0].NewIdTipo;
            await request.query(`
                INSERT INTO Vehiculo.Tipo (IdClase, IdTipoVehiculo, TipoVehiculo)
                VALUES (@IdClase, @IdTipo, @Tipo)
            `);
        }

        if (!IdUso || IdUso === 0) {
            const insertUso = await request.query(`
                INSERT INTO Vehiculo.Uso (UsoVehiculo)
                OUTPUT inserted.IdUsoVehiculo
                VALUES (@Uso)
            `);
            IdUso = insertUso.recordset[0].IdUsoVehiculo;
        }

        if (!IdColor || IdColor === 0) {
            const insertColor = await request.query(`
                INSERT INTO Vehiculo.Color (Color)
                OUTPUT inserted.IdColor
                VALUES (@Color)
            `);
            IdColor = insertColor.recordset[0].IdColor;
        }

        // Actualizar vehículo
        request.input('Anio', sql.Int, vehiculoData.Anio);
        request.input('NumeroPasajeros', sql.Int, vehiculoData.NumeroPasajeros);
        request.input('Cilindros', sql.Int, vehiculoData.Cilindros);
        request.input('IdClase', sql.Int, IdClase);
        request.input('IdTipo', sql.Int, IdTipo);
        request.input('IdMarca', sql.Int, IdMarca);
        request.input('IdSubMarca', sql.Int, IdSubMarca);
        request.input('IdVersion', sql.Int, IdVersion);
        request.input('IdUso', sql.Int, IdUso);
        request.input('IdCombustible', sql.Int, IdCombustible);
        request.input('ClaveOrigen', sql.VarChar(20), ClaveOrigen);
        request.input('IdColor', sql.Int, IdColor);
        request.input('NumeroMotor', sql.VarChar(50), vehiculoData.NumeroMotor);
        request.input('RFV', sql.VarChar(50), vehiculoData.RFV);
        request.input('NumeroPuertas', sql.Int, vehiculoData.NumeroPuertas);
        request.input('NRPV', sql.VarChar(20), vehiculoData.NRPV);
        request.input('NumeroToneladas', sql.VarChar(10), vehiculoData.NumeroToneladas);
        request.input('Capacidad', sql.VarChar(15), vehiculoData.Capacidad);
        request.input('IdServicio', sql.Int, idServicio);
        request.input('IdTipoPlacaWP', sql.Int, IdTipoPlacaWP);
        request.input('IdCategoria', sql.Int, IdCategoria);
        request.input('NumeroSerie', sql.VarChar(50), vehiculoData.NumeroSerie);

        await request.query(`
            UPDATE dbo.Vehiculo
            SET Anio = @Anio,
                NumeroPasajeros = @NumeroPasajeros,
                Cilindros = @Cilindros,
                IdClase = @IdClase,
                Clase = @Clase,
                IdTipo = @IdTipo,
                Tipo = @Tipo,
                IdMarca = @IdMarca,
                Marca = @Marca,
                IdSubMarca = @IdSubMarca,
                Submarca = @Submarca,
                IdVersion = @IdVersion,
                Version = @Version,
                IdUso = @IdUso,
                Uso = @Uso,
                IdCombustible = @IdCombustible,
                Combustible = @Combustible,
                ClaveOrigen = @ClaveOrigen,
                IdColor = @IdColor,
                Color = @Color,
                NumeroMotor = @NumeroMotor,
                RFV = @RFV,
                NumeroPuertas = @NumeroPuertas,
                NRPV = @NRPV,
                ClaveVehicular = @ClaveVehicular,
                NumeroToneladas = @NumeroToneladas,
                Capacidad = @Capacidad,
                IdServicio = @IdServicio,
                IdTipoPlaca = @IdTipoPlacaWP,
                IdCategoria = @IdCategoria,
                UltimaActualizacion = GETDATE()
            WHERE NumeroSerie = @NumeroSerie
        `);

        // Obtener datos del vehículo actualizado
        const vehiculoResult = await request.query(`
            SELECT IdVehiculo, PlacaAnterior, PlacaAsignada, IdEstatus
            FROM dbo.Vehiculo
            WHERE NumeroSerie = @NumeroSerie
        `);
        const idVehiculo = vehiculoResult.recordset[0]?.IdVehiculo;

        // Insertar en bitácora usando CV_InsertarBitacoraVehiculo
        const bitacoraRequest = new sql.Request(transaction);
        bitacoraRequest.input('IdVehiculo', sql.Int, idVehiculo);
        bitacoraRequest.input('NumeroSerie', sql.VarChar(50), vehiculoData.NumeroSerie);
        bitacoraRequest.input('IdUsuario', sql.Int, userData.UserID || 0);
        bitacoraRequest.input('IdPerfil', sql.Int, userData.ProfileID || 0);
        bitacoraRequest.input('IdSmartCard', sql.Int, userData.SmartCardID || 0);
        bitacoraRequest.input('IdDelegacion', sql.Int, userData.DelegationID || 0);
        bitacoraRequest.input('IdOperacion', sql.Int, 2);

        await bitacoraRequest.execute('dbo.CV_InsertarBitacoraVehiculo');

        // Modificar o insertar aseguradora usando poolPromise
        const pool = await poolPromise;
        const insuranceRequest = pool.request();
        insuranceRequest.input('idConcesion', sql.Int, seguroData.idConcesion);
        insuranceRequest.input('nombre', sql.VarChar(150), seguroData.nombre);
        insuranceRequest.input('numeroPoliza', sql.VarChar(50), seguroData.numeroPoliza);
        insuranceRequest.input('fechaExp', sql.Date, seguroData.fechaExp);
        insuranceRequest.input('fechaVence', sql.Date, seguroData.fechaVence);
        insuranceRequest.input('folioPago', sql.VarChar(50), seguroData.folioPago);
        insuranceRequest.input('observaciones', sql.VarChar(5000), seguroData.observaciones);
        insuranceRequest.input('IdUsuario', sql.Int, userData.UserID || 0);
        insuranceRequest.input('IdPerfil', sql.Int, userData.ProfileID || 0);
        insuranceRequest.input('IdSmartCard', sql.Int, userData.SmartCardID || 0);
        insuranceRequest.input('IdDelegacion', sql.TinyInt, userData.DelegationID || 0);
>>>>>>> 806dd7cf6f0fbe56e8027c3e145b141e4c6d89f5

    const vehicleResult = await vehicleRequest.execute('CV_ModificarVehiculo');
    const idVehiculo = vehicleResult.recordset[0]?.['IdVehiculo'] || 0;

<<<<<<< HEAD
    // 👮 Modificar o insertar aseguradora
    const pool = await poolPromise;
    const insuranceRequest = pool.request();
    insuranceRequest.input('idConcesion', sql.Int, seguroData.idConcesion);
    insuranceRequest.input('nombre', sql.VarChar(150), seguroData.nombre);
    insuranceRequest.input('numeroPoliza', sql.VarChar(50), seguroData.numeroPoliza);
    insuranceRequest.input('fechaExp', sql.Date, seguroData.fechaExp);
    insuranceRequest.input('fechaVence', sql.Date, seguroData.fechaVence);
    insuranceRequest.input('folioPago', sql.VarChar(50), seguroData.folioPago);
    insuranceRequest.input('observaciones', sql.VarChar(5000), seguroData.observaciones);
    insuranceRequest.input('idUsuario', sql.Int, seguroData.idUsuario || 0);
    insuranceRequest.input('idPerfil', sql.Int, seguroData.idPerfil || 0);
    insuranceRequest.input('idSmartCard', sql.Int, seguroData.idSmartCard || 0);
    insuranceRequest.input('idDelegacion', sql.TinyInt, seguroData.idDelegacion || 0);

    await insuranceRequest.execute('AseguradoraInsertar');

    return {
      idVehiculo,
      returnValue: 0
    };
  } catch (err) {
    console.error('🔥 Error detallado:', {
      message: err.message,
      stack: err.stack,
      sqlError: err.originalError?.info?.message,
      params: {
        vehiculo: vehiculoData,
        seguro: seguroData
      }
    });
    throw new Error(`Error al modificar vehículo y aseguradora: ${err.message}`);
  }
=======
        await transaction.commit();

        return {
            idVehiculo,
            returnValue: 0
        };
    } catch (err) {
        if (transaction) await transaction.rollback();
        throw new Error(`Error al modificar vehículo y aseguradora: ${err.message}`);
    }
>>>>>>> 806dd7cf6f0fbe56e8027c3e145b141e4c6d89f5
}

/**
 * Obtiene la lista de clases de vehículos.
 * @async
 * @function obtenerClasesVehiculo
 * @returns {Promise<Object>} Objeto con `data` (lista de clases) y `returnValue`.
 * @throws {Error} Si falla la ejecución del procedimiento.
 */
async function obtenerClasesVehiculo() {
    try {
        const poolVehicle = await poolVehiclePromise;
        const request = poolVehicle.request();
        const result = await request.execute('CV_ObtenerClases');
        return {
            data: result.recordset,
            returnValue: result.returnValue
        };
    } catch (err) {
        throw new Error(`Error al ejecutar CV_ObtenerClases: ${err.message}`);
    }
}

/**
 * Obtiene la lista de tipos de vehículos.
 * @async
 * @function obtenerTiposVehiculo
 * @returns {Promise<Object>} Objeto con `data` (lista de tipos) y `returnValue`.
 * @throws {Error} Si falla la ejecución del procedimiento.
 */
async function obtenerTiposVehiculo() {
    try {
        const poolVehicle = await poolVehiclePromise;
        const request = poolVehicle.request();
        const result = await request.execute('CV_ObtenerTipoVehiculo');
        return {
            data: result.recordset,
            returnValue: result.returnValue
        };
    } catch (err) {
        throw new Error(`Error al ejecutar CV_ObtenerTipoVehiculo: ${err.message}`);
    }
}

/**
 * Obtiene la lista de categorías de vehículos por ID de clase.
 * @async
 * @param {number} idClase - ID de la clase del vehículo.
 * @returns {Promise<Object>} Objeto con `data` (lista de categorías) y `returnValue`.
 * @throws {Error} Si falla la ejecución del procedimiento.
 */
async function obtenerCategoriasVehiculo(idClase) {
    try {
        const poolVehicle = await poolVehiclePromise;
        const request = poolVehicle.request();
        request.input('IdClase', sql.Int, idClase);
        const result = await request.execute('CV_ObtenerCategoriaVehiculo');
        return {
            data: result.recordset,
            returnValue: result.returnValue
        };
    } catch (err) {
        throw new Error(`Error al ejecutar CV_ObtenerCategoriaVehiculo: ${err.message}`);
    }
}

/**
 * Obtiene la lista de marcas de vehículos por clave de categoría.
 * @async
 * @function obtenerMarcasVehiculo
 * @param {string} claveCategoria - Clave de la categoría del vehículo.
 * @returns {Promise<Object>} Objeto con `data` (lista de marcas) y `returnValue`.
 * @throws {Error} Si falla la ejecución del procedimiento.
 */
async function obtenerMarcasVehiculo(claveCategoria) {
    try {
        const poolVehicle = await poolVehiclePromise;
        const request = poolVehicle.request();
        request.input('ClaveCategoria', sql.NVarChar, claveCategoria);
        const result = await request.execute('CV_ObtenerMarcasVehiculo');
        return {
            data: result.recordset,
            returnValue: result.returnValue
        };
    } catch (err) {
        throw new Error(`Error al ejecutar CV_ObtenerMarcasVehiculo: ${err.message}`);
    }
}

/**
 * Obtiene la lista de submarcas por marca y categoría.
 * @async
 * @function obtenerSubmarcasPorMarcaCategoria
 * @param {number} idMarca - ID de la marca del vehículo.
 * @param {number} idCategoria - ID de la categoría del vehículo.
 * @returns {Promise<Object>} Objeto con `data` (lista de submarcas) y `returnValue`.
 * @throws {Error} Si falla la ejecución del procedimiento.
 */
async function obtenerSubmarcasPorMarcaCategoria(idMarca, idCategoria) {
    try {
        const poolVehicle = await poolVehiclePromise;
        const request = poolVehicle.request();
        request.input('IdMarca', sql.Int, idMarca);
        request.input('IdCategoria', sql.Int, idCategoria);
        const result = await request.execute('CV_ObtenerSubmarcaPorMarcaCategoria');
        return {
            data: result.recordset,
            returnValue: result.returnValue
        };
    } catch (err) {
        throw new Error(`Error al ejecutar CV_ObtenerSubmarcaPorMarcaCategoria: ${err.message}`);
    }
}

/**
 * Obtiene la lista de versiones por clase y submarca.
 * @async
 * @function obtenerVersionesPorClaseSubmarca
 * @param {number} idClase - ID de la clase del vehículo.
 * @param {number} idSubMarca - ID de la submarca del vehículo.
 * @returns {Promise<Object>} Objeto con `data` (lista de versiones) y `returnValue`.
 * @throws {Error} Si falla la ejecución del procedimiento.
 */
async function obtenerVersionesPorClaseSubmarca(idClase, idSubMarca) {
    try {
        const poolVehicle = await poolVehiclePromise;
        const request = poolVehicle.request();
        request.input('idClase', sql.Int, idClase);
        request.input('idSubMarca', sql.Int, idSubMarca);
        const result = await request.execute('CV_ObtenerVersionPorClaseSubmarca');
        return {
            data: result.recordset,
            returnValue: result.returnValue
        };
    } catch (err) {
        throw new Error(`Error al ejecutar CV_ObtenerVersionPorClaseSubmarca: ${err.message}`);
    }
}
/**
 * Busca revistas vehiculares según criterios específicos, usando procedimientos almacenados.
 * @async
 * @function buscarRevistasVehiculares
 * @param {number} [noConcesion] - Número de concesión para filtrar revistas (opcional).
 * @param {string} [placa] - Placa del vehículo para filtrar revistas (opcional).
 * @param {number} [estatus] - ID del estatus de la revista (opcional, null si no se filtra por estatus).
 * @param {string|Date} [fechaInicio] - Fecha de inicio para filtrar inspecciones (formato 'YYYY-MM-DD', opcional, por defecto '2000-01-01').
 * @param {string|Date} [fechaFin] - Fecha de fin para filtrar inspecciones (formato 'YYYY-MM-DD', opcional, por defecto fecha actual).
 * @param {number} [page=1] - Número de página para paginación.
 * @param {number} [pageSize=10] - Cantidad de registros por página.
 * @returns {Promise<Object>} Objeto con los resultados de la búsqueda:
 * - `data`: Array de revistas vehiculares con sus detalles y el campo `Estatus` enriquecido (mapeado desde `IdEstatus`).
 * - `totalRecords`: Número total de registros devueltos.
 * - `page`: Página actual.
 * - `pageSize`: Tamaño de la página.
 * - `returnValue`: Valor de retorno (0 para éxito).
 * @throws {Error} Si ocurre un error al ejecutar el procedimiento almacenado, con el mensaje "Error al buscar revistas vehiculares: [mensaje de error]".
 */
async function buscarRevistasVehiculares(noConcesion, placa, estatus, fechaInicio, fechaFin, page = 1, pageSize = 10) {
    try {
        const pool = await poolPromise;
        const request = pool.request();

        let procedure = '';
        let params = {};

        // Determinar el procedimiento base
        if (noConcesion) {
            procedure = 'RV_ObtenerListaRevistaPorConcesion';
            request.input('numeroConcesion', sql.Int, noConcesion);
        } else if (placa) {
            procedure = 'RV_ObtenerListaRevistaPorPlaca';
            request.input('placa', sql.NVarChar(15), placa);
        } else {
            procedure = 'RV_ObtenerListaRevista';
        }

        // Configurar parámetros comunes
        request.input('objetosPorPagina', sql.Int, pageSize);
        request.input('pagina', sql.Int, page);
        request.input('estatus', sql.Int, estatus || null);
        request.input('fechaInspeccionInicio', sql.DateTime, fechaInicio || '2000-01-01 00:00:00.000');
        request.input('fechaInspeccionFin', sql.DateTime, fechaFin || new Date());

        // Ejecutar el procedimiento
        const result = await request.execute(procedure);

        // Filtrar por placa si se proporcionó y se usó RV_ObtenerListaRevistaPorConcesion
        let filteredData = result.recordset;
        if (noConcesion && placa) {
            filteredData = result.recordset.filter(item => item.Placa === placa);
        }
        const enrichedData = filteredData.map(item => {
            return {
                ...item,
                Estatus: revistaEstatusMap.get(item.IdEstatus) || 'Desconocido'
            };
        });

        return {
            data: enrichedData,
            totalRecords: enrichedData.length,
            page: page,
            pageSize: pageSize,
            returnValue: 0
        };
    } catch (err) {
        throw new Error(`Error al buscar revistas vehiculares: ${err.message}`);
    }
}
/**
 * Registra la impresión de una revista vehicular.
 * @param {number} idRV - ID de la inspección vehicular.
 * @param {number} idUsuario - ID del usuario que registra la impresión.
 * @param {string} folio - Folio de la revista (opcional, por defecto '').
 * @returns {Object} - Resultado con success.
 */
async function imprimirRevista(idRV, idUsuario, folio = '') {
    try {
        const pool = await poolPromise;
        const request = pool.request()
            .input('idRevistaVehicular', sql.BigInt, idRV)
            .input('idUsuario', sql.Int, idUsuario)
            .input('folio', sql.NVarChar(20), folio);

        await request.query(`
            INSERT INTO [${process.env.DB_NAME}].[RevistaVehicular].[Historial]
                ([IdRevistaVehicular], [IdOperacion], [IdUsuario], [Fecha])
            VALUES
                (@idRevistaVehicular, 2, @idUsuario, GETDATE())
        `);

        await request.query(`
            UPDATE [${process.env.DB_NAME}].[dbo].[RevistaVehicular]
            SET IdEstatus = 2, Folio = @folio
            WHERE IdRevistaVehicular = @idRevistaVehicular
        `);

        return { success: true };
    } catch (err) {
        throw new Error(err.message);
    }
}

module.exports = {
    obtenerInformacionCompletaPorConcesion,
    obtenerConcesionPorId,
    obtenerConcesionPorFolio,
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
    eliminarImagenRevista,
    obtenerRevistaPorId,
    obtenerTiposImagen,
    obtenerVehiculoYAseguradora,
    generarReporte,
    modificarVehiculoYAseguradora,
    obtenerClasesVehiculo,
    obtenerTiposVehiculo,
    obtenerCategoriasVehiculo,
    obtenerMarcasVehiculo,
    obtenerSubmarcasPorMarcaCategoria,
    obtenerVersionesPorClaseSubmarca,
    buscarRevistasVehiculares,
    imprimirRevista
};