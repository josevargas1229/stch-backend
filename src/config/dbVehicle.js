require('dotenv').config();
const sql = require('mssql');

const dbConfig = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    database: process.env.DB_VEHICLE_NAME,
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

if (!process.env.DB_USER || !process.env.DB_PASSWORD) {
    delete dbConfig.user;
    delete dbConfig.password;
    dbConfig.options.trustedConnection = true; // Habilita autenticación de Windows
}

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