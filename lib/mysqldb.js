/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* Manage MySQL database connections.                                                             */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

import mysql           from 'mysql2/promise.js'; // fast mysql driver
import Debug           from 'debug';             // small debugging utility
import { performance } from 'perf_hooks';        // nodejs.org/api/perf_hooks.html

const debug = Debug('app:mysql'); // mysql db queries

let connectionPool = null;

const heartbeat = false; // send heartbeat queries to prevent Azure disconnect issues


class MysqlDb {

    /**
     * Perform a query.
     *
     * @param   {string} sql - The SQL command to be executed.
     * @param   {Object} [values] - Values to be substituted in SQL placeholders.
     * @param   {Object} [connection] - Connection to be used (e.g. within transaction); otherwise from pool.
     * @returns Array containing array of result rows and array of fields.
     *
     * @example
     *   const [ books ] = await Db.query('Select * From Books Where Author = :author', { author: 'David' });
     */
    static async query(sql, values, connection=undefined) {
        if (!connectionPool) await setupConnectionPool();

        const t1 = performance.now();

        const [ rows, fields ] = connection
            ? await connection.query(sql, values)      // using supplied connection
            : await connectionPool.query(sql, values); // using connection from pool

        const t2 = performance.now();
        debug('query', `${(t2-t1).toFixed(0).padStart(3, ' ')}ms`, sql.trim().split('\n')[0]+(sql.trim().split('\n').length>1?'...':''), `×${rows.length}`);

        return [ rows, fields ];
    }

    /**
     * Prepare & execute a query.
     *
     * @param   {string} sql - The SQL command to be executed.
     * @param   {Object} [values] - Values to be substituted in SQL placeholders.
     * @param   {Object} [connection] - Connection to be used (e.g. within transaction); otherwise from pool.
     * @returns Array containing array of result rows and array of fields.
     *
     * @example
     *   const [ books ] = await Db.execute('Select * From Books Where Author = :author', { author: 'David' });
     */
    static async execute(sql, values, connection=undefined) {
        if (!connectionPool) await setupConnectionPool();

        const t1 = performance.now();

        const [ rows, fields ] = connection
            ? await connection.execute(sql, values)      // using supplied connection
            : await connectionPool.execute(sql, values); // using connection from pool

        const t2 = performance.now();
        debug('execute', `${(t2-t1).toFixed(0).padStart(3, ' ')}ms`, sql.trim().split('\n')[0]+(sql.trim().split('\n').length>1?'...':''), `×${rows.length}`);

        return [ rows, fields ];
    }

    /**
     * Get a connection to the database.
     *
     * This is useful for performing multiple queries within a transaction, or sharing data objects
     * such as temporary tables between subsequent queries. The connection must be released.
     *
     * @example
     *   const connection = await Db.connection();
     *   try {
     *       await connection.beginTransaction();
     *       await connection.query('Insert Into Posts Set Title = ?', title);
     *       await connection.query('Insert Into Log Set Data = ?', log);
     *       await connection.commit();
     *   } catch (e) {
     *       await connection.rollback();
     *       throw e;
     *   }
     *   connection.release();
     *
     * @returns {Object} Database connection.
     */
    static async connection() {
        if (!connectionPool) await setupConnectionPool();

        return await connectionPool.getConnection();
    }


    /**
     * Return connection parameters used to connect to MySQL. Parameters are obtained from the
     * DB_MYSQL_CONNECTION environment variable which should be a connection string either in the
     * 'URI-Like' format
     *   mysql://my-un:my-pw@my.host.com/my-db
     * or the 'Key-Value Pairs' format
     *   host=my.host.com; user=my-un; password=my-pw; database=my-db
     * (dev.mysql.com/doc/refman/8.0/en/connecting-using-uri-or-key-value-pairs.html).
     *
     * @returns Object with host, user, password, database properties.
     */
    static connectionParams() {
        const connectionString = process.env.DB_MYSQL_CONNECTION;
        if (!connectionString) throw new Error('No DB_MYSQL_CONNECTION available');

        const urlLikeConnectionString = connectionString.match(/mysql:\/\/(.+):(.+)@(.+)\/(.+)/);

        if (urlLikeConnectionString) {
            const [ , user, password, host, database ] = urlLikeConnectionString;
            const dbConfig = { user, password, host, database };
            return dbConfig;
        } else {
            const dbConfigKeyVal = connectionString.split(';').map(v => v.trim().split('='));
            const dbConfig = dbConfigKeyVal.reduce((config, v) => { config[v[0].toLowerCase()] = v[1]; return config; }, {});
            return dbConfig;
        }

    }


    /**
     * Convert strings 'true'/'false' to boolan values true/false.
     *
     * Any other values return undefined.
     */
    static trueFalseToBool(value) {
        if (typeof value == 'string' && value.toLowerCase() == 'true') return true;
        if (typeof value == 'string' && value.toLowerCase() == 'false') return false;
        return undefined;
    }


    /**
     * Convert boolan values true/false (including 1/0 from MySQL) to strings 'true'/'false'.
     *
     * Any other values return undefined.
     */
    static boolToTrueFalse(value) {
        if (value === undefined) return undefined;
        if (value === null) return undefined;
        return value ? 'true' : 'false';
    }

}


/**
 * First connection request after app startup will set up connection pool.
 */
async function setupConnectionPool() {
    const t1 = performance.now();

    const dbConfig = MysqlDb.connectionParams();
    dbConfig.namedPlaceholders = true;
    dbConfig.dateStrings = true;
    connectionPool = mysql.createPool(dbConfig);

    // traditional mode ensures not null is respected for unsupplied fields, ensures valid JavaScript dates, etc
    await connectionPool.query('SET SESSION sql_mode = "TRADITIONAL"');

    const t2 = performance.now();
    debug('connect', `${(t2-t1).toFixed(0).padStart(3, ' ')}ms`, `${dbConfig.host}/${dbConfig.database}`);

    // send regular queries in attempt to fix Azure ETIMEDOUT / ECONNRESET issues - github.com/sidorares/node-mysql2/issues/683
    if (heartbeat) {
        setInterval(async () => {
            debug(`keepalive – pool connections all:${connectionPool.pool._allConnections.length} free:${connectionPool.pool._freeConnections.length} queue:${connectionPool.pool._connectionQueue.length}`);
            await connectionPool.execute('Select 1');
        }, 1000*60*2);
    }
}

// Note errors 1451:ER_ROW_IS_REFERENCED_2 & 1452:ER_NO_REFERENCED_ROW_2 replaced errors
// 1216:ER_NO_REFERENCED_ROW & 1217:ER_ROW_IS_REFERENCED in MySQL 5.0.14 (2005)


/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

export default MysqlDb;
