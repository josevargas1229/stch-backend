const sql = require('mssql');
const dbService = require('../services/loginService');
const poolPromiseUsers = require('../config/dbUsers');

/**
 * Middleware para registrar solicitudes en api_logs.
 * @param {Object} req - Objeto de solicitud de Express.
 * @param {Object} res - Objeto de respuesta de Express.
 * @param {Function} next - Función para pasar al siguiente middleware.
 */
const logRequest = async (req, res, next) => {
    try {
        const apiKey = req.headers['authorization']?.replace('Bearer ', '');
        const route = req.originalUrl;
        const method = req.method;
        const publicKey = apiKey || 'N/A';
        const ipAddress = req.ip || req.connection.remoteAddress;
        const userId = req.user?.id || 0; // Obtener userId desde req.user si existe

        await dbService.logApiRequest(apiKey, route, method, publicKey, ipAddress, userId);
    } catch (err) {
        console.error('Error en middleware de logging:', err.message);
    }
    next();
};

/**
 * Middleware para validar clave API o sesión.
 * @param {Object} req - Objeto de solicitud de Express.
 * @param {Object} res - Objeto de respuesta de Express.
 * @param {Function} next - Función para pasar al siguiente middleware.
 */
const authenticateApiKeyOrSession = async (req, res, next) => {
    try {
        // Verificar clave API
        const apiKey = req.headers['authorization']?.replace('Bearer ', '');
        if (apiKey) {
            const result = await dbService.validateApiKey(apiKey);
            req.user = result.user;
            return next();
        }

        // Verificar sesión
        if (req.session.userId) {
            const pool = await poolPromiseUsers;
            const request = pool.request();
            request.input('UserID', sql.Int, req.session.userId);
            const result = await request.query(`
                SELECT 
                    UserID AS id, 
                    Name + ' ' + ISNULL(LastName, '') + ' ' + ISNULL(Surname, '') AS name,
                    Login AS username, 
                    StatusID AS level
                FROM [dbo].[mUsers] 
                WHERE UserID = @UserID
            `);
            if (result.recordset[0]) {
                req.user = result.recordset[0];
                return next();
            }
        }

        return res.status(401).json({ error: 'Autenticación requerida' });
    } catch (err) {
        console.error(err);
        res.status(401).json({ error: 'Clave API o sesión inválida' });
    }
};

module.exports = {
    logRequest,
    authenticateApiKeyOrSession
};