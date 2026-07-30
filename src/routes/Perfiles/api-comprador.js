const express = require("express");
const compradorRoute = express.Router();
const AsyncHandler = require("express-async-handler");
const { Pedido, Usuario, Producto, Disputa} = require("../../models");
const { proteger, verificarRol } = require("../../middlewares/authMiddleware");

// ======================================================================
// HISTORIAL DE COMPRAS
// ======================================================================

compradorRoute.get(
  "/mis-compras",
  proteger,
  verificarRol(["Comprador"]),
  AsyncHandler(async (req, res) => {

    const compradorId = req.usuario.id;

    const compras = await Pedido.findAll({
      where: {
        comprador_id: compradorId
      },
      include: [
        {
          model: Producto,
          attributes: [
            "producto_id",
            "titulo",
            "precio"
          ]
        },
        {
          model: Usuario,
          as: "Vendedor",
          attributes: [
            "usuario_id",
            "nombre",
            "correo"
          ]
        }
      ],
      order: [["fecha_creacion", "DESC"]]
    });

    return res.status(200).json({
      success: true,
      message: "Historial obtenido correctamente.",
      compras
    });

  })
);

// ======================================================================
// DETALLE DE UNA COMPRA
// ======================================================================

compradorRoute.get(
  "/mis-compras/:pedido_id",
  proteger,
  verificarRol(["Comprador"]),
  AsyncHandler(async (req, res) => {

    const compradorId = req.usuario.id;
    const { pedido_id } = req.params;

    const compra = await Pedido.findOne({
      where: {
        pedido_id,
        comprador_id: compradorId
      },
      include: [
        {
          model: Producto,
          attributes: [
            "producto_id",
            "titulo",
            "descripcion",
            "precio"
          ]
        },
        {
          model: Usuario,
          as: "Vendedor",
          attributes: [
            "usuario_id",
            "nombre",
            "correo"
          ]
        }
      ]
    });

    if (!compra) {
      return res.status(404).json({
        success: false,
        message: "Compra no encontrada."
      });
    }

    return res.status(200).json({
      success: true,
      compra
    });

  })
);



// =========================================================================
// INICIAR UNA DISPUTA SOBRE UN PEDIDO (POST /api/compradores/disputas)
// =========================================================================
compradorRoute.post("/disputas",
  proteger,
  verificarRol(["Comprador"]),
  AsyncHandler(async (req, res) => {
    const compradorId = req.usuario.id;
    const { pedido_id, motivo } = req.body;

    // 1. Validaciones básicas
    if (!pedido_id) {
      return res.status(400).json({
        success: false,
        message: "El ID del pedido es obligatorio para iniciar una disputa."
      });
    }

    if (!motivo || motivo.trim() === "") {
      return res.status(400).json({
        success: false,
        message: "Debes proporcionar un motivo detallado para abrir la disputa."
      });
    }

    // 2. Buscar el pedido y validar que pertenezca al comprador actual
    const pedido = await Pedido.findOne({
      where: {
        pedido_id: pedido_id,
        comprador_id: compradorId
      }
    });

    if (!pedido) {
      return res.status(404).json({
        success: false,
        message: "El pedido solicitado no existe o no está asociado a tu cuenta."
      });
    }

    // 3. Control de Estado: Validar si es apto para disputa
    if (pedido.estado === "en_disputa") {
      return res.status(400).json({
        success: false,
        message: "Este pedido ya se encuentra bajo un proceso de disputa activo."
      });
    }

    if (pedido.estado !== "pagado_escrow") {
      return res.status(400).json({
        success: false,
        message: `No se puede disputar este pedido porque su estado actual es '${pedido.estado}'. Solo se pueden disputar pedidos en 'pagado_escrow'.`
      });
    }

    // 4. Iniciar Transacción Segura en MySQL
    const t = await Pedido.sequelize.transaction();

    try {
      // A. Crear el registro en la tabla disputas
      const nuevaDisputa = await Disputa.create({
        pedido_id: pedido.pedido_id,
        comprador_id: pedido.comprador_id,
        vendedor_id: pedido.vendedor_id,
        admin_id: null, // Se asignará cuando un administrador tome el caso
        motivo: motivo.trim(),
        estado: "abierta" // Definido por defecto en tu modelo, pero lo hacemos explícito
      }, { transaction: t });

      // B. Actualizar el estado del pedido a 'en_disputa'
      pedido.estado = "en_disputa";
      await pedido.save({ transaction: t });

      // Confirmar todos los cambios si todo salió bien
      await t.commit();

      return res.status(201).json({
        success: true,
        message: "La disputa ha sido abierta exitosamente. El pedido ha sido retenido y congelado hasta la resolución del administrador.",
        disputa: {
          disputa_id: nuevaDisputa.disputa_id,
          pedido_id: nuevaDisputa.pedido_id,
          estado_disputa: nuevaDisputa.estado,
          motivo: nuevaDisputa.motivo,
          fecha_apertura: nuevaDisputa.fecha_apertura
        }
      });

    } catch (error) {
      // Si algo falla, revertimos los cambios en la BD para que no quede huérfano el estado
      await t.rollback();
      return res.status(500).json({
        success: false,
        message: "Ocurrió un error interno al procesar e iniciar la disputa.",
        error: error.message
      });
    }
  })
);

module.exports = compradorRoute;