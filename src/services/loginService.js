const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const sql = require('mssql');
const poolPromise = require('../config/db');

/**
 * Autentica a un usuario por username y contraseña, genera o recupera una clave API.
 * @async
 * @function loginUser
 * @param {string} username - Nombre de usuario.
 * @param {string} password - Contraseña del usuario.
 * @returns {Promise<Object>} Objeto con `user` (detalles del usuario), `apiKey` (clave API) y `returnValue`.
 * @throws {Error} Si falla la autenticación o la consulta.
 */
async function loginUser(username, password) {
    try {
        if (!username || !password) {
            throw new Error('Se requieren username y password');
        }

        const pool = await poolPromise;
        const request = pool.request();
        request.input('username', sql.VarChar, username);

        // Buscar usuario por username
        const userResult = await request.query('SELECT id, name, password FROM [dbo].[users] WHERE username = @username');
        const user = userResult.recordset[0];
        if (!user) {
            throw new Error('Usuario no encontrado');
        }
        // Comparar contraseña (asumiendo bcrypt)
        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            throw new Error('Contraseña incorrecta');
        }

        // Buscar clave API existente y no eliminada
        request.input('user_id', sql.BigInt, user.id);
        const apiKeyResult = await request.query('SELECT id, [key], level FROM [dbo].[api_keys] WHERE user_id = @user_id AND deleted_at IS NULL');
        let apiKey = apiKeyResult.recordset[0];

        if (!apiKey) {
            // Generar nueva clave API
            const newApiKey = crypto.randomBytes(32).toString('hex');
            const level = user.level || 1;
            await request
                .input('key', sql.VarChar, newApiKey)
                .input('level', sql.SmallInt, level)
                .input('ignore_limits', sql.SmallInt, 0)
                .input('created_at', sql.DateTime2, new Date())
                .query(`
                    INSERT INTO [dbo].[api_keys] (user_id, [key], level, ignore_limits, created_at)
                    VALUES (@user_id, @key, @level, @ignore_limits, @created_at);
                    SELECT SCOPE_IDENTITY() AS id;
                `);
            
            apiKey = { id: apiKeyResult.recordset[0]?.id, key: newApiKey, level };
        }

        return {
            user: { id: user.id, name: user.name, username: user.username, level: user.level },
            apiKey: apiKey.key,
            returnValue: 0
        };
    } catch (err) {
        throw new Error(`Error al autenticar usuario: ${err.message}`);
    }
}

/**
 * Valida una clave API y devuelve el usuario asociado.
 * @async
 * @function validateApiKey
 * @param {string} apiKey - Clave API a validar.
 * @returns {Promise<Object>} Objeto con `user` (detalles del usuario) y `returnValue`.
 * @throws {Error} Si la clave es inválida o no encontrada.
 */
async function validateApiKey(apiKey) {
    try {
        if (!apiKey) {
            throw new Error('Se requiere una clave API');
        }

        const pool = await poolPromise;
        const request = pool.request();
        request.input('key', sql.VarChar, apiKey);

        const result = await request.query(`
            SELECT u.id, u.name, u.username, u.level, k.level as api_key_level
            FROM [dbo].[api_keys] k
            JOIN [dbo].[users] u ON k.user_id = u.id
            WHERE k.[key] = @key AND k.deleted_at IS NULL
        `);

        if (!result.recordset[0]) {
            throw new Error('Clave API inválida o no encontrada');
        }

        return {
            user: result.recordset[0],
            returnValue: 0
        };
    } catch (err) {
        throw new Error(`Error al validar clave API: ${err.message}`);
    }
}

/**
 * Registra una solicitud a la API en la tabla api_logs.
 * @async
 * @function logApiRequest
 * @param {string} apiKey - Clave API usada en la solicitud.
 * @param {string} route - Ruta de la solicitud.
 * @param {string} method - Método HTTP.
 * @param {string} publicKey - Clave pública para el campo params.
 * @param {string} ipAddress - Dirección IP del cliente.
 * @returns {Promise<void>}
 */
async function logApiRequest(apiKey, route, method, publicKey, ipAddress) {
    try {
        const pool = await poolPromise;
        const request = pool.request();

        // Obtener api_key_id
        let apiKeyId = null;
        if (apiKey) {
            const keyResult = await request
                .input('key', sql.VarChar, apiKey)
                .query('SELECT id FROM [dbo].[api_keys] WHERE [key] = @key AND deleted_at IS NULL');
            apiKeyId = keyResult.recordset[0]?.id || null;
        }

        // Formato de params como en el ejemplo
        const paramsString = `public_key=${publicKey || 'N/A'}`;

        await request
            .input('api_key_id', sql.BigInt, apiKeyId)
            .input('route', sql.VarChar, route)
            .input('method', sql.VarChar, method)
            .input('params', sql.VarChar(sql.MAX), paramsString)
            .input('ip_address', sql.VarChar, ipAddress)
            .input('created_at', sql.DateTime2, new Date())
            .query(`
                INSERT INTO [dbo].[api_logs] (api_key_id, route, method, params, ip_address, created_at, updated_at)
                VALUES (@api_key_id, @route, @method, @params, @ip_address, @created_at, @created_at)
            `);
    } catch (err) {
        console.error(`Error al registrar log: ${err.message}`);
        // No lanzar error para no interrumpir la solicitud
    }
}

module.exports = {
    loginUser,
    validateApiKey,
    logApiRequest
};