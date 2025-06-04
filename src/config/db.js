require('dotenv').config();
const sql = require('mssql');

const dbConfig = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    database: process.env.DB_NAME,
    options: {
        encrypt: false,
        trustServerCertificate: true
    }
};
if (!process.env.DB_USER || !process.env.DB_PASSWORD) {
    delete dbConfig.user;
    delete dbConfig.password;
    dbConfig.options.trustedConnection = true; // Habilita autenticación de Windows
}

const poolPromise = new sql.ConnectionPool(dbConfig)
    .connect()
    .then(pool => {
        console.log('Conectado a SQL Server');
        return pool;
    })
    .catch(err => {
        console.error('Error de conexión:', err);
        process.exit(1);
    });

module.exports = poolPromise;