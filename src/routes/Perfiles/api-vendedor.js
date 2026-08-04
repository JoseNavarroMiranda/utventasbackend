const express = require("express");
const vendedorRoute = express.Router();
const AsyncHandler = require("express-async-handler");
const { Producto, Categoria, ProductoImagen, TransaccionPremium, Pedido, Usuario, RetiroVendedor, sequelize } = require("../../models");
const { proteger, verificarRol } = require("../../middlewares/authMiddleware");
const upload = require("../../middlewares/upload");


// Helper para obtener el token de acceso de PayPal mediante OAuth 2.0
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


// ==========================================
// API SUBIR IMÁGENES (POST /subir-imagen)
// ==========================================
vendedorRoute.post(
  "/subir-imagen",
  proteger,
  verificarRol(["Vendedor"]),
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

// ==========================================
// API CREAR PRODUCTO (POST /productos)
// ==========================================
vendedorRoute.post(
  "/crear",
  proteger,
  verificarRol(["Vendedor"]),
  AsyncHandler(async (req, res) => {
    const transaction = await sequelize.transaction();

    try {
      const {
        titulo,
        descripcion,
        precio,
        categoria_nombre, // <-- Ahora recibimos el nombre de la categoría en lugar del ID
        contacto_telefono,
        contacto_metodo,
        imagenes 
      } = req.body;

      // 1. Validaciones de campos obligatorios
      if (!titulo || !descripcion || precio === undefined || !categoria_nombre) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: "Los campos título, descripción, precio y categoría_nombre son obligatorios"
        });
      }

      // 2. Buscar la categoría por su nombre (insensible a mayúsculas/minúsculas)
      const categoriaEncontrada = await Categoria.findOne({
        where: sequelize.where(
          sequelize.fn('lower', sequelize.col('nombre')),
          categoria_nombre.toLowerCase()
        ),
        transaction
      });

      if (!categoriaEncontrada) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: `La categoría '${categoria_nombre}' no existe. Asegúrate de escribirla correctamente.`
        });
      }

      // 3. Determinar el teléfono de contacto
      const telefonoFinal = contacto_telefono || req.usuario.telefono_defecto;
      if (!telefonoFinal) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: "Se requiere un teléfono de contacto. Define uno en la petición o actualiza tu perfil"
        });
      }

      // 4. Crear el Producto usando el id de la categoría que encontramos
      const nuevoProducto = await Producto.create({
        usuario_id: req.usuario.id, 
        categoria_id: categoriaEncontrada.categoria_id, // <-- ID obtenido dinámicamente
        titulo: titulo,
        descripcion: descripcion,
        precio: precio,
        contacto_telefono: telefonoFinal,
        contacto_metodo: contacto_metodo || 'whatsapp',
        es_activo: true,
        es_premium: false 
      }, { transaction });

      // 5. Registrar las imágenes si fueron enviadas
      let imagenesRegistradas = [];
      if (imagenes && Array.isArray(imagenes) && imagenes.length > 0) {
        
        const datosImagenes = imagenes.map((img, index) => {
          return {
            producto_id: nuevoProducto.producto_id,
            url_imagen: img.url,
            es_principal: img.es_principal !== undefined ? img.es_principal : (index === 0)
          };
        });

        // Asegurarnos de que al menos una sea principal
        const tienePrincipal = datosImagenes.some(img => img.es_principal === true);
        if (!tienePrincipal && datosImagenes.length > 0) {
          datosImagenes[0].es_principal = true;
        }

        imagenesRegistradas = await ProductoImagen.bulkCreate(datosImagenes, { transaction });
      }

      await transaction.commit();

      return res.status(201).json({
        success: true,
        message: "¡Producto publicado exitosamente en el marketplace de la UTJ!",
        data: {
          producto: {
            producto_id: nuevoProducto.producto_id,
            titulo: nuevoProducto.titulo,
            descripcion: nuevoProducto.descripcion,
            precio: nuevoProducto.precio,
            contacto_telefono: nuevoProducto.contacto_telefono,
            contacto_metodo: nuevoProducto.contacto_metodo,
            categoria_nombre: categoriaEncontrada.nombre, // Devolvemos el nombre formateado
            es_activo: nuevoProducto.es_activo,
            fecha_publicacion: nuevoProducto.fecha_publicacion
          },
          imagenes: imagenesRegistradas
        }
      });

    } catch (error) {
      if (transaction && !transaction.finished) {
        await transaction.rollback();
      }
      console.error("Error al crear producto con categoría por nombre:", error);
      return res.status(500).json({
        success: false,
        message: "Error interno del servidor al publicar el producto"
      });
    }
  })
);

