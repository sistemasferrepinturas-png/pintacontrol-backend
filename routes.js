const express = require('express');
const router = express.Router();
const pool = require('./db');
const db = pool;

/* ==========================================================================
   INICIALIZACIÓN AUTOMÁTICA DE TABLAS EN POSTGRESQL
   ========================================================================== */
const initDB = async () => {
  try {
    // 1. Crear tablas si no existen
    await pool.query(`
      CREATE TABLE IF NOT EXISTS sucursales (
        id_sucursal SERIAL PRIMARY KEY,
        nombre VARCHAR(100) NOT NULL,
        direccion TEXT,
        telefono VARCHAR(50),
        activo BOOLEAN DEFAULT TRUE,
        en_uso BOOLEAN DEFAULT FALSE
      );

      CREATE TABLE IF NOT EXISTS usuarios (
        id_usuario SERIAL PRIMARY KEY,
        nombre VARCHAR(100) NOT NULL,
        email VARCHAR(100),
        telefono VARCHAR(50),
        pin VARCHAR(20) DEFAULT '1234',
        id_sucursal INT REFERENCES sucursales(id_sucursal),
        rol VARCHAR(20) DEFAULT 'REPARTIDOR',
        activo BOOLEAN DEFAULT TRUE
      );

      CREATE TABLE IF NOT EXISTS vehiculos (
        id_vehiculo SERIAL PRIMARY KEY,
        placa VARCHAR(50) NOT NULL,
        marca_modelo VARCHAR(100),
        id_sucursal INT REFERENCES sucursales(id_sucursal),
        kilometraje_actual INT DEFAULT 0,
        estado VARCHAR(30) DEFAULT 'DISPONIBLE',
        detalles_mecanicos TEXT,
        requiere_mantenimiento BOOLEAN DEFAULT FALSE,
        activo BOOLEAN DEFAULT TRUE
      );

      CREATE TABLE IF NOT EXISTS turnos_diarios (
        id_turno SERIAL PRIMARY KEY,
        id_usuario INT REFERENCES usuarios(id_usuario),
        id_vehiculo INT REFERENCES vehiculos(id_vehiculo),
        id_sucursal INT REFERENCES sucursales(id_sucursal),
        fecha DATE DEFAULT CURRENT_DATE,
        hora_inicio TIMESTAMP DEFAULT NOW(),
        hora_fin TIMESTAMP,
        km_inicial INT DEFAULT 0,
        km_final INT,
        estado VARCHAR(20) DEFAULT 'ABIERTO'
      );

      CREATE TABLE IF NOT EXISTS viajes_recorridos (
        id_viaje SERIAL PRIMARY KEY,
        id_turno INT REFERENCES turnos_diarios(id_turno),
        id_usuario INT REFERENCES usuarios(id_usuario),
        numero_viaje_del_dia INT DEFAULT 1,
        direccion_destino TEXT,
        forma_pago_esperada VARCHAR(50),
        fondo_cambio_recibido NUMERIC(10,2) DEFAULT 0,
        km_inicial NUMERIC(10,2) DEFAULT 0,
        km_final NUMERIC(10,2),
        estado_viaje VARCHAR(20) DEFAULT 'EN_PROCESO',
        fecha_hora_inicio TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        fecha_hora_fin TIMESTAMP,
        notas TEXT,
        foto_odometro_inicio TEXT,
        foto_odometro_fin TEXT
      );

      CREATE TABLE IF NOT EXISTS usuarios_sistema (
        id_usuario_sys SERIAL PRIMARY KEY,
        id_sucursal INT,
        usuario VARCHAR(50) UNIQUE NOT NULL,
        password VARCHAR(100),
        password_hash VARCHAR(100),
        nombre_completo VARCHAR(100),
        puesto VARCHAR(50),
        departamento VARCHAR(50),
        telefono VARCHAR(50),
        permisos TEXT DEFAULT 'TODOS',
        modulos TEXT DEFAULT 'MONITOREO,SUCURSALES,USUARIOS,BITACORA,ESTADISTICAS',
        activo BOOLEAN DEFAULT TRUE,
        fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS bitacora_auditoria (
        id_bitacora SERIAL PRIMARY KEY,
        id_usuario_sys INT,
        usuario VARCHAR(50),
        usuario_nombre VARCHAR(100),
        accion VARCHAR(100),
        modulo VARCHAR(50),
        detalles TEXT,
        fecha_hora TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS pagos_servicios (
        id_servicio SERIAL PRIMARY KEY,
        id_sucursal INT REFERENCES sucursales(id_sucursal),
        tipo_servicio VARCHAR(50),
        proveedor_descripcion TEXT,
        numero_cuenta VARCHAR(100),
        referencia_pago VARCHAR(100),
        monto NUMERIC(10,2) DEFAULT 0,
        periodicidad VARCHAR(30),
        proxima_fecha_pago DATE,
        estado_pago VARCHAR(20) DEFAULT 'PENDIENTE',
        observaciones TEXT
      );
    `);

// 2. Asegurar columnas en tablas previamente creadas
    await pool.query(`
      ALTER TABLE usuarios_sistema ADD COLUMN IF NOT EXISTS password VARCHAR(100);
      ALTER TABLE usuarios_sistema ADD COLUMN IF NOT EXISTS password_hash VARCHAR(100);
      ALTER TABLE usuarios_sistema ADD COLUMN IF NOT EXISTS permisos TEXT DEFAULT 'TODOS';
      ALTER TABLE usuarios_sistema ADD COLUMN IF NOT EXISTS modulos TEXT DEFAULT 'MONITOREO,SUCURSALES,USUARIOS,BITACORA,ESTADISTICAS';

      ALTER TABLE sucursales ADD COLUMN IF NOT EXISTS telefono VARCHAR(50);
      ALTER TABLE sucursales ADD COLUMN IF NOT EXISTS activo BOOLEAN DEFAULT TRUE;
      ALTER TABLE sucursales ADD COLUMN IF NOT EXISTS en_uso BOOLEAN DEFAULT FALSE;

      ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS email VARCHAR(100);
      ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS telefono VARCHAR(50);
      ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS pin VARCHAR(20) DEFAULT '1234';
      ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS rol VARCHAR(20) DEFAULT 'REPARTIDOR';
      ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS activo BOOLEAN DEFAULT TRUE;
      
      ALTER TABLE vehiculos ADD COLUMN IF NOT EXISTS id_sucursal INT;
      ALTER TABLE vehiculos ADD COLUMN IF NOT EXISTS kilometraje_actual INT DEFAULT 0;
      ALTER TABLE vehiculos ADD COLUMN IF NOT EXISTS detalles_mecanicos TEXT;
      ALTER TABLE vehiculos ADD COLUMN IF NOT EXISTS estado VARCHAR(30) DEFAULT 'DISPONIBLE';

      ALTER TABLE viajes_recorridos ADD COLUMN IF NOT EXISTS id_usuario INT;
      ALTER TABLE viajes_recorridos ADD COLUMN IF NOT EXISTS id_vehiculo INT;
      ALTER TABLE viajes_recorridos ADD COLUMN IF NOT EXISTS id_sucursal INT;
      ALTER TABLE viajes_recorridos ADD COLUMN IF NOT EXISTS estatus VARCHAR(30) DEFAULT 'EN_CURSO';
      ALTER TABLE viajes_recorridos ADD COLUMN IF NOT EXISTS numero_viaje_del_dia INT DEFAULT 1;
      ALTER TABLE viajes_recorridos ADD COLUMN IF NOT EXISTS km_inicial INT DEFAULT 0;
      ALTER TABLE viajes_recorridos ADD COLUMN IF NOT EXISTS km_final INT;
      ALTER TABLE viajes_recorridos ADD COLUMN IF NOT EXISTS direccion_destino TEXT;
      ALTER TABLE viajes_recorridos ADD COLUMN IF NOT EXISTS forma_pago_esperada VARCHAR(30);
      ALTER TABLE viajes_recorridos ADD COLUMN IF NOT EXISTS fondo_cambio_recibido NUMERIC(10,2) DEFAULT 0;
      ALTER TABLE viajes_recorridos ADD COLUMN IF NOT EXISTS foto_odometro_inicio TEXT;
      ALTER TABLE viajes_recorridos ADD COLUMN IF NOT EXISTS foto_odometro_fin TEXT;
      ALTER TABLE viajes_recorridos ADD COLUMN IF NOT EXISTS notas TEXT;

      // Asegurar columnas en usuarios_sistema
      ALTER TABLE usuarios_sistema ADD COLUMN IF NOT EXISTS id_sucursal INT;
      ALTER TABLE usuarios_sistema ADD COLUMN IF NOT EXISTS activo BOOLEAN DEFAULT TRUE;
      ALTER TABLE usuarios_sistema ADD COLUMN IF NOT EXISTS puesto VARCHAR(50);
      ALTER TABLE usuarios_sistema ADD COLUMN IF NOT EXISTS departamento VARCHAR(50);
      ALTER TABLE usuarios_sistema ADD COLUMN IF NOT EXISTS telefono VARCHAR(50);
      ALTER TABLE usuarios_sistema ADD COLUMN IF NOT EXISTS permisos TEXT DEFAULT 'TODOS';
      ALTER TABLE usuarios_sistema ADD COLUMN IF NOT EXISTS modulos TEXT DEFAULT 'MONITOREO,SUCURSALES,USUARIOS,BITACORA,ESTADISTICAS';
      
    `);

    // 3. Insertar Sucursales Iniciales si la tabla está vacía
    const checkSucs = await pool.query("SELECT COUNT(*) FROM sucursales");
    if (parseInt(checkSucs.rows[0].count, 10) === 0) {
      await pool.query(`
        INSERT INTO sucursales (nombre, direccion, activo, en_uso) VALUES 
        ('Matriz Tuxtla', 'Av. Central #123 Tuxtla', TRUE, FALSE),
        ('CEDIS Comitán', 'Comitán Centro', TRUE, FALSE);
      `);
    }

    // 4. Insertar Usuario FerreAdmin si la tabla está vacía
    const checkAdmin = await pool.query("SELECT * FROM usuarios_sistema WHERE usuario = 'FerreAdmin'");
    if (checkAdmin.rows.length === 0) {
      await pool.query(`
        INSERT INTO usuarios_sistema (usuario, password, password_hash, nombre_completo, puesto, departamento, permisos, modulos, activo)
        VALUES ('FerreAdmin', 'FerreAdmin', 'FerreAdmin', 'Administrador Principal', 'Administrador General (Todas)', 'Sistemas', 'TODOS', 'MONITOREO,SUCURSALES,USUARIOS,BITACORA,ESTADISTICAS', TRUE);
      `);
    } else {
      await pool.query(`
        UPDATE usuarios_sistema 
        SET password_hash = COALESCE(password_hash, password, 'FerreAdmin'),
            permisos = 'TODOS',
            modulos = 'MONITOREO,SUCURSALES,USUARIOS,BITACORA,ESTADISTICAS'
        WHERE usuario = 'FerreAdmin';
      `);
    }
  } catch (err) {
    console.error("Error al verificar/inicializar las tablas en PostgreSQL:", err);
  }
};

