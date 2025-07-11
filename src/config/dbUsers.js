/**
 * Módulo de configuración de conexión a la base de datos de usuarios.
 * @module dbUsers
 */
require('dotenv').config();
const sql = require('mssql');

/**
 * Configuración de la conexión a la base de datos de usuarios.
 * @typedef {Object} dbConfig
 * @property {string} user - Nombre de usuario de la base de datos.
 * @property {string} password - Contraseña de la base de datos.
 * @property {string} server - Servidor de la base de datos.
 * @property {string} database - Nombre de la base de datos.
 * @property {Object} options - Opciones de conexión.
 * @property {boolean} options.encrypt - Habilita el cifrado.
 * @property {boolean} options.trustServerCertificate - Confía en el certificado del servidor.
 * @property {Object} pool - Configuración del pool de conexiones.
 * @property {number} pool.max - Número máximo de conexiones.
 * @property {number} pool.min - Número mínimo de conexiones.
 * @property {number} pool.idleTimeoutMillis - Tiempo de espera para conexiones inactivas.
 */
const dbConfig = {
    user: process.env.DB_USER_USERS,
    password: process.env.DB_PASSWORD_USERS,
    server: process.env.DB_SERVER_USERS,
    database: process.env.DB_USERS_NAME,
    port: parseInt(process.env.PORT_DB_USERS || 1433),
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
 */
if (!process.env.DB_USER_USERS || !process.env.DB_PASSWORD_USERS) {
    delete dbConfig.user;
    delete dbConfig.password;
    dbConfig.options.trustedConnection = true;
}

/**
 * Promesa que crea un pool de conexiones a la base de datos de usuarios.
 * @type {Promise<sql.ConnectionPool>}
 */
const poolPromise = new sql.ConnectionPool(dbConfig)
    .connect()
    .then(pool => {
        console.log(`Conectado a la base de datos de usuarios`);
        return pool;
    })
    .catch(err => {
        console.error('Error al conectar con la base de datos de usuarios:', err.message);
        process.exit(1);
    });

module.exports = poolPromise;