// ==========================================
// API EDITAR PRODUCTO (PUT /productos/editar/:id)
// ==========================================
vendedorRoute.put(
  "/editar/:id",
  proteger,
  verificarRol(["Vendedor"]),
  AsyncHandler(async (req, res) => {
    const transaction = await sequelize.transaction();

    try {
      const productoId = req.params.id;
      const {
        titulo,
        descripcion,
        precio,
        es_activo,
        categoria_nombre,
        contacto_telefono,
        contacto_metodo,
        imagenes // Array de URLs: [{ url: "...", es_principal: true/false }]
      } = req.body;

      // 1. Buscar el producto existente
      const producto = await Producto.findByPk(productoId, { transaction });

      if (!producto) {
        await transaction.rollback();
        return res.status(404).json({
          success: false,
          message: "El producto que intentas editar no existe"
        });
      }

      // 2. Control de Acceso: Verificar que el producto le pertenezca al vendedor que hace la petición
      if (producto.usuario_id !== req.usuario.id) {
        await transaction.rollback();
        return res.status(403).json({
          success: false,
          message: "No tienes permisos para editar este producto porque no eres el propietario"
        });
      }

      // 3. Objeto con campos a actualizar
      const camposActualizar = {};

      if (titulo !== undefined) camposActualizar.titulo = titulo;
      if (descripcion !== undefined) camposActualizar.descripcion = descripcion;
      if (precio !== undefined) camposActualizar.precio = precio;
      if (es_activo !== undefined) camposActualizar.es_activo = es_activo;
      if (contacto_telefono !== undefined) camposActualizar.contacto_telefono = contacto_telefono;
      if (contacto_metodo !== undefined) camposActualizar.contacto_metodo = contacto_metodo;

      // 4. Si actualizan la categoría por nombre
      if (categoria_nombre) {
        const categoriaEncontrada = await Categoria.findOne({
          where: sequelize.where(
            sequelize.fn('lower', sequelize.col('nombre')),
            categoria_nombre.toLowerCase()
          ),
          transaction
        });

        if (!categoriaEncontrada) {
          await transaction.rollback();
          return res.status(400).json({
            success: false,
            message: `La categoría '${categoria_nombre}' no existe`
          });
        }
        camposActualizar.categoria_id = categoriaEncontrada.categoria_id;
      }

      // Actualizar los datos del producto
      await producto.update(camposActualizar, { transaction });

      // 5. Manejo y actualización de imágenes (si se envían en la petición)
      let nuevasImagenes = [];
      if (imagenes && Array.isArray(imagenes)) {
        // Eliminamos las imágenes anteriores asociadas a este producto
        await ProductoImagen.destroy({
          where: { producto_id: producto.producto_id },
          transaction
        });

        if (imagenes.length > 0) {
          const datosImagenes = imagenes.map((img, index) => {
            return {
              producto_id: producto.producto_id,
              url_imagen: img.url,
              es_principal: img.es_principal !== undefined ? img.es_principal : (index === 0)
            };
          });

          // Asegurar que al menos una imagen sea la principal
          const tienePrincipal = datosImagenes.some(img => img.es_principal === true);
          if (!tienePrincipal) {
            datosImagenes[0].es_principal = true;
          }

          nuevasImagenes = await ProductoImagen.bulkCreate(datosImagenes, { transaction });
        }
      } else {
        // Si no se enviaron imágenes nuevas, recuperamos las existentes para retornarlas en la respuesta
        nuevasImagenes = await ProductoImagen.findAll({
          where: { producto_id: producto.producto_id },
          transaction
        });
      }

      await transaction.commit();

      // Consultar el nombre final de la categoría para la respuesta de cara al frontend
      const categoriaFinal = await Categoria.findByPk(producto.categoria_id);

      return res.status(200).json({
        success: true,
        message: "¡Producto actualizado exitosamente!",
        data: {
          producto: {
            producto_id: producto.producto_id,
            titulo: producto.titulo,
            descripcion: producto.descripcion,
            precio: producto.precio,
            es_activo: producto.es_activo,
            contacto_telefono: producto.contacto_telefono,
            contacto_metodo: producto.contacto_metodo,
            categoria_nombre: categoriaFinal ? categoriaFinal.nombre : null,
            fecha_publicacion: producto.fecha_publicacion
          },
          imagenes: nuevasImagenes
        }
      });

    } catch (error) {
      if (transaction && !transaction.finished) {
        await transaction.rollback();
      }
      console.error("Error al editar el producto:", error);
      return res.status(500).json({
        success: false,
        message: "Error interno del servidor al editar el producto"
      });
    }
  })
);