initDB();

/* ==========================================================================
   1. SUCURSALES
   ========================================================================== */
router.get('/sucursales', async (req, res) => {
  try {
    const { soloDisponibles } = req.query;
    let query = "SELECT * FROM sucursales WHERE activo = TRUE";
    if (soloDisponibles === 'true') {
      query += " AND en_uso = FALSE";
    }
    query += " ORDER BY nombre ASC";
    const resu = await pool.query(query);
    res.json(resu.rows);
  } catch (e) {
    res.status(500).json({ error: 'Error al consultar sucursales.' });
  }
});

router.post('/sucursales', async (req, res) => {
  try {
    const { nombre, direccion, telefono } = req.body;
    if (!nombre) return res.status(400).json({ error: 'El nombre es obligatorio.' });

    const exist = await pool.query("SELECT id_sucursal FROM sucursales WHERE LOWER(nombre) = LOWER($1)", [nombre.trim()]);
    if (exist.rows.length > 0) {
      const act = await pool.query(
        "UPDATE sucursales SET activo = TRUE, direccion = $1, telefono = $2 WHERE id_sucursal = $3 RETURNING *",
        [direccion || '', telefono || '', exist.rows[0].id_sucursal]
      );
      return res.status(200).json(act.rows[0]);
    }

    const query = "INSERT INTO sucursales (nombre, direccion, telefono, activo, en_uso) VALUES ($1, $2, $3, TRUE, FALSE) RETURNING *";
    const nuevo = await pool.query(query, [nombre.trim(), direccion || '', telefono || '']);
    res.status(201).json(nuevo.rows[0]);
  } catch (e) {
    console.error('Error sucursal:', e);
    res.status(500).json({ error: 'Error al crear la sucursal.' });
  }
});

