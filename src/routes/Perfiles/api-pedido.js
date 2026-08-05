const express = require("express");
const pedidoRoute = express.Router();
const AsyncHandler = require("express-async-handler");
const { Op } = require("sequelize");
const { Pedido, Producto, HistoricoPedido, Usuario, sequelize } = require('../../models');
const { proteger, verificarRol } = require("../../middlewares/authMiddleware");
const nodemailer = require("nodemailer");
require('dotenv').config();

// Configuración del transportador de Nodemailer
const transporreCorreo = nodemailer.createTransport({
  service: "gmail", // Puedes cambiarlo por el host de tu proveedor si no usas Gmail
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

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

// Best effort: anula una autorización de PayPal que ya no se utilizará
// (por ejemplo, cuando el producto fue comprado por otro cliente primero).
const anularAutorizacionPaypal = async (authorizationId) => {
  try {
    const accessToken = await obtenerPaypalAccessToken();
    await fetch(`${process.env.PAYPAL_API_URL}/v2/payments/authorizations/${authorizationId}/void`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      }
    });
  } catch (error) {
    console.error("No se pudo anular la autorización de PayPal:", error.message);
  }
};

// =========================================================================
// API GENERAR PEDIDO - ESCROW CON NOTIFICACIÓN (POST /api/pedidos/)
// =========================================================================
pedidoRoute.post(
  "/",
  proteger,
  verificarRol(["Comprador"]),
  AsyncHandler(async (req, res) => {
    const compradorId = req.usuario.id;
    const { producto_id } = req.body;

    if (!producto_id) {
      return res.status(400).json({ success: false, message: "El producto_id es obligatorio" });
    }

    // 1. Validar producto e información asociada
    const producto = await Producto.findByPk(producto_id);
    if (!producto) {
      return res.status(404).json({ success: false, message: "El producto no existe" });
    }

    if (!producto.es_activo) {
      return res.status(400).json({ success: false, message: "Este producto ya no se encuentra disponible" });
    }

    if (producto.usuario_id === compradorId) {
      return res.status(400).json({ success: false, message: "No puedes comprar tu propio artículo" });
    }

    // 2. Solo se bloquea el producto si la venta YA está confirmada (fondos en escrow).
    // Un checkout abandonado NO debe dejar el producto en "pendiente_pago" ni impedir
    // que otro cliente lo compre: aquí NO se crea el pedido ni se desactiva el producto.
    const ventaEnProceso = await Pedido.findOne({
      where: {
        producto_id,
        estado: ['pagado_escrow', 'en_disputa']
      }
    });
    if (ventaEnProceso) {
      return res.status(400).json({ success: false, message: 'Este producto ya fue comprado y está en proceso de entrega' });
    }

    try {
      // 3. Conectarse a PayPal con intención AUTHORIZE (Escrow)
      const accessToken = await obtenerPaypalAccessToken();

      const paypalOrderPayload = {
        intent: "AUTHORIZE",
        purchase_units: [
          {
            amount: {
              currency_code: "MXN",
              value: parseFloat(producto.precio).toFixed(2)
            },
            description: `Compra en UTVentas: ${producto.titulo}`
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
          message: "Error al comunicarse con la pasarela de PayPal",
          detalles: orderPaypal
        });
      }

      // 4. El pedido se registra en la BD únicamente cuando el comprador confirma
      // el pago en PayPal (ver PUT /confirmar-retencion). Si abandona el modal,
      // el producto sigue disponible en el dashboard para cualquier otro cliente.
      return res.status(201).json({
        success: true,
        message: "Orden de PayPal generada. Confirma el pago en PayPal para finalizar tu compra.",
        data: {
          paypal_order_id: orderPaypal.id
        }
      });

    } catch (error) {
      console.error("Error crítico al generar orden de PayPal:", error);
      return res.status(500).json({
        success: false,
        message: "Error interno del servidor al procesar el pedido"
      });
    }
  })
);