// ==========================================
// API ELIMINAR PRODUCTO (DELETE /productos/eliminar/:id)
// ==========================================
vendedorRoute.delete(
  "/eliminar/:id",
  proteger,
  verificarRol(["Vendedor"]),
  AsyncHandler(async (req, res) => {
    const transaction = await sequelize.transaction();

    try {
      const productoId = req.params.id;

      // 1. Buscar el producto existente
      const producto = await Producto.findByPk(productoId, { transaction });

      if (!producto) {
        await transaction.rollback();
        return res.status(404).json({
          success: false,
          message: "El producto que intentas eliminar no existe"
        });
      }

      // 2. Control de Acceso: Verificar que el producto pertenezca al vendedor logueado
      if (producto.usuario_id !== req.usuario.id) {
        await transaction.rollback();
        return res.status(403).json({
          success: false,
          message: "No tienes permisos para eliminar este producto porque no eres el propietario"
        });
      }

      // 3. Eliminar el producto
      // Gracias al onDelete: 'CASCADE', esto borrará en automático las fotos en producto_imagenes
      await producto.destroy({ transaction });

      await transaction.commit();

      return res.status(200).json({
        success: true,
        message: "¡Producto y sus imágenes asociadas eliminados correctamente del marketplace!"
      });

    } catch (error) {
      if (transaction && !transaction.finished) {
        await transaction.rollback();
      }
      console.error("Error al eliminar el producto:", error);
      return res.status(500).json({
        success: false,
        message: "Error interno del servidor al eliminar el producto"
      });
    }
  })
);

// =========================================================================
// API MIS PUBLICACIONES (GET /api/vendedor/mis-publicaciones)
// =========================================================================
// Permite al vendedor logueado listar todos los productos que ha publicado,
// incluyendo tanto los activos como los inactivos/pausados.
// =========================================================================

vendedorRoute.get("/mis-publicaciones",
  proteger,
  verificarRol(["Vendedor"]),
  AsyncHandler(async (req, res) => {
    try {
      // Obtenemos el ID del vendedor autenticado desde el middleware 'proteger'
      const vendedorId = req.usuario.id;

      // Buscar todos los productos que pertenecen a este vendedor
      const publicaciones = await Producto.findAll({
        where: {
          usuario_id: vendedorId
        },
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
        ],
        // Ordenamos por fecha de publicación (los más recientes primero)
        order: [["fecha_publicacion", "DESC"]]
      });

      return res.status(200).json({
        success: true,
        count: publicaciones.length,
        data: publicaciones
      });

    } catch (error) {
      console.error("Error al obtener las publicaciones del vendedor:", error);
      return res.status(500).json({
        success: false,
        message: "Error interno del servidor al consultar tus publicaciones"
      });
    }
  })
);