router.delete('/sucursales/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query("UPDATE sucursales SET activo = FALSE, en_uso = FALSE WHERE id_sucursal = $1", [id]);
    res.json({ mensaje: 'Sucursal eliminada correctamente.' });
  } catch (e) {
    res.status(500).json({ error: 'Error al eliminar sucursal.' });
  }
});

/* ==========================================================================
   2. REPARTIDORES
   ========================================================================== */

// Endpoint para consultar el estado actual y último kilometraje del repartidor
router.get('/repartidor/:id/estado', async (req, res) => {
  const { id } = req.params;
  try {
    // 1. Verificar si el repartidor tiene un viaje 'EN_CURSO'
    const viajeRes = await pool.query(
      `SELECT * FROM viajes_recorridos 
       WHERE id_usuario = $1 AND estatus = 'EN_CURSO' 
       ORDER BY id_viaje DESC LIMIT 1`,
      [id]
    );

    // 2. Obtener el último kilometraje registrado en un viaje 'FINALIZADO'
    const ultKmRes = await pool.query(
      `SELECT km_final FROM viajes_recorridos 
       WHERE id_usuario = $1 AND estatus = 'FINALIZADO' 
       ORDER BY id_viaje DESC LIMIT 1`,
      [id]
    );

    const viajePendiente = viajeRes.rows.length > 0 ? viajeRes.rows[0] : null;
    const ultimoKm = ultKmRes.rows.length > 0 ? ultKmRes.rows[0].km_final : 0;

    res.json({
      viajePendiente,
      ultimoKm
    });
  } catch (error) {
    console.error('Error al consultar estado del repartidor:', error);
    res.status(500).json({ error: 'Error interno al obtener el estado del repartidor.' });
  }
});



