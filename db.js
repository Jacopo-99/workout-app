const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.SSL === 'true' ? { rejectUnauthorized: false } : false,
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  all: (text, params) => pool.query(text, params).then(res => res.rows),
  run: (text, params) => pool.query(text, params),
};
