const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.SSL === 'true' ? { rejectUnauthorized: false } : false,
});

module.exports = {
  all: (query, params, callback) => pool.query(query, params)
    .then(result => callback(null, result.rows))
    .catch(err => callback(err)),
    
  get: (query, params, callback) => pool.query(query, params)
    .then(result => callback(null, result.rows[0]))
    .catch(err => callback(err)),

  run: (query, params, callback) => pool.query(query, params)
    .then(() => callback(null))
    .catch(err => callback(err))
};