router.get('/repartidores', async (req, res) => {
  try {
    let query = `
      SELECT 
        u.id_usuario, 
        u.nombre, 
        u.email, 
        u.telefono, 
        u.pin, 
        u.id_sucursal, 
        s.nombre AS sucursal,
        EXISTS (
          SELECT 1 FROM viajes_recorridos vr 
          WHERE vr.id_usuario = u.id_usuario 
            AND (vr.estado_viaje IN ('EN_PROCESO', 'EN_CURSO') OR vr.estatus IN ('EN_PROCESO', 'EN_CURSO'))
        ) AS en_recorrido
      FROM usuarios u
      LEFT JOIN sucursales s ON u.id_sucursal = s.id_sucursal
      WHERE u.rol = 'REPARTIDOR' AND u.activo = TRUE
      ORDER BY u.nombre ASC;
    `;
    const resu = await pool.query(query);
    const lista = resu.rows.map(r => ({
      ...r,
      estatus: r.en_recorrido ? 'EN_RECORRIDO' : 'LIBRE'
    }));
    res.json(lista);
  } catch (e) {
    console.error("Error al consultar repartidores:", e);
    res.status(500).json({ error: 'Error al consultar repartidores.' });
  }
});

router.post('/repartidores', async (req, res) => {
  try {
    const { nombre, id_sucursal, telefono, pin } = req.body;
    if (!nombre || !id_sucursal) return res.status(400).json({ error: 'Nombre y sucursal son obligatorios.' });

    const pinFinal = pin && pin.length === 4 ? pin : '1234';

    const exist = await pool.query("SELECT id_usuario FROM usuarios WHERE LOWER(nombre) = LOWER($1)", [nombre.trim()]);
    if (exist.rows.length > 0) {
      const act = await pool.query(
        "UPDATE usuarios SET activo = TRUE, id_sucursal = $1, telefono = $2, pin = $3 WHERE id_usuario = $4 RETURNING *",
        [id_sucursal, telefono || null, pinFinal, exist.rows[0].id_usuario]
      );
      return res.status(200).json(act.rows[0]);
    }

    const query = "INSERT INTO usuarios (nombre, id_sucursal, telefono, pin, rol, activo) VALUES ($1, $2, $3, $4, 'REPARTIDOR', TRUE) RETURNING *";
    const nuevo = await pool.query(query, [nombre.trim(), id_sucursal, telefono || null, pinFinal]);
    res.status(201).json(nuevo.rows[0]);
  } catch (e) {
    res.status(500).json({ error: 'Error al registrar repartidor.' });
  }
});