// =========================================================================
// API OBTENER UNA PUBLICACIÓN ESPECÍFICA POR ID (GET /api/vendedor/mis-publicaciones/:id)
// =========================================================================
vendedorRoute.get("/mis-publicaciones/:id",
  proteger,
  verificarRol(["Vendedor"]),
  AsyncHandler(async (req, res) => {
    try {
      const productoId = req.params.id;
      const vendedorId = req.usuario.id; // Extraído de forma segura por el middleware 'proteger'

      // Buscar el producto con sus imágenes y categoría
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
          }
        ]
      });

      // 1. Validar si el producto existe
      if (!producto) {
        return res.status(404).json({
          success: false,
          message: "La publicación solicitada no existe"
        });
      }

      // 2. Control de Acceso: Validar que el vendedor actual sea el dueño del producto
      if (producto.usuario_id !== vendedorId) {
        return res.status(403).json({
          success: false,
          message: "No tienes permisos para ver esta publicación porque no eres el propietario"
        });
      }

      // Si todo es correcto, devolvemos el producto (activo o inactivo)
      return res.status(200).json({
        success: true,
        data: producto
      });

    } catch (error) {
      console.error("Error al obtener la publicación del vendedor:", error);
      return res.status(500).json({
        success: false,
        message: "Error interno del servidor al consultar la publicación"
      });
    }
  })
);



// =========================================================================
// API CONTRATAR PREMIUM (PUT /api/vendedor/promover-premium/:id)
// =========================================================================
// Recibe el 'orderId' opcional de PayPal, captura el pago y activa la
// visibilidad premium del producto por los días contratados.
// El pago PayPal se simula (try/catch) para no bloquear el flujo.
// =========================================================================
vendedorRoute.put("/promover-premium/:id",
  proteger,
  verificarRol(["Vendedor"]),
  AsyncHandler(async (req, res) => {
    const productoId = req.params.id;
    const vendedorId = req.usuario.id;
    const { orderId, dias } = req.body;

    // 1. Verificar existencia y propiedad del producto
    const producto = await Producto.findByPk(productoId);
    if (!producto) {
      return res.status(404).json({ success: false, message: "El producto que deseas promover no existe" });
    }

    if (producto.usuario_id !== vendedorId) {
      return res.status(403).json({ success: false, message: "No tienes autorización para alterar este producto" });
    }

    if (producto.es_premium) {
      return res.status(400).json({ success: false, message: "Este producto ya es premium" });
    }

    const transaction = await sequelize.transaction();
    try {
      // 2. Intentar capturar el pago en PayPal (simulado si falla)
      if (orderId) {
        try {
          const accessToken = await obtenerPaypalAccessToken();
          const urlCapture = `${process.env.PAYPAL_API_URL}/v2/checkout/orders/${orderId}/capture`;
          const responsePaypal = await fetch(urlCapture, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json"
            }
          });
          const datosPago = await responsePaypal.json();
          if (datosPago.status !== "COMPLETED") {
          }
        } catch (paypalErr) {
        }
      }

      // 3. Calcular fechas según el plan
      const ahora = new Date();
      const fechaExpiracion = new Date();
      const totalDias = dias || 30;
      fechaExpiracion.setDate(ahora.getDate() + totalDias);

      // Calcular monto: $5 USD base para 30 días, proporcional para otros planes
      const monto = parseFloat(((totalDias / 30) * 5).toFixed(2));

      // A) Crear registro histórico del pago
      await TransaccionPremium.create({
        usuario_id: vendedorId,
        producto_id: productoId,
        monto,
        tipo_pago: "destacado_premium",
        fecha_pago: ahora,
        expiracion: fechaExpiracion
      }, { transaction });

      // B) Actualizar el estado premium directamente en el Producto
      await producto.update({
        es_premium: true,
        premium_hasta: fechaExpiracion
      }, { transaction });

      await transaction.commit();

      return res.status(200).json({
        success: true,
        message: `¡Felicidades! Tu producto '${producto.titulo}' ahora es Premium hasta el ${fechaExpiracion.toLocaleDateString()}`,
        data: {
          producto_id: producto.producto_id,
          es_premium: producto.es_premium,
          premium_hasta: producto.premium_hasta
        }
      });

    } catch (error) {
      if (transaction && !transaction.finished) {
        await transaction.rollback();
      }
      console.error("Fallo crítico al procesar la suscripción premium:", error);
      return res.status(500).json({
        success: false,
        message: "Error de servidor al registrar la suscripción premium"
      });
    }
  })
);


