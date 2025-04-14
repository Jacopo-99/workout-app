require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false // Important for Railway
  }
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  all: (text, params) => pool.query(text, params).then(res => res.rows),
  get: (text, params) => pool.query(text, params).then(res => res.rows[0]),
  run: (text, params) => pool.query(text, params)
};
