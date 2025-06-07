const poolPromise = require('../config/db');
const poolVehiclePromise = require('../config/dbVehicle');
const sql = require('mssql');

let generoMap = new Map();
let nacionalidadMap = new Map();

// Función para inicializar los catálogos
async function initializeCatalogs() {
    try {
        const pool = await poolPromise;
        const generoResult = await pool.request().query('SELECT [IdGenero], [Genero] FROM [Catalogo].[Genero]');
        generoMap = new Map(generoResult.recordset.map(item => [item.IdGenero, item.Genero]));

        const nacionalidadResult = await pool.request().query('SELECT [IdNacionalidad], [Nacionalidad] FROM [Catalogo].[Nacionalidad]');
        nacionalidadMap = new Map(nacionalidadResult.recordset.map(item => [item.IdNacionalidad, item.Nacionalidad]));
    } catch (err) {
        console.error('Error al inicializar los catálogos:', err.message);
        throw err;
    }
}

// Llamar a initializeCatalogs al cargar el módulo
initializeCatalogs().catch(err => console.error('Fallo al inicializar catálogos:', err));

// Función para mapear un ID a su valor descriptivo
function mapCatalogValue(id, catalogMap) {
    return catalogMap.get(parseInt(id)) || id; // Devuelve el valor descriptivo o el ID si no se encuentra
}

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

module.exports = {
    obtenerInformacionCompletaPorConcesion,
    obtenerConcesionPorId,
    obtenerConcesionPorFolioPlaca,
    obtenerConcesionarioPorId,
    obtenerConcesionariosPorNombre,
    obtenerConcesionesPorConcesionario,
    obtenerBeneficiariosPorConcesionario,
    obtenerDireccionesPorConcesionario,
    obtenerReferenciasPorConcesionario,
    obtenerSeguroPorConcesion,
    obtenerVehiculoPorId
};