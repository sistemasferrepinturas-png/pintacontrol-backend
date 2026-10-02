const express = require('express');
const cors = require('cors');
const path = require('path');
const rutas = require('./routes');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Servir la página web del Administrador en la raíz
app.use(express.static(__dirname));

// Rutas de la API
app.use('/api', rutas);

// Ruta principal para abrir el panel
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Servidor Backend escuchando en http://localhost:${PORT}`);
  console.log(`💻 Panel de Administrador disponible en http://localhost:${PORT}`);
});