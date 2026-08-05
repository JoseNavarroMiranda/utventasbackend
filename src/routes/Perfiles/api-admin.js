const express = require("express");
const adminRoute = express.Router();
const AsyncHandler = require("express-async-handler");
const { sequelize, Usuario, Rol, Categoria, Pedido, Disputa, HistoricoPedido, Producto, ProductoImagen, RetiroVendedor, SolicitudRelanzamiento, SolicitudRelanzamientoImagen, DisputaImagen } = require('../../models');
const { Op } = require('sequelize');
const bcrypt = require('bcrypt'); // 🔑 Asegúrate de tener instalado bcrypt
const { proteger, verificarRol } = require("../../middlewares/authMiddleware");
require('dotenv').config();


// Helper para autenticarse con la API de PayPal Sandbox
const obtenerPaypalAccessToken = async () => {
  const auth = Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_SECRET}`).toString("base64");
  const response = await fetch(`${process.env.PAYPAL_API_URL}/v1/oauth2/token`, {
    method: "POST",
    body: "grant_type=client_credentials",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded"
    }
  });
  const data = await response.json();
  return data.access_token;
};



// =========================================================================
// REGISTRAR NUEVO USUARIO ADMINISTRADOR (POST /api/admins/crear-admin)
// =========================================================================
adminRoute.post(
  "/crear-admin",
  proteger,
  verificarRol(["Administrador"]), // Solo un admin existente puede crear a otro admin
  AsyncHandler(async (req, res) => {
    const { nombre, correo, contrasena, telefono_defecto } = req.body;

    // 1. Validaciones básicas de campos obligatorios
    if (!nombre || !correo || !contrasena) {
      return res.status(400).json({ 
        success: false, 
        message: "Nombre, correo y contraseña son obligatorios." 
      });
    }

    // 2. Verificar si el correo ya está registrado en la base de datos
    const usuarioExistente = await Usuario.findOne({ where: { correo } });
    if (usuarioExistente) {
      return res.status(400).json({ 
        success: false, 
        message: "El correo ya se encuentra registrado." 
      });
    }

    // 3. Buscar dinámicamente el ID del rol "Administrador"
    const rolAdmin = await Rol.findOne({ where: { nombre: "Administrador" } });
    if (!rolAdmin) {
      return res.status(500).json({ 
        success: false, 
        message: "Error de configuración: El rol 'Administrador' no existe en la base de datos." 
      });
    }

    // 4. Encriptar la contraseña (Salting & Hashing)
    const saltRounds = 10;
    const contrasena_hash = await bcrypt.hash(contrasena, saltRounds);

    // 5. Crear el usuario Administrador directamente verificado
    const nuevoAdmin = await Usuario.create({
      nombre,
      correo,
      contrasena_hash,
      telefono_defecto: telefono_defecto || null,
      rol_id: rolAdmin.rol_id, // Asignamos el ID del rol encontrado
      es_verificado: true      // Se marca como true directo por ser cuenta interna de staff
    });

    // 6. Respuesta limpia (ocultamos el hash por seguridad)
    return res.status(201).json({
      success: true,
      message: "Usuario administrador creado exitosamente.",
      usuario: {
        usuario_id: nuevoAdmin.usuario_id,
        nombre: nuevoAdmin.nombre,
        correo: nuevoAdmin.correo,
        rol: "Administrador",
        es_verificado: nuevoAdmin.es_verificado,
        fecha_registro: nuevoAdmin.fecha_registro
      }
    });
  })
);

// =========================================================================
// 1. CREAR CATEGORÍA (POST /api/admins/categorias)
// =========================================================================
adminRoute.post(
  "/categorias",
  proteger,
  verificarRol(["Administrador"]),
  AsyncHandler(async (req, res) => {
    const { nombre } = req.body;

    if (!nombre || nombre.trim() === "") {
      return res.status(400).json({
        success: false,
        message: "El nombre de la categoría es obligatorio."
      });
    }

    // Validar si ya existe una categoría con ese nombre (evitar conflicto por el 'unique')
    const categoriaExistente = await Categoria.findOne({ 
      where: { nombre: nombre.trim() } 
    });

    if (categoriaExistente) {
      return res.status(400).json({
        success: false,
        message: "Ya existe una categoría con ese nombre."
      });
    }

    const nuevaCategoria = await Categoria.create({
      nombre: nombre.trim()
    });

    return res.status(201).json({
      success: true,
      message: "Categoría creada exitosamente.",
      data: nuevaCategoria
    });
  })
);

// =========================================================================
// 2. LEER/OBTENER TODAS LAS CATEGORÍAS (GET /api/admins/categorias)
// =========================================================================
adminRoute.get(
  "/categorias",
  proteger,
  verificarRol(["Administrador"]),
  AsyncHandler(async (req, res) => {
    const categorias = await Categoria.findAll({
      order: [["nombre", "ASC"]] // Ordenadas alfabéticamente
    });

    return res.status(200).json({
      success: true,
      data: categorias
    });
  })
);

// =========================================================================
// 3. ACTUALIZAR CATEGORÍA (PUT /api/admins/categorias/:categoria_id)
// =========================================================================
adminRoute.put(
  "/categorias/:categoria_id",
  proteger,
  verificarRol(["Administrador"]),
  AsyncHandler(async (req, res) => {
    const { categoria_id } = req.params;
    const { nombre } = req.body;

    if (!nombre || nombre.trim() === "") {
      return res.status(400).json({
        success: false,
        message: "El nuevo nombre de la categoría no puede estar vacío."
      });
    }

    const categoria = await Categoria.findByPk(categoria_id);
    if (!categoria) {
      return res.status(404).json({
        success: false,
        message: "La categoría que deseas actualizar no existe."
      });
    }

    // Verificar si el nuevo nombre ya lo tiene otra categoría distinta
    const duplicado = await Categoria.findOne({
      where: {
        nombre: nombre.trim(),
        categoria_id: { [Op.ne]: categoria_id } // Excluir la categoría actual
      }
    });

    if (duplicado) {
      return res.status(400).json({
        success: false,
        message: "Ya existe otra categoría registrada con ese nombre."
      });
    }

    categoria.nombre = nombre.trim();
    await categoria.save();

    return res.status(200).json({
      success: true,
      message: "Categoría actualizada correctamente.",
      data: categoria
    });
  })
);

// =========================================================================
// 4. ELIMINAR CATEGORÍA (DELETE /api/admins/categorias/:categoria_id)
// =========================================================================
adminRoute.delete(
  "/categorias/:categoria_id",
  proteger,
  verificarRol(["Administrador"]),
  AsyncHandler(async (req, res) => {
    const { categoria_id } = req.params;

    const categoria = await Categoria.findByPk(categoria_id);
    if (!categoria) {
      return res.status(404).json({
        success: false,
        message: "La categoría que deseas eliminar no existe."
      });
    }

    // Nota: Por tus relaciones (onDelete: 'SET NULL'), los productos que 
    // pertenecían a esta categoría pasarán automáticamente a tener 'categoria_id: null'.
    await categoria.destroy();

    return res.status(200).json({
      success: true,
      message: "Categoría eliminada del sistema correctamente."
    });
  })
);

// =========================================================================
// 5. LISTAR TODAS LAS DISPUTAS (GET /api/admins/disputas)
// =========================================================================
// Permite al administrador ver todos los casos abiertos o cerrados en la app.
// =========================================================================
adminRoute.get("/disputas",
    proteger,
    verificarRol(["Administrador"]),
    AsyncHandler(async(req,res)=>{

        try{

            const disputas = await Disputa.findAll({
                where: {
                    estado: ["abierta", "en_investigacion"]
                },
                include: [
                    {
                        model: Pedido,
                        include: [
                            {
                                model: Producto,
                                attributes: [
                                    "producto_id",
                                    "titulo",
                                    "descripcion",
                                    "precio",
                                    "contacto_metodo",
                                    "contacto_telefono",
                                    "es_activo",
                                    "fecha_publicacion"
                                ],
                                include: [
                                    {
                                        model: Categoria,
                                        as: "Categoria",
                                        attributes: ["categoria_id", "nombre"]
                                    },
                                    {
                                        model: ProductoImagen,
                                        attributes: ["imagen_id", "url_imagen", "es_principal"]
                                    }
                                ]
                            },
                            {
                                model: HistoricoPedido,
                                include: [{ model: Usuario, as: "UsuarioAccion" }]
                            }
                        ]
                    },
                    {
                        model: Usuario,
                        as: "Comprador"
                    },
                    {
                        model: Usuario,
                        as: "Vendedor"
                    },
                    {
                        model: DisputaImagen,
                        attributes: ["imagen_id", "url_imagen", "es_principal"]
                    }
                ]
            });

            return res.status(200).json({
                success:true,
                data:disputas
            });

        }catch(error){

            console.log(error);
            return res.status(500).json({
                success:false,
                error:error.message,
                stack:error.stack
            });

        }

    })
);

// =========================================================================
// 6. RESOLVER DISPUTA (PUT /api/admins/disputas/:disputa_id/resolver)
// =========================================================================
// Dictamina el caso, ejecuta la acción física en PayPal y actualiza los estados.
// =========================================================================
adminRoute.put("/disputas/:disputa_id/resolver",
  proteger,
  verificarRol(["Administrador"]),
  AsyncHandler(async (req, res) => {
    const adminId = req.usuario.id;
    const { disputa_id } = req.params;
    const { veredicto, resolucion_texto } = req.body; // veredicto: 'REEMBOLSO' o 'PAGO_VENDEDOR'

    if (!veredicto || !["REEMBOLSO", "PAGO_VENDEDOR"].includes(veredicto)) {
      return res.status(400).json({ 
        success: false, 
        message: "El veredicto es obligatorio y debe ser 'REEMBOLSO' o 'PAGO_VENDEDOR'." 
      });
    }

    if (!resolucion_texto || resolucion_texto.trim() === "") {
      return res.status(400).json({ 
        success: false, 
        message: "Debes redactar una justificación/resolución de texto para cerrar el caso." 
      });
    }

    const disputa = await Disputa.findByPk(disputa_id, { include: [Pedido] });
    if (!disputa) {
      return res.status(404).json({ success: false, message: "La disputa solicitada no existe." });
    }

    if (disputa.estado !== "abierta" && disputa.estado !== "en_investigacion") {
      return res.status(400).json({ success: false, message: "Esta disputa ya fue resuelta o cerrada previamente." });
    }

    const pedido = disputa.Pedido;
    if (!pedido) {
      return res.status(404).json({ success: false, message: "El pedido asociado a esta disputa no fue localizado." });
    }

    const transaction = await sequelize.transaction();
    try {
      try {
        const accessToken = await obtenerPaypalAccessToken();

        if (veredicto === "REEMBOLSO") {
          const urlVoid = `${process.env.PAYPAL_API_URL}/v2/payments/authorizations/${pedido.paypal_capture_id}/void`;
          await fetch(urlVoid, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json"
            }
          });
        } else {
          const urlCapture = `${process.env.PAYPAL_API_URL}/v2/payments/authorizations/${pedido.paypal_capture_id}/capture`;
          await fetch(urlCapture, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({})
          });
        }
      } catch (paypalErr) {
        console.log("PayPal simulation (dispute resolution):", paypalErr.message);
      }

      if (veredicto === "REEMBOLSO") {
        await disputa.update({
          estado: "resuelta_reembolso",
          resolucion_texto: resolucion_texto.trim(),
          admin_id: adminId,
          fecha_resolucion: new Date()
        }, { transaction });

        await pedido.update({ estado: "cancelado_reembolsado" }, { transaction });

        // La publicación queda SUSPENDIDA: el vendedor deberá solicitarla relanzar
        // para que vuelva a estar disponible para otro comprador.
        if (pedido.producto_id) {
          await Producto.update(
            { es_activo: false, suspendido: true },
            { where: { producto_id: pedido.producto_id }, transaction }
          );
        }

        await HistoricoPedido.create({
          pedido_id: pedido.pedido_id,
          estado_anterior: "en_disputa",
          estado_nuevo: "cancelado_reembolsado",
          usuario_accion_id: adminId,
          notes_auditoria: `Reembolso al comprador aprobado por el administrador. Publicación suspendida. ${resolucion_texto.trim()}`
        }, { transaction });
      } else {
        await disputa.update({
          estado: "resuelta_pago_vendedor",
          resolucion_texto: resolucion_texto.trim(),
          admin_id: adminId,
          fecha_resolucion: new Date()
        }, { transaction });

        await pedido.update({ estado: "entregado_completado" }, { transaction });

        // La venta se completa: el producto queda vendido y sale del catálogo.
        if (pedido.producto_id) {
          await Producto.update(
            { es_activo: false, suspendido: false },
            { where: { producto_id: pedido.producto_id }, transaction }
          );
        }

        await HistoricoPedido.create({
          pedido_id: pedido.pedido_id,
          estado_anterior: "en_disputa",
          estado_nuevo: "entregado_completado",
          usuario_accion_id: adminId,
          notes_auditoria: `Disputa resuelta a favor del vendedor. Fondos liberados. ${resolucion_texto.trim()}`
        }, { transaction });
      }

      await transaction.commit();
      return res.status(200).json({
        success: true,
        message: `Disputa resuelta exitosamente con veredicto: ${veredicto}.`
      });

    } catch (error) {
      if (transaction && !transaction.finished) await transaction.rollback();
      console.error("Error al resolver disputa:", error);
      return res.status(500).json({ success: false, message: "Error interno al procesar la resolución." });
    }
  })
);

// =========================================================================
// 7. VER LOGS DE AUDITORÍA (GET /api/admins/auditoria-pedidos)
// =========================================================================
// Permite consultar la bitácora de cambios de estados en los pedidos.
// Soporta filtrado opcional por pedido: GET /api/admins/auditoria-pedidos?pedido_id=12
// =========================================================================
adminRoute.get("/auditoria-pedidos",
  proteger,
  verificarRol(["Administrador"]),
  AsyncHandler(async (req, res) => {
    const { pedido_id } = req.query;

    // Construimos la condición WHERE dinámicamente si envían un pedido_id
    const donde = {};
    if (pedido_id) {
      donde.pedido_id = pedido_id;
    }

    const logsAuditoria = await HistoricoPedido.findAll({
      where: donde,
      include: [
        {
          model: Pedido,
          attributes: ["pedido_id", "precio_final", "estado"]
        },
        {
          model: Usuario,
          as: "UsuarioAccion", // Usamos el alias definido en tus relaciones
          attributes: ["usuario_id", "nombre", "correo"]
        }
      ],
      order: [["fecha_cambio", "DESC"]] // Ver los cambios más recientes primero
    });

    return res.status(200).json({
      success: true,
      total_registros: logsAuditoria.length,
      data: logsAuditoria
    });
  })
);


// =========================================================================
// 8.VER USUARIOS ACORDE ESTATUS  (GET /api/admins/usuarios)
// =========================================================================
// Listar usuarios con su estatus de activación
// =========================================================================
adminRoute.get("/usuarios",
  proteger,
  verificarRol(["Administrador"]),
  AsyncHandler(async (req, res) => {
    const usuarios = await Usuario.findAll({
      attributes: ["usuario_id", "nombre", "correo", "telefono_defecto", "es_activo", "es_verificado", "fecha_registro"],
      include: [{ model: Rol, attributes: ["nombre"] }],
      order: [["usuario_id", "DESC"]]
    });

    return res.status(200).json({
      success: true,
      data: usuarios
    });
  })
);


// =========================================================================
// 9.BANEAR USUARIOS  (PUT /api/admin/usuarios/:usuario_id/estatus)
// =========================================================================
// Cambiar estado de activación (Baneo / Desbaneo)
// =========================================================================
adminRoute.put("/usuarios/:usuario_id/estatus",
  proteger,
  verificarRol(["Administrador"]),
  AsyncHandler(async (req, res) => {
    const { usuario_id } = req.params;
    const { es_activo } = req.body; // Esperamos true o false

    if (typeof es_activo !== "boolean") {
      return res.status(400).json({
        success: false,
        message: "El campo 'es_activo' es obligatorio y debe ser un valor booleano (true o false)."
      });
    }

    const usuario = await Usuario.findByPk(usuario_id);
    if (!usuario) {
      return res.status(404).json({
        success: false,
        message: "El usuario especificado no existe."
      });
    }

    // Evitar que el admin se desactive a sí mismo por error
    if (usuario.usuario_id === req.usuario.id) {
      return res.status(400).json({
        success: false,
        message: "No puedes desactivar tu propia cuenta de administrador."
      });
    }

    usuario.es_activo = es_activo;
    await usuario.save();

    const accion = es_activo ? "activada" : "desactivada / suspendida";

    return res.status(200).json({
      success: true,
      message: `La cuenta del usuario '${usuario.nombre}' ha sido ${accion} correctamente.`,
      usuario: {
        usuario_id: usuario.usuario_id,
        nombre: usuario.nombre,
        correo: usuario.correo,
        es_activo: usuario.es_activo
      }
    });
  })
);


// =========================================================================
// 8.5. LISTAR RETIROS PENDIENTES (GET /api/admin/retiros/pendientes)
// =========================================================================
adminRoute.get("/retiros/pendientes",
  proteger,
  verificarRol(["Administrador"]),
  AsyncHandler(async (req, res) => {
    const retiros = await RetiroVendedor.findAll({
      where: { estado: "pendiente" },
      include: [
        {
          model: Usuario,
          as: "Vendedor",
          attributes: ["usuario_id", "nombre", "correo"],
        },
      ],
      order: [["fecha_solicitud", "DESC"]],
    });

    return res.status(200).json({
      success: true,
      data: retiros,
    });
  })
);

// =========================================================================
// 9. APROBAR RETIRO DE VENDEDOR (POST /api/admins/retiros/:retiro_id/aprobar)
// =========================================================================
// Marca una solicitud de retiro como "procesado_payout" y registra el ID del
// lote de PayPal para dar trazabilidad al pago.
// =========================================================================
adminRoute.post("/retiros/:retiro_id/aprobar",
  proteger,
  verificarRol(["Administrador"]),
  AsyncHandler(async (req, res) => {
    const { retiro_id } = req.params;
    const { paypal_payout_batch_id } = req.body;

    if (!paypal_payout_batch_id || paypal_payout_batch_id.trim() === "") {
      return res.status(400).json({
        success: false,
        message: "El identificador del lote de pago de PayPal es obligatorio."
      });
    }

    const retiro = await RetiroVendedor.findByPk(retiro_id);
    if (!retiro) {
      return res.status(404).json({
        success: false,
        message: "La solicitud de retiro no existe."
      });
    }

    if (retiro.estado !== "pendiente") {
      return res.status(400).json({
        success: false,
        message: "La solicitud de retiro ya fue procesada o rechazada previamente."
      });
    }

    retiro.estado = "procesado_payout";
    retiro.paypal_payout_batch_id = paypal_payout_batch_id.trim();
    retiro.fecha_procesado = new Date();
    await retiro.save();

    return res.status(200).json({
      success: true,
      message: "Retiro aprobado y marcado como procesado exitosamente.",
      data: retiro
    });
  })
);


// =========================================================================
// 10. OBTENER KPIS Y REPORTE DE VENTAS (GET /api/admins/kpis-ventas)
// =========================================================================
// Retorna datos estructurados para renderizar gráficas y tarjetas en el Dashboard
// =========================================================================
adminRoute.get("/kpis-ventas",
  proteger,
  verificarRol(["Administrador"]),
  AsyncHandler(async (req, res) => {
    // 0. Obtener conteos de usuarios y disputas
    const totalUsuarios = await Usuario.count();
    const usuariosVerificados = await Usuario.count({ where: { es_verificado: true } });
    const disputasActivas = await Disputa.count({ where: { estado: ["abierta", "en_investigacion"] } });
    const productosPublicados = await Producto.count({ where: { es_activo: true } });

    // 1. Agrupamiento por Estado de Pedido (Monto total y Cantidad de pedidos)
    const desglosePorEstado = await Pedido.findAll({
      attributes: [
        "estado",
        [sequelize.fn("COUNT", sequelize.col("pedido_id")), "total_pedidos"],
        [sequelize.fn("COALESCE", sequelize.fn("SUM", sequelize.col("precio_final")), 0), "monto_total"]
      ],
      group: ["estado"],
      raw: true
    });

    // 2. Mapeo estructurado para fácil consumo en el Frontend (Evita valores indefinidos)
    const estadosTarget = ["entregado_completado", "pagado_escrow", "pendiente_pago", "en_disputa", "cancelado_reembolsado"];
    
    const estadosResumen = {};
    estadosTarget.forEach(estado => {
      const registro = desglosePorEstado.find(item => item.estado === estado);
      estadosResumen[estado] = {
        cantidad: registro ? parseInt(registro.total_pedidos, 10) : 0,
        monto: registro ? parseFloat(registro.monto_total) : 0.0
      };
    });

    // 3. Métricas Financieras Clave (KPI Cards)
    // Dinero procesado con éxito (entregado_completado) + retenciones activas (pagado_escrow)
    const totalIngresosConfirmados = estadosResumen.entregado_completado.monto;
    const totalEnEscrow = estadosResumen.pagado_escrow.monto;
    const totalVentasCompletadas = estadosResumen.entregado_completado.cantidad;
    
    // Ticket promedio de compra
    const ticketPromedio = totalVentasCompletadas > 0 
      ? (totalIngresosConfirmados / totalVentasCompletadas).toFixed(2) 
      : "0.00";

    // 4. Top 5 Productos más Vendidos (Para gráfica de barras)
    const topProductos = await Pedido.findAll({
      attributes: [
        "producto_id",
        [sequelize.fn("COUNT", sequelize.col("pedido_id")), "total_unidades_vendidas"],
        [sequelize.fn("SUM", sequelize.col("precio_final")), "monto_recaudado"]
      ],
      where: {
        estado: ["entregado_completado", "pagado_escrow"] // Solo contabilizamos ventas reales
      },
      include: [
        {
          model: Producto,
          attributes: ["titulo", "precio"]
        }
      ],
      group: ["producto_id", "Producto.producto_id"],
      order: [[sequelize.literal("total_unidades_vendidas"), "DESC"]],
      limit: 5
    });

    // 5. Respuesta JSON con la estructura ideal para el Frontend
    return res.status(200).json({
      success: true,
      kpis: {
        ingresos_confirmados: totalIngresosConfirmados,
        fondos_en_escrow: totalEnEscrow,
        pedidos_completados: totalVentasCompletadas,
        ticket_promedio: parseFloat(ticketPromedio),
        total_usuarios: totalUsuarios,
        usuarios_verificados: usuariosVerificados,
        disputas_activas: disputasActivas,
        productos_publicados: productosPublicados,
      },
      desglose_estados: estadosResumen,
      grafica_distribucion_estados: {
        labels: Object.keys(estadosResumen),
        cantidades: Object.values(estadosResumen).map(e => e.cantidad),
        montos: Object.values(estadosResumen).map(e => e.monto)
      },
      top_productos: topProductos
    });
  })
);

// =========================================================================
// 12. LISTAR SOLICITUDES DE RELANZAMIENTO (GET /api/admin/relanzamientos)
// =========================================================================
// Solicitudes del vendedor para volver a poner en línea una publicación
// suspendida tras un reembolso. Incluye producto, vendedor e imágenes.
// =========================================================================
adminRoute.get("/relanzamientos",
  proteger,
  verificarRol(["Administrador"]),
  AsyncHandler(async (req, res) => {
    try {
      const solicitudes = await SolicitudRelanzamiento.findAll({
        include: [
          {
            model: Producto,
            attributes: [
              "producto_id",
              "titulo",
              "descripcion",
              "precio",
              "es_activo",
              "suspendido",
              "fecha_publicacion"
            ],
            include: [
              { model: Categoria, as: "Categoria", attributes: ["categoria_id", "nombre"] },
              { model: ProductoImagen, attributes: ["imagen_id", "url_imagen", "es_principal"] }
            ]
          },
          { model: Usuario, as: "Vendedor", attributes: ["usuario_id", "nombre", "correo"] },
          { model: SolicitudRelanzamientoImagen, attributes: ["imagen_id", "url_imagen", "es_principal"] }
        ],
        order: [["fecha_solicitud", "DESC"]]
      });

      return res.status(200).json({ success: true, data: solicitudes });
    } catch (error) {
      console.error("Error al listar solicitudes de relanzamiento:", error);
      return res.status(500).json({ success: false, message: "Error interno al consultar las solicitudes de relanzamiento" });
    }
  })
);

// =========================================================================
// 13. REVISAR SOLICITUD DE RELANZAMIENTO (PUT /api/admin/relanzamientos/:solicitud_id/revisar)
// =========================================================================
// Aprobar: la publicación vuelve a estar activa para que otro comprador
// pueda comprarla. Rechazar: permanece suspendida.
// =========================================================================
adminRoute.put("/relanzamientos/:solicitud_id/revisar",
  proteger,
  verificarRol(["Administrador"]),
  AsyncHandler(async (req, res) => {
    const adminId = req.usuario.id;
    const { solicitud_id } = req.params;
    const { aprobada, resolucion_texto } = req.body;

    if (typeof aprobada !== "boolean") {
      return res.status(400).json({ success: false, message: "El campo 'aprobada' (booleano) es obligatorio." });
    }
    if (!resolucion_texto || resolucion_texto.trim() === "") {
      return res.status(400).json({ success: false, message: "Debes redactar una resolución para revisar la solicitud." });
    }

    const solicitud = await SolicitudRelanzamiento.findByPk(solicitud_id, { include: [Producto] });
    if (!solicitud) {
      return res.status(404).json({ success: false, message: "La solicitud de relanzamiento no existe." });
    }
    if (solicitud.estado !== "pendiente") {
      return res.status(400).json({ success: false, message: "Esta solicitud ya fue revisada previamente." });
    }

    const transaction = await sequelize.transaction();
    try {
      if (aprobada) {
        await solicitud.update({
          estado: "aprobada",
          resolucion_texto: resolucion_texto.trim(),
          admin_id: adminId,
          fecha_revision: new Date()
        }, { transaction });

        if (solicitud.producto_id) {
          await Producto.update(
            { es_activo: true, suspendido: false },
            { where: { producto_id: solicitud.producto_id }, transaction }
          );
        }
      } else {
        await solicitud.update({
          estado: "rechazada",
          resolucion_texto: resolucion_texto.trim(),
          admin_id: adminId,
          fecha_revision: new Date()
        }, { transaction });
      }

      await transaction.commit();
      return res.status(200).json({
        success: true,
        message: aprobada
          ? "Solicitud aprobada. La publicación volvió a estar en línea."
          : "Solicitud rechazada. La publicación permanece suspendida."
      });
    } catch (error) {
      if (transaction && !transaction.finished) await transaction.rollback();
      console.error("Error al revisar solicitud de relanzamiento:", error);
      return res.status(500).json({ success: false, message: "Error interno al procesar la revisión." });
    }
  })
);

module.exports = adminRoute;