router.put('/repartidores/:id_usuario/pin', async (req, res) => {
  try {
    const { id_usuario } = req.params;
    const { pin } = req.body;
    if (!pin || pin.length !== 4) return res.status(400).json({ error: 'El PIN debe ser exactamente de 4 dígitos.' });

    await pool.query("UPDATE usuarios SET pin = $1 WHERE id_usuario = $2", [pin, id_usuario]);
    res.json({ mensaje: 'PIN actualizado correctamente.' });
  } catch (e) {
    res.status(500).json({ error: 'Error al actualizar PIN.' });
  }
});

router.put('/repartidores/:id_usuario/datos', async (req, res) => {
  try {
    const { id_usuario } = req.params;
    const { nombre, telefono, id_sucursal } = req.body;

    let query = "UPDATE usuarios SET ";
    const params = [];
    let contador = 1;

    if (nombre) {
      query += `nombre = $${contador}, `;
      params.push(nombre.trim());
      contador++;
    }
    if (telefono !== undefined) {
      query += `telefono = $${contador}, `;
      params.push(telefono ? telefono.trim() : null);
      contador++;
    }
    if (id_sucursal) {
      query += `id_sucursal = $${contador}, `;
      params.push(parseInt(id_sucursal, 10));
      contador++;
    }

    query = query.slice(0, -2);
    query += ` WHERE id_usuario = $${contador} RETURNING *;`;
    params.push(id_usuario);

    const actual = await pool.query(query, params);
    res.json({ mensaje: 'Repartidor actualizado correctamente.', repartidor: actual.rows[0] });
  } catch (e) {
    res.status(500).json({ error: 'Error al actualizar repartidor.' });
  }
});

router.delete('/repartidores/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query("UPDATE usuarios SET activo = FALSE WHERE id_usuario = $1", [id]);
    res.json({ mensaje: 'Repartidor eliminado correctamente.' });
  } catch (e) {
    res.status(500).json({ error: 'Error al eliminar repartidor.' });
  }
});

/* ==========================================================================
   2.1 VIAJES Y RECORRIDOS (INICIO Y FINALIZACIÓN)
   ========================================================================== */

// Endpoint para iniciar un nuevo viaje desde la App Móvil
router.post('/viajes/inicio', async (req, res) => {
  const { 
    id_usuario, 
    id_vehiculo, 
    id_sucursal, 
    direccion_destino, 
    forma_pago_esperada, 
    fondo_cambio_recibido, 
    km_inicial, 
    foto_odometro_inicio 
  } = req.body;

  try {
    // 1. Contar cuántos viajes lleva el repartidor hoy
    const countRes = await pool.query(
      `SELECT COUNT(*) FROM viajes_recorridos 
       WHERE id_usuario = $1 AND (DATE(fecha_hora_inicio) = CURRENT_DATE OR DATE(fecha_inicio) = CURRENT_DATE)`,
      [id_usuario]
    );
    const numero_viaje = parseInt(countRes.rows[0].count, 10) + 1;

    // 2. Insertar el nuevo recorrido en la base de datos
    const insertRes = await pool.query(
      `INSERT INTO viajes_recorridos 
       (id_usuario, id_vehiculo, id_sucursal, direccion_destino, forma_pago_esperada, fondo_cambio_recibido, km_inicial, foto_odometro_inicio, estatus, estado_viaje, numero_viaje_del_dia, fecha_hora_inicio, fecha_inicio) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'EN_CURSO', 'EN_CURSO', $9, NOW(), NOW()) 
       RETURNING *`,
      [
        id_usuario, 
        id_vehiculo || null, 
        id_sucursal || null, 
        direccion_destino, 
        forma_pago_esperada || 'EFECTIVO', 
        fondo_cambio_recibido || 0, 
        km_inicial || 0, 
        foto_odometro_inicio || null,
        numero_viaje
      ]
    );

    res.json({ viaje: insertRes.rows[0] });
  } catch (error) {
    console.error('Error al iniciar viaje:', error);
    res.status(500).json({ error: error.message || 'Error interno al iniciar recorrido.' });
  }
});

