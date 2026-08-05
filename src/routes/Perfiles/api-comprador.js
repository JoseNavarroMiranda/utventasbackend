const express = require("express");
const compradorRoute = express.Router();
const AsyncHandler = require("express-async-handler");
const { Pedido, Usuario, Producto, Categoria, Disputa, DisputaImagen } = require("../../models");
const { proteger, verificarRol } = require("../../middlewares/authMiddleware");
const upload = require("../../middlewares/upload");

// ======================================================================
// SUBIR IMÁGENES DE EVIDENCIA (POST /api/comprador/subir-imagen)
// ======================================================================
// El comprador sube imágenes para adjuntarlas a su disputa. Devuelve la
// URL absoluta de la imagen almacenada en /uploads.
// ======================================================================
compradorRoute.post(
  "/subir-imagen",
  proteger,
  verificarRol(["Comprador"]),
  upload.single("imagen"),
  AsyncHandler(async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "No se envió ninguna imagen" });
    }
    const baseUrl = `${req.protocol}://${req.get("host")}`;
    const url = `${baseUrl}/uploads/${req.file.filename}`;
    res.status(200).json({ success: true, url });
  })
);

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
            "precio",
            "contacto_metodo",
            "contacto_telefono"
          ],
          include: [
            {
              model: Categoria,
              as: "Categoria",
              attributes: ["nombre"]
            }
          ]
        },
        {
          model: Usuario,
          as: "Vendedor",
          attributes: [
            "usuario_id",
            "nombre",
            "correo",
            "telefono_defecto"
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
            "precio",
            "contacto_metodo",
            "contacto_telefono"
          ],
          include: [
            {
              model: Categoria,
              as: "Categoria",
              attributes: ["nombre"]
            }
          ]
        },
        {
          model: Usuario,
          as: "Vendedor",
          attributes: [
            "usuario_id",
            "nombre",
            "correo",
            "telefono_defecto"
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
    const { pedido_id, motivo, descripcion, imagenes } = req.body;

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

    if (!imagenes || !Array.isArray(imagenes) || imagenes.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Debes adjuntar al menos una imagen como evidencia de la disputa."
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
        descripcion: descripcion ? String(descripcion).trim() : null,
        estado: "abierta" // Definido por defecto en tu modelo, pero lo hacemos explícito
      }, { transaction: t });

      // B. Actualizar el estado del pedido a 'en_disputa'
      pedido.estado = "en_disputa";
      await pedido.save({ transaction: t });

      // C. Registrar las imágenes de evidencia adjuntadas por el comprador
      const datosImagenes = imagenes.map((img, index) => ({
        disputa_id: nuevaDisputa.disputa_id,
        url_imagen: img.url,
        es_principal: img.es_principal !== undefined ? img.es_principal : (index === 0)
      }));
      const tienePrincipal = datosImagenes.some(img => img.es_principal === true);
      if (!tienePrincipal && datosImagenes.length > 0) {
        datosImagenes[0].es_principal = true;
      }
      const imagenesRegistradas = await DisputaImagen.bulkCreate(datosImagenes, { transaction: t });

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
          descripcion: nuevaDisputa.descripcion,
          fecha_apertura: nuevaDisputa.fecha_apertura,
          imagenes: imagenesRegistradas.map(img => img.url_imagen)
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