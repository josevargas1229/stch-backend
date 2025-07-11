/**
 * Módulo de configuración de conexión a la base de datos de Control Vehicular.
 * @module dbVehicle
 */
require('dotenv').config();
const sql = require('mssql');

/**
 * Configuración de la conexión a la base de datos de vehículos.
 * @typedef {Object} dbConfig
 * @property {string} user - Nombre de usuario de la base de datos (de variable de entorno DB_USER).
 * @property {string} password - Contraseña de la base de datos (de variable de entorno DB_PASSWORD).
 * @property {string} server - Servidor de la base de datos (de variable de entorno DB_SERVER).
 * @property {string} database - Nombre de la base de datos (de variable de entorno DB_VEHICLE_NAME).
 * @property {Object} options - Opciones de conexión.
 * @property {boolean} options.encrypt - Habilita el cifrado (falso por ahora).
 * @property {boolean} options.trustServerCertificate - Confía en el certificado del servidor (verdadero para pruebas locales).
 * @property {Object} pool - Configuración del pool de conexiones.
 * @property {number} pool.max - Número máximo de conexiones (10).
 * @property {number} pool.min - Número mínimo de conexiones (0).
 * @property {number} pool.idleTimeoutMillis - Tiempo de espera en milisegundos para conexiones inactivas (30000 ms).
 */
const dbConfig = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    database: process.env.DB_VEHICLE_NAME,
    port: parseInt(process.env.PORT_DB || 1433),
    options: {
        encrypt: false,
        trustServerCertificate: true
    },
    pool: {
        max: 10,
        min: 0,
        idleTimeoutMillis: 30000
    }
};

/**
 * Ajusta la configuración para usar autenticación de Windows si no se proporcionan credenciales.
 * @function adjustWindowsAuth
 * @description Elimina user y password, y habilita trustedConnection si DB_USER o DB_PASSWORD no están definidos.
 */
if (!process.env.DB_USER || !process.env.DB_PASSWORD) {
    delete dbConfig.user;
    delete dbConfig.password;
    dbConfig.options.trustedConnection = true; // Habilita autenticación de Windows
}

/**
 * Promesa que crea un pool de conexiones a la base de datos de vehículos.
 * @type {Promise<sql.ConnectionPool>}
 * @description Intenta conectar y registra el éxito o falla. Termina el proceso si hay un error.
 */
const poolPromise = new sql.ConnectionPool(dbConfig)
    .connect()
    .then(pool => {
        console.log(`Conectado a la base de datos de vehiculos`);
        return pool;
    })
    .catch(err => {
        console.error('Error al conectar con la base de datos de vehículos:', err.message);
        process.exit(1);
    });

module.exports = poolPromise;