// =========================================================================
// CONFIRMAR RETENCIÓN EN ESCROW (PUT /api/pedidos/confirmar-retencion)
// =========================================================================
// El comprador confirma el pago en PayPal. Solo en este momento se registra
// el Pedido en la BD (con su PIN), se desactiva el producto y se congelan los
// fondos (authorize). Si el comprador abandona el Pago en PayPal, nunca llega
// aquí y el producto sigue disponible en el dashboard para otros clientes.
// =========================================================================
pedidoRoute.put(
  "/confirmar-retencion",
  proteger,
  verificarRol(["Comprador"]),
  AsyncHandler(async (req, res) => {
    const { paypal_order_id, producto_id } = req.body;
    const compradorId = req.usuario.id;

    if (!paypal_order_id) {
      return res.status(400).json({ success: false, message: "El paypal_order_id es requerido" });
    }

    // 1. Pedido ya registrado (compatibilidad con pedidos generados antes del cambio)
    const pedidoExistente = await Pedido.findOne({ where: { paypal_order_id } });

    let producto;
    if (pedidoExistente) {
      producto = await Producto.findByPk(pedidoExistente.producto_id);
    } else {
      if (!producto_id) {
        return res.status(400).json({ success: false, message: "El producto_id es requerido para confirmar el pago" });
      }
      producto = await Producto.findByPk(producto_id);
      if (!producto) {
        return res.status(404).json({ success: false, message: "El producto no existe" });
      }
      if (!producto.es_activo) {
        return res.status(400).json({ success: false, message: "Este producto ya no se encuentra disponible" });
      }
      if (producto.usuario_id === compradorId) {
        return res.status(400).json({ success: false, message: "No puedes comprar tu propio artículo" });
      }
    }

    if (pedidoExistente && pedidoExistente.estado !== "pendiente_pago") {
      return res.status(400).json({ success: false, message: "El pedido no está en estado pendiente de pago" });
    }

    // 2. Pre-chequeo: ¿el producto ya fue comprado por otro cliente?
    const ventaPrevia = await Pedido.findOne({
      where: {
        producto_id: producto.producto_id,
        estado: ['pagado_escrow', 'en_disputa', 'entregado_completado'],
        paypal_order_id: { [Op.ne]: paypal_order_id }
      }
    });
    if (ventaPrevia) {
      return res.status(400).json({ success: false, message: "Este producto ya fue comprado por otro cliente" });
    }

    // 3. Autorizar la orden en PayPal para congelar los fondos
    let authorizationId;
    try {
      const accessToken = await obtenerPaypalAccessToken();
      const urlAuthorize = `${process.env.PAYPAL_API_URL}/v2/checkout/orders/${paypal_order_id}/authorize`;
      const responsePaypal = await fetch(urlAuthorize, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json"
        }
      });
      const datosAutorizacion = await responsePaypal.json();

      if (!responsePaypal.ok || datosAutorizacion.status !== "COMPLETED") {
        return res.status(400).json({
          success: false,
          message: "El pago no fue autorizado por PayPal. El comprador debe completar la aprobación con su cuenta.",
          detalles: datosAutorizacion
        });
      }

      authorizationId = datosAutorizacion.purchase_units?.[0]?.payments?.authorizations?.[0]?.id;
      if (!authorizationId) {
        return res.status(400).json({
          success: false,
          message: "PayPal no devolvió la autorización del pago"
        });
      }
    } catch (error) {
      console.error("Error al autorizar el pago en PayPal:", error);
      return res.status(500).json({ success: false, message: "Error interno al procesar el depósito en garantía" });
    }

    // 4. Persistir el pedido únicamente cuando el pago fue autorizado
    const transaction = await sequelize.transaction();
    try {
      // Bloqueamos la fila del producto para serializar confirmaciones simultáneas
      await Producto.findByPk(producto.producto_id, { transaction, lock: transaction.LOCK.UPDATE });

      const ventaConfirmada = await Pedido.findOne({
        where: {
          producto_id: producto.producto_id,
          estado: ['pagado_escrow', 'en_disputa', 'entregado_completado'],
          paypal_order_id: { [Op.ne]: paypal_order_id }
        },
        transaction
      });

      if (ventaConfirmada) {
        await transaction.rollback();
        await anularAutorizacionPaypal(authorizationId);
        return res.status(400).json({
          success: false,
          message: "Este producto ya fue comprado por otro cliente. Se liberó tu pago en PayPal."
        });
      }

      let pedido;
      if (pedidoExistente) {
        const estadoAnterior = pedidoExistente.estado;
        await pedidoExistente.update({
          estado: "pagado_escrow",
          paypal_capture_id: authorizationId
        }, { transaction });
        pedido = pedidoExistente;
      } else {
        // Generar PIN de entrega aleatorio de 6 dígitos
        const pinEntrega = Math.floor(100000 + Math.random() * 900000).toString();

        pedido = await Pedido.create({
          producto_id: producto.producto_id,
          comprador_id: compradorId,
          vendedor_id: producto.usuario_id,
          precio_final: producto.precio,
          estado: 'pagado_escrow',
          paypal_order_id,
          paypal_capture_id: authorizationId,
          token_entrega: pinEntrega
        }, { transaction });
      }

      // El producto se desactiva únicamente cuando el pago fue confirmado
      await Producto.update(
        { es_activo: false },
        { where: { producto_id: producto.producto_id }, transaction }
      );

      // Registrar Histórico
      await HistoricoPedido.create({
        pedido_id: pedido.pedido_id,
        estado_anterior: pedidoExistente ? 'pendiente_pago' : null,
        estado_nuevo: "pagado_escrow",
        usuario_accion_id: compradorId,
        notes_auditoria: "Fondos congelados exitosamente vía PayPal Escrow. En espera de intercambio físico."
      }, { transaction });

      await transaction.commit();

      // 5. Enviar el PIN de entrega al comprador (solo tras el pago confirmado)
      const comprador = await Usuario.findByPk(compradorId);
      if (comprador) {
        const opcionesCorreo = {
          from: `"UTJ Marketplace" <${process.env.EMAIL_USER}>`,
          to: comprador.correo,
          subject: `🔑 PIN de Entrega para tu compra: ${producto.titulo}`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px;">
              <h2 style="color: #2c3e50; text-align: center;">¡Tu pago ha sido confirmado!</h2>
              <p>Hola <strong>${comprador.nombre}</strong>,</p>
              <p>Tu pago por el siguiente artículo en el marketplace de la UTJ fue confirmado y los fondos están en garantía:</p>

              <div style="background-color: #f9f9f9; padding: 15px; border-left: 5px solid #3498db; margin: 20px 0;">
                <h3 style="margin-top: 0; color: #2980b9;">${producto.titulo}</h3>
                <p style="margin: 5px 0;"><strong>Precio:</strong> $${producto.precio} MXN</p>
              </div>

              <p style="text-align: center; margin-top: 25px;">
                <strong>IMPORTANTE:</strong> Reúnete con el vendedor en el campus para revisar el producto. Si estás conforme con la entrega, preséntale el siguiente PIN:
              </p>

              <div style="background-color: #e74c3c; color: white; text-align: center; padding: 15px; font-size: 24px; font-weight: bold; letter-spacing: 5px; border-radius: 5px; margin: 20px 0;">
                ${pedido.token_entrega}
              </div>

              <p style="font-size: 12px; color: #7f8c8d; text-align: center;">
                * No compartas este PIN con nadie hasta que tengas el producto físicamente en tus manos y estés satisfecho.
              </p>
            </div>
          `
        };

        transporreCorreo.sendMail(opcionesCorreo, (errorMail, info) => {
          if (errorMail) {
            console.error("Error no crítico al mandar el correo del PIN:", errorMail);
          } else {
            console.log("Correo con PIN enviado exitosamente: " + info.response);
          }
        });
      }

      return res.status(200).json({
        success: true,
        message: "Fondos congelados de forma segura en Escrow. El pedido está listo para ser entregado.",
        estado: "pagado_escrow"
      });

    } catch (error) {
      if (transaction && !transaction.finished) await transaction.rollback();
      console.error("Error al confirmar retención:", error);
      return res.status(500).json({ success: false, message: "Error interno al procesar el depósito en garantía" });
    }
  })
);



// =========================================================================
// VALIDAR PIN Y CAPTURAR FONDOS (PUT /api/pedidos/entregar-con-pin)
// =========================================================================
// El vendedor ingresa el PIN del comprador. Si es correcto, el backend ejecuta
// el CAPTURE en PayPal usando el authorization_id almacenado, liberando el dinero.
// =========================================================================
pedidoRoute.put(
  "/entregar-con-pin",
  proteger,
  verificarRol(["Vendedor"]),
  AsyncHandler(async (req, res) => {
    const vendedorId = req.usuario.id;
    const { pedido_id, token_entrega } = req.body; // El ID del pedido y el PIN de 6 dígitos

    if (!pedido_id || !token_entrega) {
      return res.status(400).json({ success: false, message: "El pedido_id y el token_entrega son obligatorios" });
    }

    // 1. Buscar el pedido y validar que pertenezca a este vendedor
    const pedido = await Pedido.findByPk(pedido_id);
    if (!pedido) {
      return res.status(404).json({ success: false, message: "El pedido no existe" });
    }

    if (pedido.vendedor_id !== vendedorId) {
      return res.status(403).json({ success: false, message: "No tienes autorización sobre este pedido" });
    }

    if (pedido.estado !== "pagado_escrow") {
      return res.status(400).json({ success: false, message: "El pago de este pedido no está congelado en Escrow o ya fue finalizado" });
    }

    // 2. Validar que el PIN (token_entrega) coincida
    if (pedido.token_entrega !== token_entrega.trim()) {
      return res.status(400).json({ success: false, message: "El PIN de entrega introducido es incorrecto. Verifícalo con el comprador." });
    }

    const transaction = await sequelize.transaction();
    try {
      const accessToken = await obtenerPaypalAccessToken();
      const urlCapture = `${process.env.PAYPAL_API_URL}/v2/payments/authorizations/${pedido.paypal_capture_id}/capture`;
      const responsePaypal = await fetch(urlCapture, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({})
      });
      const datosCaptura = await responsePaypal.json();

      const yaCapturada =
        datosCaptura.name === "UNPROCESSABLE_ENTITY" &&
        Array.isArray(datosCaptura.details) &&
        datosCaptura.details.some((d) => d.issue === "AUTHORIZATION_ALREADY_CAPTURED");

      if (!responsePaypal.ok && !yaCapturada) {
        throw new Error(
          "PayPal no capturó el pago: " +
          (datosCaptura.message || JSON.stringify(datosCaptura))
        );
      }

      // El dinero ya fue capturado y transferido a la cuenta de la plataforma; actualizamos la BD
      const estadoAnterior = pedido.estado;
      
      // Actualizamos el pedido a completado
      await pedido.update({
        estado: "entregado_completado"
      }, { transaction });

      // Desactivamos el producto para que ya no aparezca listado en el Marketplace
      await Producto.update(
        { es_activo: false },
        { where: { producto_id: pedido.producto_id }, transaction }
      );

      // Registrar en el histórico de auditoría
      await HistoricoPedido.create({
        pedido_id: pedido.pedido_id,
        estado_anterior: estadoAnterior,
        estado_nuevo: "entregado_completado",
        usuario_accion_id: vendedorId,
        notes_auditoria: `Venta completada con éxito cara a cara. PIN verificado. Fondos liberados.`
      }, { transaction });

      await transaction.commit();

      return res.status(200).json({
        success: true,
        message: "¡PIN correcto! Los fondos han sido liberados y el producto se marcó como vendido con éxito.",
        data: {
          pedido_id: pedido.pedido_id,
          estado: "entregado_completado"
        }
      });

    } catch (error) {
      if (transaction && !transaction.finished) await transaction.rollback();
      console.error("Error crítico al capturar el Escrow con PIN:", error);
      return res.status(500).json({ success: false, message: "Error interno al finalizar la transacción" });
    }
  })
);


module.exports = pedidoRoute;