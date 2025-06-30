const crypto = require('crypto');
const sql = require('mssql');
const poolPromiseUsers = require('../config/dbUsers');

/**
 * Autentica a un usuario por username y contraseña, genera o recupera una clave API.
 * @async
 * @function loginUser
 * @param {string} username - Nombre de usuario.
 * @param {string} password - Contraseña del usuario (en texto plano).
 * @returns {Promise<Object>} Objeto con `user` (detalles del usuario), `apiKey` (clave API) y `returnValue`.
 * @throws {Error} Si falla la autenticación o la consulta.
 */
async function loginUser(username, password) {
    try {
        // Validar entradas
        if (typeof username !== 'string' || typeof password !== 'string' ||
            username.length > 50 || password.length > 50) {
            throw new Error('Entradas inválidas para username o password');
        }

        // Hashear la contraseña con SHA-1
        const hashedPassword = crypto.createHash('sha1').update(password).digest('hex');

        const pool = await poolPromiseUsers;
        const request = pool.request();
        request.input('Login', sql.VarChar(50), username);
        request.input('Password', sql.NVarChar(50), hashedPassword);

        // Usar procedimiento almacenado spmUser_DoLogin
        const userResult = await request.execute('spmUser_DoLogin');
        const user = userResult.recordset[0];
        if (!user) {
            throw new Error('Usuario no encontrado o contraseña incorrecta');
        }

        // Verificar si el usuario tiene sesión activa
        if (user.IsActiveSession === 0) {
            throw new Error('No se permite la autenticación: sesión no activa');
        }

        // Buscar clave API existente en WP.SIASHidalgo.TransportePublico
        const poolTransporte = await require('../config/db');
        const apiKeyRequest = poolTransporte.request();
        apiKeyRequest.input('user_id', sql.BigInt, user.UserID);
        const apiKeyResult = await apiKeyRequest.query(
            'SELECT id, [key], level FROM [dbo].[api_keys] WHERE user_id = @user_id AND deleted_at IS NULL'
        );
        let apiKey = apiKeyResult.recordset[0];

        if (!apiKey) {
            // Generar nueva clave API
            const newApiKey = crypto.randomBytes(32).toString('hex');
            const level = user.StatusID || 1; // Usar StatusID como nivel por defecto
            await apiKeyRequest
                .input('key', sql.VarChar(255), newApiKey)
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
            user: {
                id: user.UserID,
                name: `${user.Name} ${user.LastName || ''} ${user.Surname || ''}`.trim(),
                username: user.Login,
                level: user.StatusID
            },
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

        const pool = await require('../config/db'); // Conexión a TransportePublico
        const request = pool.request();
        request.input('key', sql.VarChar(255), apiKey);

        // Usar mUsers en lugar de users para la validación
        const result = await request.query(`
            SELECT u.UserID AS id, 
                   u.Name + ' ' + ISNULL(u.LastName, '') + ' ' + ISNULL(u.Surname, '') AS name,
                   u.Login AS username, 
                   u.StatusID AS level,
                   k.level AS api_key_level
            FROM [dbo].[api_keys] k
            JOIN [dbo].[mUsers] u ON k.user_id = u.UserID
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
        const pool = await require('../config/db');
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

        const getMexicoCityDateISO = () => {
            const now = new Date();
            const mexicoDateTime = now.toLocaleString('sv-SE', {
                timeZone: 'America/Mexico_City'
            });
            return mexicoDateTime.replace(' ', 'T') + '.000Z';
        };

        const createdAtISO = getMexicoCityDateISO();

        await request
            .input('api_key_id', sql.BigInt, apiKeyId)
            .input('route', sql.VarChar, route)
            .input('method', sql.VarChar, method)
            .input('params', sql.VarChar(sql.MAX), paramsString)
            .input('ip_address', sql.VarChar, ipAddress)
            .input('created_at', sql.DateTime2, createdAtISO)
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