// Endpoint para finalizar un viaje desde la App Móvil
router.post('/viajes/finalizar', async (req, res) => {
  const { id_viaje, km_final, notas, foto_odometro_fin } = req.body;

  try {
    if (!id_viaje) {
      return res.status(400).json({ error: 'El ID del viaje es obligatorio.' });
    }

    // 1. Actualizar estado y kilometraje final del recorrido
    const updateRes = await pool.query(
      `UPDATE viajes_recorridos 
       SET km_final = $1, 
           notas = $2, 
           foto_odometro_fin = $3, 
           estatus = 'FINALIZADO', 
           estado_viaje = 'FINALIZADO', 
           fecha_hora_fin = NOW() 
       WHERE id_viaje = $4 
       RETURNING *`,
      [km_final, notas || '', foto_odometro_fin || null, id_viaje]
    );

    if (updateRes.rows.length === 0) {
      return res.status(404).json({ error: 'No se encontró el viaje a finalizar.' });
    }

    const viajeFinalizado = updateRes.rows[0];

    // 2. Si tenía moto asignada, actualizar su kilometraje_actual en la tabla vehiculos
    if (viajeFinalizado.id_vehiculo) {
      await pool.query(
        `UPDATE vehiculos SET kilometraje_actual = $1 WHERE id_vehiculo = $2`,
        [km_final, viajeFinalizado.id_vehiculo]
      );
    }

    res.json({ ok: true, viaje: viajeFinalizado });
  } catch (error) {
    console.error('Error al finalizar viaje:', error);
    res.status(500).json({ error: error.message || 'Error interno al finalizar el recorrido.' });
  }
});


/* ==========================================================================
   3. MOTOS / VEHÍCULOS
   ========================================================================== */
router.get('/motos', async (req, res) => {
  try {
    const { id_sucursal } = req.query;
    let query = `
      SELECT v.id_vehiculo, v.placa, v.marca_modelo, v.kilometraje_actual, v.estado, v.detalles_mecanicos, v.id_sucursal, s.nombre AS sucursal
      FROM vehiculos v
      LEFT JOIN sucursales s ON v.id_sucursal = s.id_sucursal
      WHERE v.activo = TRUE
    `;
    const params = [];
    if (id_sucursal) {
      query += " AND v.id_sucursal = $1";
      params.push(parseInt(id_sucursal, 10));
    }
    query += " ORDER BY v.id_vehiculo ASC";

    const resu = await pool.query(query, params);
    res.json(resu.rows);
  } catch (e) {
    res.status(500).json({ error: 'Error al consultar motos.' });
  }
});

router.post('/motos', async (req, res) => {
  try {
    const { placa, marca_modelo, id_sucursal, kilometraje_actual } = req.body;
    if (!placa || !id_sucursal) return res.status(400).json({ error: 'Placa y sucursal son obligatorias.' });

    const placaLimpia = placa.trim().toUpperCase();
    const motoExistente = await pool.query("SELECT id_vehiculo FROM vehiculos WHERE UPPER(placa) = $1", [placaLimpia]);

    if (motoExistente.rows.length > 0) {
      const idVehiculo = motoExistente.rows[0].id_vehiculo;
      const queryReactivar = `
        UPDATE vehiculos 
        SET marca_modelo = $1, id_sucursal = $2, kilometraje_actual = $3, estado = 'DISPONIBLE', activo = TRUE, detalles_mecanicos = NULL, requiere_mantenimiento = FALSE
        WHERE id_vehiculo = $4 
        RETURNING *
      `;
      const motoReactivada = await pool.query(queryReactivar, [marca_modelo || '', id_sucursal, kilometraje_actual || 0, idVehiculo]);
      return res.status(200).json(motoReactivada.rows[0]);
    }

    const queryInsert = `
      INSERT INTO vehiculos (placa, marca_modelo, id_sucursal, kilometraje_actual, estado, activo) 
      VALUES ($1, $2, $3, $4, 'DISPONIBLE', TRUE) 
      RETURNING *
    `;
    const nuevaMoto = await pool.query(queryInsert, [placaLimpia, marca_modelo || '', id_sucursal, kilometraje_actual || 0]);
    res.status(201).json(nuevaMoto.rows[0]);
  } catch (e) {
    res.status(500).json({ error: 'Error al registrar la moto.' });
  }
});

