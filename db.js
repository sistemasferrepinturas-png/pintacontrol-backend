const { Pool } = require('pg');

// Si existe la variable de entorno DATABASE_URL (en Render), usa SSL seguro.
// Si no, utiliza la configuración local.
const isProduction = process.env.NODE_ENV === 'production' || process.env.DATABASE_URL;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/pinta_control',
  ssl: isProduction ? { rejectUnauthorized: false } : false
});

module.exports = pool;