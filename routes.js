const express = require('express');
const router = express.Router();
const pool = require('./db');

/* ==========================================================================
   1. SUCURSALES (Obtener, Crear, Eliminar, Estado Uso)
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

    // Si ya existía inactiva, la reactivamos
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

router.put('/sucursales/:id/estado-uso', async (req, res) => {
  try {
    const { id } = req.params;
    const { en_uso } = req.body;
    await pool.query("UPDATE sucursales SET en_uso = $1 WHERE id_sucursal = $2", [en_uso, id]);
    res.json({ mensaje: 'Estado de uso actualizado.' });
  } catch (e) {
    res.status(500).json({ error: 'Error al cambiar estado de uso.' });
  }
});

/* ==========================================================================
   2. REPARTIDORES (Con PIN de 4 dígitos)
   ========================================================================== */
router.get('/repartidores', async (req, res) => {
  try {
    let query = `
      SELECT u.id_usuario, u.nombre, u.email, u.telefono, u.pin, u.id_sucursal, s.nombre AS sucursal
      FROM usuarios u
      LEFT JOIN sucursales s ON u.id_sucursal = s.id_sucursal
      WHERE u.rol = 'REPARTIDOR' AND u.activo = TRUE
      ORDER BY u.nombre ASC
    `;
    const resu = await pool.query(query);
    res.json(resu.rows);
  } catch (e) {
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

/* ==========================================================================
   3. MOTOS / VEHÍCULOS (Obtener, Crear / Reactivar, Mantenimiento, Eliminar)
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

    const resu = await pool.query(query);
    res.json(resu.rows);
  } catch (e) {
    console.error("Error al consultar motos:", e);
    res.status(500).json({ error: 'Error al consultar motos.' });
  }
});

// REGISTRAR / REUTILIZAR MOTO
router.post('/motos', async (req, res) => {
  try {
    const { placa, marca_modelo, id_sucursal, kilometraje_actual } = req.body;
    if (!placa || !id_sucursal) return res.status(400).json({ error: 'Placa y sucursal son obligatorias.' });

    const placaLimpia = placa.trim().toUpperCase();

    // 1. Buscar si la placa ya existe en la base de datos (activa o inactiva)
    const motoExistente = await pool.query("SELECT id_vehiculo FROM vehiculos WHERE UPPER(placa) = $1", [placaLimpia]);

    if (motoExistente.rows.length > 0) {
      // 2. Si existe, la reactivamos y actualizamos sus datos
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

    // 3. Si no existe, se inserta normalmente
    const queryInsert = `
      INSERT INTO vehiculos (placa, marca_modelo, id_sucursal, kilometraje_actual, estado, activo) 
      VALUES ($1, $2, $3, $4, 'DISPONIBLE', TRUE) 
      RETURNING *
    `;
    const nuevaMoto = await pool.query(queryInsert, [placaLimpia, marca_modelo || '', id_sucursal, kilometraje_actual || 0]);
    res.status(201).json(nuevaMoto.rows[0]);
  } catch (e) {
    console.error('Error al registrar moto:', e);
    res.status(500).json({ error: 'Error al registrar o reactivar la moto.' });
  }
});

router.put('/motos/:id_vehiculo/mantenimiento', async (req, res) => {
  try {
    const { id_vehiculo } = req.params;
    const { estado, detalles_mecanicos } = req.body;

    // Si el estado vuelve a ser DISPONIBLE, limpiamos los detalles mecánicos automáticamente
    const esDisponible = estado === 'DISPONIBLE';
    const detalleLimpio = esDisponible ? null : (detalles_mecanicos || null);

    const query = `
      UPDATE vehiculos 
      SET estado = $1, detalles_mecanicos = $2, requiere_mantenimiento = $3 
      WHERE id_vehiculo = $4 
      RETURNING *
    `;
    const actual = await pool.query(query, [estado, detalleLimpio, !esDisponible, id_vehiculo]);
    res.json({ mensaje: 'Estado mecánico actualizado.', moto: actual.rows[0] });
  } catch (e) {
    res.status(500).json({ error: 'Error al actualizar estado mecánico.' });
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

// Actualizar kilometraje manual de una moto
router.put('/motos/:id_vehiculo/kilometraje', async (req, res) => {
  try {
    const { id_vehiculo } = req.params;
    const { kilometraje_actual } = req.body;

    if (kilometraje_actual === undefined || isNaN(kilometraje_actual)) {
      return res.status(400).json({ error: 'Ingresa un kilometraje válido.' });
    }

    const query = "UPDATE vehiculos SET kilometraje_actual = $1 WHERE id_vehiculo = $2 RETURNING *";
    const actual = await pool.query(query, [parseInt(kilometraje_actual, 10), id_vehiculo]);
    res.json({ mensaje: 'Kilometraje actualizado correctamente.', moto: actual.rows[0] });
  } catch (e) {
    res.status(500).json({ error: 'Error al actualizar el kilometraje.' });
  }
});

// Actualizar datos de la moto (Placa y Marca/Modelo)
router.put('/motos/:id_vehiculo/datos', async (req, res) => {
  try {
    const { id_vehiculo } = req.params;
    const { placa, marca_modelo } = req.body;

    if (!placa || !marca_modelo) {
      return res.status(400).json({ error: 'La placa y la marca/modelo son obligatorias.' });
    }

    const query = "UPDATE vehiculos SET placa = $1, marca_modelo = $2 WHERE id_vehiculo = $3 RETURNING *";
    const actual = await pool.query(query, [placa, marca_modelo, id_vehiculo]);
    res.json({ mensaje: 'Datos de la moto actualizados correctamente.', moto: actual.rows[0] });
  } catch (e) {
    console.error("Error al actualizar datos de moto:", e);
    res.status(500).json({ error: 'Error al actualizar datos de la moto.' });
  }
});

/* ==========================================================================
   4. MONITOREO Y OPERACIONES MÓVILES
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
        (vr.km_final - vr.km_inicial) AS km_recorridos,
        vr.estado_viaje,
        vr.fecha_hora_inicio,
        vr.fecha_hora_fin,
        vr.notas
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

router.get('/repartidor/:id_usuario/estado', async (req, res) => {
  try {
    const { id_usuario } = req.params;

    const turnoRes = await pool.query(
      "SELECT * FROM turnos_diarios WHERE id_usuario = $1 AND estado = 'ABIERTO' ORDER BY id_turno DESC LIMIT 1",
      [id_usuario]
    );

    if (turnoRes.rows.length === 0) {
      const motoRes = await pool.query(
        "SELECT kilometraje_actual FROM vehiculos WHERE id_sucursal = (SELECT id_sucursal FROM usuarios WHERE id_usuario = $1) AND activo = TRUE LIMIT 1",
        [id_usuario]
      );
      const kmMoto = motoRes.rows.length > 0 ? motoRes.rows[0].kilometraje_actual : 0;

      return res.json({ esPrimerViaje: true, viajePendiente: null, ultimoKm: kmMoto });
    }

    const id_turno = turnoRes.rows[0].id_turno;
    const viajePendienteRes = await pool.query(
      "SELECT * FROM viajes_recorridos WHERE id_turno = $1 AND estado_viaje = 'EN_PROCESO' LIMIT 1",
      [id_turno]
    );

    const ultimoKmRes = await pool.query(
      "SELECT COALESCE(km_final, km_inicial) as ultimo_km FROM viajes_recorridos WHERE id_turno = $1 ORDER BY id_viaje DESC LIMIT 1",
      [id_turno]
    );

    const ultimoKm = ultimoKmRes.rows.length > 0 ? ultimoKmRes.rows[0].ultimo_km : turnoRes.rows[0].km_inicial;

    res.json({
      esPrimerViaje: false,
      id_turno: id_turno,
      viajePendiente: viajePendienteRes.rows[0] || null,
      ultimoKm: ultimoKm
    });
  } catch (error) {
    res.status(500).json({ error: 'Error al consultar estado del repartidor.' });
  }
});

router.post('/viajes/inicio', async (req, res) => {
  const client = await pool.connect();
  try {
    const { 
      id_usuario, id_vehiculo, id_sucursal, direccion_destino, 
      forma_pago_esperada, fondo_cambio_recibido, km_inicial 
    } = req.body;

    if (!id_usuario || !id_vehiculo) {
      return res.status(400).json({ error: 'Falta repartidor o moto asignada para esta sucursal.' });
    }

    await client.query('BEGIN');

    let turnoRes = await client.query(
      "SELECT id_turno FROM turnos_diarios WHERE id_usuario = $1 AND estado = 'ABIERTO' LIMIT 1",
      [id_usuario]
    );

    let id_turno;
    if (turnoRes.rows.length === 0) {
      const nuevoTurno = await client.query(
        "INSERT INTO turnos_diarios (id_usuario, id_vehiculo, id_sucursal, fecha, hora_inicio, km_inicial, estado) VALUES ($1, $2, $3, CURRENT_DATE, NOW(), $4, 'ABIERTO') RETURNING id_turno",
        [id_usuario, id_vehiculo, id_sucursal, km_inicial]
      );
      id_turno = nuevoTurno.rows[0].id_turno;
    } else {
      id_turno = turnoRes.rows[0].id_turno;
    }

    const viajeActivo = await client.query(
      "SELECT id_viaje FROM viajes_recorridos WHERE id_turno = $1 AND estado_viaje = 'EN_PROCESO'",
      [id_turno]
    );

    if (viajeActivo.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ 
        error: 'CANDADO ACTIVO: Debes registrar el kilometraje final del recorrido anterior antes de iniciar uno nuevo.' 
      });
    }

    const numViajes = await client.query("SELECT COUNT(*) FROM viajes_recorridos WHERE id_turno = $1", [id_turno]);
    const numViajeActual = parseInt(numViajes.rows[0].count, 10) + 1;

    const queryViaje = `
      INSERT INTO viajes_recorridos 
        (id_turno, id_usuario, numero_viaje_del_dia, direccion_destino, forma_pago_esperada, fondo_cambio_recibido, km_inicial, estado_viaje)
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'EN_PROCESO')
      RETURNING *;
    `;
    const valuesViaje = [
      id_turno, id_usuario, numViajeActual, direccion_destino, forma_pago_esperada, 
      fondo_cambio_recibido || 0, km_inicial
    ];
    const nuevoViaje = await client.query(queryViaje, valuesViaje);

    await client.query("UPDATE vehiculos SET kilometraje_actual = $1 WHERE id_vehiculo = $2", [km_inicial, id_vehiculo]);

    await client.query('COMMIT');
    res.status(201).json({ mensaje: 'Viaje iniciado correctamente', viaje: nuevoViaje.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: 'Error al iniciar el viaje.' });
  } finally {
    client.release();
  }
});

// Finalizar recorrido con validación y notas
router.post('/viajes/finalizar', async (req, res) => {
  try {
    const { id_viaje, km_final, notas } = req.body;

    if (!id_viaje || km_final === undefined || isNaN(km_final)) {
      return res.status(400).json({ error: 'Proporciona el ID del viaje y un kilometraje final válido.' });
    }

    // 1. Obtener los datos del viaje activo
    const viajeRes = await pool.query(
      "SELECT km_inicial, id_turno FROM viajes_recorridos WHERE id_viaje = $1", 
      [parseInt(id_viaje, 10)]
    );

    if (viajeRes.rows.length === 0) {
      return res.status(404).json({ error: 'El viaje número ' + id_viaje + ' no fue encontrado en la base de datos.' });
    }

    const { km_inicial, id_turno } = viajeRes.rows[0];

    // 2. Validación de kilometraje mayor al inicial
    if (parseInt(km_final, 10) <= parseInt(km_inicial, 10)) {
      return res.status(400).json({ error: 'El kilometraje final debe ser estrictamente mayor al inicial (' + km_inicial + ' km).' });
    }

    const km_recorridos = parseInt(km_final, 10) - parseInt(km_inicial, 10);

    // 3. Finalizar el viaje en la tabla viajes_recorridos
    let viajeActualizado;
    try {
      const queryViaje = `
        UPDATE viajes_recorridos 
        SET km_final = $1, km_recorridos = $2, notas = $3, estado_viaje = 'FINALIZADO', fecha_hora_fin = NOW()
        WHERE id_viaje = $4 
        RETURNING *;
      `;
      viajeActualizado = await pool.query(queryViaje, [parseInt(km_final, 10), km_recorridos, notas || null, parseInt(id_viaje, 10)]);
    } catch (errNotas) {
      // Si la columna notas aún no existiera en la DB
      const queryFallback = `
        UPDATE viajes_recorridos 
        SET km_final = $1, km_recorridos = $2, estado_viaje = 'FINALIZADO', fecha_hora_fin = NOW()
        WHERE id_viaje = $3 
        RETURNING *;
      `;
      viajeActualizado = await pool.query(queryFallback, [parseInt(km_final, 10), km_recorridos, parseInt(id_viaje, 10)]);
    }

    // 4. Actualizar el kilometraje de la moto asociada al turno
    if (id_turno) {
      const turnoRes = await pool.query("SELECT id_vehiculo FROM turnos_diarios WHERE id_turno = $1", [id_turno]);
      if (turnoRes.rows.length > 0 && turnoRes.rows[0].id_vehiculo) {
        await pool.query(
          "UPDATE vehiculos SET kilometraje_actual = $1 WHERE id_vehiculo = $2", 
          [parseInt(km_final, 10), turnoRes.rows[0].id_vehiculo]
        );
      }
    }

    res.json({ mensaje: 'Recorrido finalizado correctamente.', viaje: viajeActualizado.rows[0] });
  } catch (e) {
    console.error("Error al finalizar viaje:", e);
    res.status(500).json({ error: 'Error interno del servidor al finalizar: ' + e.message });
  }
});

module.exports = router;
