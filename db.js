const { Pool } = require('pg');
const sqlite3 = require('sqlite3');
require('dotenv').config();

let db;

if (process.env.SUPABASE === 'true') {
  const dbUrl = process.env.DATABASE_URL;

  if (!dbUrl) {
    console.error("❌ DATABASE_URL is not defined. Check your environment variables.");
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false },
  });

  db = {
    all: (text, params, callback) => {
      pool.query(text, params)
        .then(res => callback(null, res.rows))
        .catch(err => callback(err));
    },
    get: (text, params, callback) => {
      pool.query(text, params)
        .then(res => callback(null, res.rows[0]))
        .catch(err => callback(err));
    },
    run: (text, params, callback) => {
      pool.query(text, params)
        .then(() => callback && callback(null))
        .catch(err => callback && callback(err));
    },
  };
} else {
  db = new sqlite3.Database('./exercise.db');
}

module.exports = db;