router.put('/motos/:id', async (req, res) => {
  const { id } = req.params;
  const { placa, marca_modelo, id_sucursal, kilometraje_actual } = req.body;
  try {
    await pool.query(
      `UPDATE vehiculos 
       SET placa = $1, marca_modelo = $2, id_sucursal = $3, kilometraje_actual = $4 
       WHERE id_vehiculo = $5`,
      [placa, marca_modelo, id_sucursal || null, parseInt(kilometraje_actual || 0, 10), id]
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/motos/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query("UPDATE vehiculos SET activo = FALSE WHERE id_vehiculo = $1", [id]);
    res.json({ mensaje: 'Moto eliminada correctamente.' });
  } catch (e) {
    res.status(500).json({ error: 'Error al eliminar moto.' });
  }
});

/* ==========================================================================
   4. MONITOREO EN VIVO
   ========================================================================== */
router.get('/admin/monitoreo', async (req, res) => {
  try {
    const { fecha_inicio, fecha_fin } = req.query;
    let queryAdmin = `
      SELECT 
        u.nombre AS repartidor,
        s.nombre AS sucursal,
        vr.id_viaje,
        vr.numero_viaje_del_dia,
        vr.direccion_destino,
        vr.forma_pago_esperada,
        vr.fondo_cambio_recibido,
        vr.km_inicial,
        vr.km_final,
        CASE 
          WHEN vr.km_final IS NOT NULL AND vr.km_final >= vr.km_inicial THEN (vr.km_final - vr.km_inicial)
          ELSE 0 
        END AS km_recorridos,
        vr.estado_viaje,
        vr.fecha_hora_inicio,
        vr.fecha_hora_fin,
        vr.notas,
        (vr.foto_odometro_inicio IS NOT NULL AND vr.foto_odometro_inicio != '') AS tiene_foto_inicio,
        (vr.foto_odometro_fin IS NOT NULL AND vr.foto_odometro_fin != '') AS tiene_foto_fin
      FROM viajes_recorridos vr
      JOIN usuarios u ON vr.id_usuario = u.id_usuario
      LEFT JOIN sucursales s ON u.id_sucursal = s.id_sucursal
      WHERE 1=1
    `;
    const params = [];

    if (fecha_inicio && fecha_fin) {
      queryAdmin += ` AND DATE(vr.fecha_hora_inicio) BETWEEN $1 AND $2`;
      params.push(fecha_inicio, fecha_fin);
    } else {
      queryAdmin += ` AND DATE(vr.fecha_hora_inicio) = CURRENT_DATE`;
    }

    queryAdmin += ` ORDER BY vr.fecha_hora_inicio DESC;`;

    const resultado = await pool.query(queryAdmin, params);
    res.json(resultado.rows);
  } catch (error) {
    res.status(500).json({ error: 'Error al consultar monitoreo.' });
  }
});

router.get('/admin/viaje/:id/foto/:tipo', async (req, res) => {
  const { id, tipo } = req.params;
  const campoFoto = tipo === 'inicio' ? 'foto_odometro_inicio' : 'foto_odometro_fin';
  try {
    const result = await pool.query(`SELECT ${campoFoto} FROM viajes_recorridos WHERE id_viaje = $1`, [id]);
    if (result.rows.length === 0 || !result.rows[0][campoFoto]) {
      return res.status(404).json({ error: 'Foto no disponible' });
    }
    res.json({ foto: result.rows[0][campoFoto] });
  } catch (error) {
    res.status(500).json({ error: 'Error al consultar foto del viaje.' });
  }
});

/* ==========================================================================
   5. AUTENTICACIÓN Y AUDITORÍA
   ========================================================================== */
router.post('/auth/login', async (req, res) => {
  const { usuario, password } = req.body;
  try {
    const result = await pool.query(
      "SELECT * FROM usuarios_sistema WHERE usuario = $1 AND (password = $2 OR password_hash = $2) AND activo = true",
      [usuario, password]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
    }

    const user = result.rows[0];

    try {
      await pool.query(
        "INSERT INTO bitacora_auditoria (usuario, usuario_nombre, accion, detalles) VALUES ($1, $2, $3, $4)",
        [user.usuario, user.nombre_completo, 'INICIO_SESION', 'Inicio de sesión exitoso desde el panel web.']
      );
    } catch (audError) {}

    res.json({
      ok: true,
      usuario: {
        id_usuario: user.id_usuario_sys,
        usuario: user.usuario,
        nombre_completo: user.nombre_completo,
        puesto: user.puesto,
        id_sucursal: user.id_sucursal,
        permisos: user.permisos || 'TODOS',
        modulos: user.modulos || 'MONITOREO,SUCURSALES,USUARIOS,BITACORA,ESTADISTICAS',
        es_admin_supremo: true
      }
    });

  } catch (error) {
    console.error("Error detallado en login:", error);
    res.status(500).json({ error: error.message || 'Error interno del servidor al iniciar sesión.' });
  }
});

/* ==========================================================================
   6. USUARIOS Y PAGOS
   ========================================================================== */
router.get('/usuarios-sistema', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT u.*, s.nombre as sucursal_nombre 
       FROM usuarios_sistema u 
       LEFT JOIN sucursales s ON u.id_sucursal = s.id_sucursal 
       WHERE u.activo = TRUE 
       ORDER BY u.id_usuario_sys ASC`
    );
    res.json(result.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/usuarios-sistema', async (req, res) => {
  const { id_sucursal, nombre_completo, usuario, password, puesto, departamento, telefono, permisos, usuario_operador } = req.body;
  try {
    const check = await pool.query(`SELECT * FROM usuarios_sistema WHERE usuario = $1`, [usuario]);

    if (check.rows.length > 0) {
      const userExistente = check.rows[0];
      if (!userExistente.activo) {
        const result = await pool.query(
          `UPDATE usuarios_sistema 
           SET id_sucursal=$1, nombre_completo=$2, password=$3, password_hash=$3, puesto=$4, departamento=$5, telefono=$6, permisos=$7, activo=TRUE 
           WHERE id_usuario_sys=$8 RETURNING *`,
          [id_sucursal || null, nombre_completo, password, puesto, departamento, telefono, JSON.stringify(permisos), userExistente.id_usuario_sys]
        );

        return res.json(result.rows[0]);
      } else {
        return res.status(400).json({ error: `El usuario "${usuario}" ya se encuentra activo en el sistema.` });
      }
    }

    const result = await pool.query(
      `INSERT INTO usuarios_sistema (id_sucursal, nombre_completo, usuario, password, password_hash, puesto, departamento, telefono, permisos)
       VALUES ($1, $2, $3, $4, $4, $5, $6, $7, $8) RETURNING *`,
      [id_sucursal || null, nombre_completo, usuario, password, puesto, departamento, telefono, JSON.stringify(permisos)]
    );

    res.json(result.rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/usuarios-sistema/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query(`UPDATE usuarios_sistema SET activo = FALSE WHERE id_usuario_sys = $1`, [id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/pagos-servicios', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT p.*, s.nombre as sucursal_nombre,
              (p.proxima_fecha_pago - CURRENT_DATE) as dias_restantes
       FROM pagos_servicios p
       JOIN sucursales s ON p.id_sucursal = s.id_sucursal
       ORDER BY p.proxima_fecha_pago ASC`
    );
    res.json(result.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/pagos-servicios', async (req, res) => {
  const { id_sucursal, tipo_servicio, proveedor_descripcion, numero_cuenta, referencia_pago, monto, periodicidad, proxima_fecha_pago, observaciones } = req.body;
  try {
    const result = await pool.query(
      `INSERT INTO pagos_servicios (
         id_sucursal, tipo_servicio, proveedor_descripcion, numero_cuenta, referencia_pago, monto, periodicidad, proxima_fecha_pago, observaciones
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [id_sucursal, tipo_servicio, proveedor_descripcion, numero_cuenta || '', referencia_pago || '', monto || 0, periodicidad, proxima_fecha_pago, observaciones || '']
    );
    res.json(result.rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put('/pagos-servicios/:id/marcar-pagado', async (req, res) => {
  const { id } = req.params;
  const { nueva_fecha_pago } = req.body;
  try {
    await db.query(
      `UPDATE pagos_servicios SET estado_pago = 'PAGADO', proxima_fecha_pago = $1 WHERE id_servicio = $2`,
      [nueva_fecha_pago, id]
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