// =========================================================================
// 1. LISTA GENERAL DE VENTAS PARA EL VENDEDOR (GET /api/vendedores/historial-ventas)
// =========================================================================
// ======================================================================
// HISTORIAL DE VENTAS
// ======================================================================

vendedorRoute.get("/historial-ventas",
  proteger,
  verificarRol(["Vendedor"]),
  AsyncHandler(async (req, res) => {

    const vendedorId = req.usuario.id;

    const ventas = await Pedido.findAll({
      where: {
        vendedor_id: vendedorId
      },
      include: [
        {
          model: Producto,
          attributes: [
            "producto_id",
            "titulo",
            "precio",
            "es_activo"
          ]
        },
        {
          model: Usuario,
          as: "Comprador",
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
      message: "Historial de ventas obtenido correctamente.",
      ventas
    });

  })
);
// =========================================================================
// 2. DETALLE DE PEDIDO INDIVIDUAL PARA VENDEDOR (GET /api/vendedores/ventas/:pedido_id)
// =========================================================================
// ======================================================================
// DETALLE DE UNA VENTA
// ======================================================================

vendedorRoute.get("/ventas/:pedido_id", proteger,
  verificarRol(["Vendedor"]),
  AsyncHandler(async (req, res) => {

    const vendedorId = req.usuario.id;
    const { pedido_id } = req.params;

    const venta = await Pedido.findOne({
      where: {
        pedido_id,
        vendedor_id: vendedorId
      },
      include: [
        {
          model: Producto,
          attributes: [
            "producto_id",
            "titulo",
            "descripcion",
            "precio",
            "es_activo"
          ]
        },
        {
          model: Usuario,
          as: "Comprador",
          attributes: [
            "usuario_id",
            "nombre",
            "correo"
          ]
        }
      ]
    });

    if (!venta) {
      return res.status(404).json({
        success: false,
        message: "La venta solicitada no existe o no pertenece a tu cuenta."
      });
    }

    const respuestaSegura = venta.toJSON();

    // Solo mostrar el token cuando la compra ya fue completada
    if (respuestaSegura.estado !== "entregado_completado") {
      delete respuestaSegura.token_entrega;
    }

    return res.status(200).json({
      success: true,
      venta: respuestaSegura
    });

  })
);

// =========================================================================
// VERIFICAR VENDEDOR (POST /api/vendedor/verificar)
// =========================================================================
// Marca al vendedor como verificado. El pago PayPal se simula (try/catch).
// =========================================================================
vendedorRoute.post("/verificar",
  proteger,
  verificarRol(["Vendedor"]),
  AsyncHandler(async (req, res) => {
    const vendedorId = req.usuario.id;
    const { orderId } = req.body;

    const vendedor = await Usuario.findByPk(vendedorId);
    if (!vendedor) {
      return res.status(404).json({ success: false, message: "Vendedor no encontrado" });
    }

    if (vendedor.verificado_como_vendedor) {
      return res.status(400).json({ success: false, message: "Ya estás verificado como vendedor" });
    }

    try {
      if (orderId) {
        try {
          const accessToken = await obtenerPaypalAccessToken();
          const urlCapture = `${process.env.PAYPAL_API_URL}/v2/checkout/orders/${orderId}/capture`;
          const responsePaypal = await fetch(urlCapture, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json"
            }
          });
          const datosPago = await responsePaypal.json();
          if (datosPago.status !== "COMPLETED") {
          }
        } catch (paypalErr) {
        }
      }

      await vendedor.update({ verificado_como_vendedor: true });

      return res.status(200).json({
        success: true,
        message: "¡Felicidades! Ahora eres un vendedor verificado.",
        data: { verificado_como_vendedor: true }
      });

    } catch (error) {
      console.error("Error al verificar vendedor:", error);
      return res.status(500).json({
        success: false,
        message: "Error interno al procesar la verificación"
      });
    }
  })
);

