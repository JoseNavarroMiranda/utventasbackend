
const express = require("express");
const productoRoute = express.Router();
const AsyncHandler = require("express-async-handler");
const { Op } = require("sequelize");
const { Producto, Categoria, ProductoImagen, Usuario, Pedido } = require("../../models");

// =========================================================================
// 1. LISTADO, BÚSQUEDA Y FILTRADO DE PRODUCTOS (GET /api/productos)
// =========================================================================
// Esta API permite obtener todos los productos activos y soporta filtros opcionales:
// - ?buscar=arduino     -> Coincidencia parcial en título o descripción
// - ?categoria=ropa     -> Filtra por nombre exacto de la categoría (insensible a mayúsculas)
// - ?precio_min=100     -> Límite inferior de precio
// - ?precio_max=500     -> Límite superior de precio
// Siempre ordena priorizando 'es_premium = true' y luego los más recientes.
// =========================================================================
productoRoute.get(
  "/",
  AsyncHandler(async (req, res) => {
    try {
      const { buscar, categoria, precio_min, precio_max } = req.query;

      // Filtro base: Solo productos activos
      const whereConditions = {
        es_activo: true
      };

      // A) Filtro por término de búsqueda (Título o Descripción)
      if (buscar) {
        whereConditions[Op.or] = [
          { titulo: { [Op.like]: `%${buscar}%` } },
          { descripcion: { [Op.like]: `%${buscar}%` } }
        ];
      }

      // B) Filtro por rango de precios
      if (precio_min !== undefined || precio_max !== undefined) {
        whereConditions.precio = {};
        if (precio_min !== undefined) {
          whereConditions.precio[Op.gte] = parseFloat(precio_min);
        }
        if (precio_max !== undefined) {
          whereConditions.precio[Op.lte] = parseFloat(precio_max);
        }
      }

      // Estructura de carga asociada (Eager Loading)
      const includeConditions = [
        {
          model: ProductoImagen,
          attributes: ["imagen_id", "url_imagen", "es_principal"]
        },
        {
          model: Usuario,
          attributes: ["usuario_id", "nombre", "correo", "telefono_defecto", "verificado_como_vendedor"]
        }
      ];

      // C) Filtro por Nombre de Categoría
      const categoriaInclude = {
        model: Categoria,
        as: "Categoria",
        attributes: ["categoria_id", "nombre"]
      };

      if (categoria) {
        // Si el cliente envía una categoría, filtramos directamente desde la relación
        categoriaInclude.where = {
          nombre: { [Op.like]: `%${categoria}%` } // Búsqueda parcial o exacta del nombre de la categoría
        };
      }
      includeConditions.push(categoriaInclude);

      // Ejecutar consulta con ordenamiento prioritario:
      // 1° Premium primero (DESC de TRUE a FALSE)
      // 2° Más recientes primero (DESC)
      const productos = await Producto.findAll({
        where: whereConditions,
        include: includeConditions,
        order: [
          ["es_premium", "DESC"],
          ["fecha_publicacion", "DESC"]
        ]
      });

      return res.status(200).json({
        success: true,
        count: productos.length,
        data: productos
      });

    } catch (error) {
      console.error("Error al listar/filtrar productos en UTVentas:", error);
      return res.status(500).json({
        success: false,
        message: "Error interno del servidor al obtener el catálogo de productos"
      });
    }
  })
);


// =========================================================================
// 1.5 PRODUCTOS EN PROCESO DE COMPRA (GET /api/productos/en-proceso)
// =========================================================================
productoRoute.get(
  "/en-proceso",
  AsyncHandler(async (req, res) => {
    try {
      const pedidos = await Pedido.findAll({
        where: {
          // Solo ventas confirmadas (fondos en escrow). Un pedido 'pendiente_pago'
          // abandonado NO debe marcar el producto como "en proceso" para los demás.
          estado: ['pagado_escrow']
        },
        attributes: ['producto_id'],
        group: ['producto_id']
      });
      const ids = pedidos.map(p => p.producto_id);
      return res.json({ ids });
    } catch (error) {
      console.error("Error al obtener productos en proceso:", error);
      return res.status(500).json({ success: false, message: "Error interno del servidor" });
    }
  })
);

// =========================================================================
// 2. OBTENER DETALLE DE PRODUCTO POR ID (GET /api/productos/:id)
// =========================================================================
productoRoute.get(
  "/:id",
  AsyncHandler(async (req, res) => {
    try {
      const productoId = req.params.id;

      const producto = await Producto.findByPk(productoId, {
        include: [
          {
            model: Categoria,
            as: "Categoria",
            attributes: ["categoria_id", "nombre"]
          },
          {
            model: ProductoImagen,
            attributes: ["imagen_id", "url_imagen", "es_principal"]
          },
          {
            model: Usuario,
            attributes: ["usuario_id", "nombre", "correo", "telefono_defecto", "verificado_como_vendedor"]
          }
        ]
      });

      if (!producto) {
        return res.status(404).json({
          success: false,
          message: "El producto solicitado no existe"
        });
      }

      // Validar si el producto está pausado/inactivo
      if (!producto.es_activo) {
        return res.status(400).json({
          success: false,
          message: "Este artículo ya no está disponible para la venta (fue vendido o pausado)"
        });
      }

      return res.status(200).json({
        success: true,
        data: producto
      });

    } catch (error) {
      console.error("Error al obtener detalle de producto:", error);
      return res.status(500).json({
        success: false,
        message: "Error interno del servidor al consultar el detalle del producto"
      });
    }
  })
);

module.exports = productoRoute;