// =========================================================================
// CREAR ORDEN PAYPAL (POST /api/vendedor/crear-orden-paypal)
// =========================================================================
// Endpoint auxiliar para generar una orden de PayPal con un monto específico
// sin crear un pedido en la base de datos (usado para premium/destacados).
// =========================================================================
vendedorRoute.post("/crear-orden-paypal",
  proteger,
  verificarRol(["Vendedor"]),
  AsyncHandler(async (req, res) => {
    const { monto, descripcion } = req.body;

    if (!monto) {
      return res.status(400).json({ success: false, message: "El monto es obligatorio" });
    }

    try {
      const accessToken = await obtenerPaypalAccessToken();

      const paypalOrderPayload = {
        intent: "CAPTURE",
        purchase_units: [
          {
            amount: {
              currency_code: "MXN",
              value: parseFloat(monto).toFixed(2)
            },
            description: descripcion || "Pago en UTVentas"
          }
        ],
        application_context: {
          return_url: "https://example.com/success",
          cancel_url: "https://example.com/cancel",
          user_action: "CONTINUE",
          shipping_preference: "NO_SHIPPING"
        }
      };

      const responsePaypal = await fetch(`${process.env.PAYPAL_API_URL}/v2/checkout/orders`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(paypalOrderPayload)
      });

      const orderPaypal = await responsePaypal.json();

      if (!orderPaypal.id) {
        return res.status(500).json({
          success: false,
          message: "Error al comunicarse con PayPal",
          paypalOrderId: null
        });
      }

      return res.status(201).json({
        success: true,
        id: orderPaypal.id
      });

    } catch (error) {
      console.error("Error al crear orden PayPal:", error);
      return res.status(500).json({
        success: false,
        message: "Error interno al crear la orden de PayPal",
        paypalOrderId: null
      });
    }
  })
);

// =========================================================================
// SOLICITAR RETIRO (POST /api/vendedor/solicitar-retiro)
// =========================================================================
vendedorRoute.post("/solicitar-retiro",
  proteger,
  verificarRol(["Vendedor"]),
  AsyncHandler(async (req, res) => {
    const vendedorId = req.usuario.id;
    const { correo_paypal_destino, pedido_id } = req.body;

    if (!correo_paypal_destino || !pedido_id) {
      return res.status(400).json({ success: false, message: "El correo PayPal y el pedido son obligatorios" });
    }

    // Verificar que el pedido pertenece al vendedor y está completado
    const pedido = await Pedido.findOne({
      where: { pedido_id, vendedor_id: vendedorId, estado: "entregado_completado" }
    });
    if (!pedido) {
      return res.status(400).json({ success: false, message: "El pedido no existe o no está completado" });
    }

    // Verificar que no haya un retiro previo para este pedido
    const retiroExistente = await RetiroVendedor.findOne({ where: { pedido_id } });
    if (retiroExistente) {
      return res.status(400).json({ success: false, message: "Este pedido ya tiene un retiro solicitado" });
    }

    const retiro = await RetiroVendedor.create({
      vendedor_id: vendedorId,
      pedido_id,
      monto_neto: pedido.precio_final,
      correo_paypal_destino: correo_paypal_destino.trim(),
      estado: "pendiente"
    });

    return res.status(201).json({
      success: true,
      message: "Solicitud de retiro creada exitosamente",
      data: retiro
    });
  })
);

// =========================================================================
// MIS RETIROS (GET /api/vendedor/mis-retiros)
// =========================================================================
vendedorRoute.get("/mis-retiros",
  proteger,
  verificarRol(["Vendedor"]),
  AsyncHandler(async (req, res) => {
    const vendedorId = req.usuario.id;

    const retiros = await RetiroVendedor.findAll({
      where: { vendedor_id: vendedorId },
      order: [["fecha_solicitud", "DESC"]]
    });

    return res.status(200).json({
      success: true,
      data: retiros
    });
  })
);

module.exports = vendedorRoute;


 