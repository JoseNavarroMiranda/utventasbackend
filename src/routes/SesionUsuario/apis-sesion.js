
const express = require("express");
const usuarioRoute = express.Router();
const AsyncHandler = require("express-async-handler");
const { Usuario, Rol, sequelize } = require("../../models"); // Importación unificada desde tu index.js de modelos
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
require('dotenv').config();
const generateToken = require("../../tokenGenerate"); // Tu generador de tokens JWT
const { proteger } = require("../../middlewares/authMiddleware");

// Almacenamiento temporal en memoria para los códigos de verificación (correo -> { codigo, expiracion })
// Nota: En producción esto se puede mover a Redis o a una tabla temporal en la base de datos
const codigosTemporales = {};
const normalizarCorreo = (valor) =>
    typeof valor === "string" ? valor.trim().toLowerCase() : "";

// Configuración del transportador de Nodemailer con Brevo (SMTP Relay)
const transporter = nodemailer.createTransport({
    host: 'smtp-relay.brevo.com',
    port: 465,
    secure: true,
    auth: {
        user: process.env.EMAIL_USER, // Correo verificado como remitente en Brevo
        pass: process.env.EMAIL_PASS  // API Key SMTP de Brevo
    },
    connectionTimeout: 30000
});

// ==========================================
// 1. API PARA SOLICITAR CÓDIGO DE VERIFICACIÓN
// ==========================================
usuarioRoute.post("/solicitar-codigo", AsyncHandler(async (req, res) => {
    const correo = normalizarCorreo(req.body.correo);

    if (!correo) {
        return res.status(400).json({
            success: false,
            message: "El correo electrónico es requerido"
        });
    }

    // EXCLUSIVO UTJ: Expresión regular para validar exactamente 10 dígitos seguido de @soy.utj.edu.mx
    const utjEmailRegex = /^\d{10}@soy\.utj\.edu\.mx$/;
    if (!utjEmailRegex.test(correo)) {
        return res.status(400).json({
            success: false,
            message: "El correo debe tener el formato institucional de la UTJ (Ej: 2123300393@soy.utj.edu.mx)"
        });
    }

    // Verificar si el correo ya está registrado en la base de datos
    const usuarioExistente = await Usuario.findOne({ where: { correo } });
    if (usuarioExistente) {
        return res.status(400).json({
            success: false,
            message: "Este correo electrónico ya se encuentra registrado"
        });
    }

    // Generar un código aleatorio de 6 dígitos
    const codigoVerificacion = Math.floor(100000 + Math.random() * 900000).toString();
    
    // Guardar el código con una validez de 20 minutos
    codigosTemporales[correo] = {
        codigo: codigoVerificacion,
        expiracion: Date.now() + 20 * 60 * 1000 // 20 minutos
    };

    // Plantilla de correo para el estudiante
    const mailOptions = {
        from: `"UTVentas Soporte" <${process.env.EMAIL_FROM}>`,
        to: correo,
        subject: "Código de Verificación - UTVentas",
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; padding: 20px;">
                <h2 style="color: #17a987; text-align: center;">¡Bienvenido a UTVentas!</h2>
                <p>Estás a un paso de unirte al marketplace exclusivo de la comunidad de la UTJ.</p>
                <p>Usa el siguiente código para completar tu registro en la plataforma:</p>
                <div style="background-color: #f8f9fa; border: 1px dashed #17a987; padding: 15px; text-align: center; font-size: 24px; font-weight: bold; letter-spacing: 5px; color: #333; margin: 20px 0; border-radius: 4px;">
                    ${codigoVerificacion}
                </div>
                <p style="font-size: 12px; color: #666; text-align: center;">Este código expirará en 10 minutos.</p>
            </div>
        `
    };

    // Enviar el correo electrónico
    try {
        await transporter.sendMail(mailOptions);
        res.status(200).json({
            success: true,
            message: "Código de verificación enviado con éxito a tu correo de la UTJ"
        });
    } catch (error) {
        console.error("Error al enviar el correo:", error);
        return res.status(500).json({
            success: false,
            message: "No se pudo enviar el correo de verificación. Inténtalo más tarde."
        });
    }
}));

// ==========================================
// 2. API DE REGISTRO DE USUARIO (CON NOMBRE DE ROL)
// ==========================================
usuarioRoute.post("/registro-usuario", AsyncHandler(async (req, res) => {
    const transaction = await sequelize.transaction();
    
    try {
        const { nombre, password, rol_nombre, codigo, telefono_defecto } = req.body;
        const correo = normalizarCorreo(req.body.correo);

        // Validaciones de campos obligatorios
        if (!nombre || !correo || !password || !rol_nombre || !codigo) {
            await transaction.rollback();
            return res.status(400).json({
                success: false,
                message: "Todos los campos son obligatorios: nombre, correo, password, rol_nombre, codigo"
            });
        }

        // Validación de seguridad para que no se registren administradores por la vía pública
        if (rol_nombre.toLowerCase() === 'administrador') {
            await transaction.rollback();
            return res.status(403).json({
                success: false,
                message: "No está permitido registrar cuentas de administrador desde este formulario"
            });
        }

        // Validar tamaño de contraseña
        if (password.length < 6) {
            await transaction.rollback();
            return res.status(400).json({
                success: false,
                message: "La contraseña debe tener al menos 6 caracteres"
            });
        }

        // VALIDAR EL CÓDIGO DE VERIFICACIÓN
        const datosCodigo = codigosTemporales[correo];
        if (!datosCodigo) {
            await transaction.rollback();
            return res.status(400).json({
                success: false,
                message: "No se ha solicitado ningún código para este correo o ya expiró"
            });
        }

        if (datosCodigo.expiracion < Date.now()) {
            delete codigosTemporales[correo];
            await transaction.rollback();
            return res.status(400).json({
                success: false,
                message: "El código de verificación ha expirado, solicita uno nuevo"
            });
        }

        if (datosCodigo.codigo !== codigo) {
            await transaction.rollback();
            return res.status(400).json({
                success: false,
                message: "El código de verificación ingresado es incorrecto"
            });
        }

        // 1. BUSCAR EL ROL POR SU NOMBRE (En minúsculas para evitar problemas de mayúsculas/minúsculas)
        const rolExistente = await Rol.findOne({
            where: sequelize.where(
                sequelize.fn('lower', sequelize.col('nombre')),
                rol_nombre.toLowerCase()
            ),
            transaction
        });

        if (!rolExistente) {
            await transaction.rollback();
            return res.status(400).json({
                success: false,
                message: `El rol '${rol_nombre}' no es válido. Usa: 'comprador' o 'vendedor'`
            });
        }

        // Encriptar password
        const salt = await bcrypt.genSalt(10);
        const contrasena_hash = await bcrypt.hash(password, salt);

        // 2. Crear el usuario en la base de datos vinculando el ID del rol encontrado
        const nuevoUsuario = await Usuario.create({
            nombre: nombre,
            correo: correo,
            contrasena_hash: contrasena_hash,
            telefono_defecto: telefono_defecto || null,
            rol_id: rolExistente.rol_id, // Usamos el ID obtenido de la búsqueda
            es_verificado: true
        }, { transaction });

        // Limpiar el código temporal usado de la memoria
        delete codigosTemporales[correo];

        await transaction.commit();

        res.status(201).json({
            success: true,
            message: "¡Registro completado con éxito! Tu cuenta de UTVentas ha sido creada y verificada",
            data: {
                usuario_id: nuevoUsuario.usuario_id,
                nombre: nuevoUsuario.nombre,
                correo: nuevoUsuario.correo,
                rol_nombre: rolExistente.nombre, // Retornamos el nombre del rol para el Frontend
                es_verificado: nuevoUsuario.es_verificado,
                fecha_registro: nuevoUsuario.fecha_registro
            }
        });

    } catch (error) {
        if (transaction && !transaction.finished) {
            await transaction.rollback();
        }
        console.error('Error durante el registro del estudiante:', error);
        res.status(500).json({
            success: false,
            message: "Error interno del servidor al procesar el registro"
        });
    }
}));


// ==========================================
// 3. API DE INICIO DE SESIÓN (LOGIN)
// ==========================================
usuarioRoute.post("/login", AsyncHandler(async (req, res) => {
    const correo = normalizarCorreo(req.body.correo);
    const password = typeof req.body.password === "string"
        ? req.body.password
        : (typeof req.body.contrasena === "string" ? req.body.contrasena : "");

    // 1. Validar que se envíen ambos campos obligatorios
    if (!correo || !password) {
        return res.status(400).json({
            success: false,
            message: "Por favor, ingresa tu correo y contraseña"
        });
    }

    // 2. En login aceptamos cualquier correo válido (la restricción UTJ se mantiene en registro)
    const emailBasicoRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailBasicoRegex.test(correo)) {
        return res.status(400).json({
            success: false,
            message: "El formato de correo electrónico no es válido"
        });
    }

    // 3. Buscar al usuario por correo, incluyendo su Rol asociado
    const usuario = await Usuario.findOne({
        where: { correo },
        include: [{
            model: Rol,
            attributes: ['rol_id', 'nombre']
        }]
    });

    // 4. Si el usuario no existe
    if (!usuario) {
        return res.status(401).json({
            success: false,
            message: "Credenciales incorrectas (usuario no encontrado)"
        });
    }

    // 5. Verificar si el usuario ha completado el proceso de verificación de correo
    if (!usuario.es_verificado) {
        return res.status(403).json({
            success: false,
            message: "Esta cuenta no está verificada. Por favor completa tu registro usando el código de tu correo"
        });
    }

    // 6. Verificar la contraseña utilizando bcryptjs con el hash de la Base de Datos
    const contrasenaCorrecta = await bcrypt.compare(password, usuario.contrasena_hash);
    if (!contrasenaCorrecta) {
        return res.status(401).json({
            success: false,
            message: "Credenciales incorrectas (contraseña inválida)"
        });
    }

    //🛑 NUEVA VALIDACIÓN: Control de Suspensión / Estado de Cuenta
    if (!usuario.es_activo) {
    return res.status(403).json({
        success: false,
        message: "Tu cuenta ha sido desactivada o suspendida por un administrador. Contacta a soporte UTVentas."
    });
    }

    // 7. Generar el token usando tu función importada (le pasamos el id correcto: usuario_id)
    const token = generateToken(usuario.usuario_id);

    // 8. Opcional: Guardar en la sesión si tu app usa Express-Session (Prioridad 2 de tu authMiddleware)
    if (req.session) {
        req.session.token = token;
    }

    // 9. Responder con los datos de sesión y el token de acceso
    res.status(200).json({
        success: true,
        message: "¡Inicio de sesión exitoso!",
        token: token,
        usuario: {
            usuario_id: usuario.usuario_id,
            nombre: usuario.nombre,
            correo: usuario.correo,
            rol_nombre: usuario.Rol ? usuario.Rol.nombre : null,
            telefono_defecto: usuario.telefono_defecto,
            es_verificado: usuario.es_verificado,
            es_activo: usuario.es_activo,
            verificado_como_vendedor: usuario.verificado_como_vendedor
        }
    });
}));


// ==========================================
// API DE CIERRE DE SESIÓN (LOGOUT)
// ==========================================
usuarioRoute.post("/logout", proteger, AsyncHandler(async (req, res) => {
    try {
        // Si el servidor está utilizando express-session
        if (req.session) {
            req.session.destroy((err) => {
                if (err) {
                    console.error('Error destruyendo sesión en UTVentas:', err);
                    return res.status(500).json({
                        success: false,
                        message: "Error al cerrar la sesión en el servidor"
                    });
                }
                
                // Limpiamos la cookie de sesión
                res.clearCookie('connect.sid'); 
                
                return res.status(200).json({
                    success: true,
                    message: "Sesión cerrada de forma segura (Sesión de servidor eliminada)"
                });
            });
        } 
        // Si únicamente dependes de JWT puro sin cookies de sesión activa
        else {
            return res.status(200).json({
                success: true,
                message: "Logout exitoso. Recuerda destruir el token JWT en el cliente (localStorage/sessionStorage)."
            });
        }
    } catch (error) {
        console.error('Error en controlador de Logout:', error);
        res.status(500).json({
            success: false,
            message: "Error interno del servidor al procesar el cierre de sesión"
        });
    }
}));

// ==========================================
//  API OBTENER PERFIL (GET /perfil)
// ==========================================
usuarioRoute.get("/perfil", proteger, AsyncHandler(async (req, res) => {
    try {
        // Buscamos al usuario usando el ID que el middleware "proteger" descifró del token
        const usuario = await Usuario.findByPk(req.usuario.id, {
            attributes: ['usuario_id', 'nombre', 'correo', 'contrasena_hash', 'telefono_defecto', 'rol_id'],
            include: [{ model: Rol, attributes: ['nombre'] }]
        });

        if (!usuario) {
            return res.status(404).json({
                success: false,
                message: "Usuario no encontrado"
            });
        }

        return res.status(200).json({
            success: true,
            data: {
                usuario_id: usuario.usuario_id,
                nombre: usuario.nombre,
                correo: usuario.correo,
                telefono_defecto: usuario.telefono_defecto,
                rol_nombre: usuario.Rol?.nombre,
                es_verificado: usuario.es_verificado,
                es_activo: usuario.es_activo,
                verificado_como_vendedor: usuario.verificado_como_vendedor
            }
        });

    } catch (error) {
        console.error("Error al obtener perfil en UTVentas:", error);
        return res.status(500).json({
            success: false,
            message: "Error interno del servidor al obtener el perfil"
        });
    }
}));


// ==========================================
// API ACTUALIZAR PERFIL (PUT /actualizar-perfil)
// ==========================================
usuarioRoute.put("/actualizar-perfil", proteger, AsyncHandler(async (req, res) => {
    try {
        const { telefono_contacto, password } = req.body;

        // Buscar el usuario en la base de datos
        const usuario = await Usuario.findByPk(req.usuario.id);

        if (!usuario) {
            return res.status(404).json({
                success: false,
                message: "Usuario no encontrado"
            });
        }

        // Objeto temporal para guardar los campos modificados
        const camposAActualizar = {};

        // Validar y asignar nuevo teléfono si se envió en el body
        if (telefono_contacto !== undefined) {
            // Validación opcional: longitud del teléfono
            if (telefono_contacto && telefono_contacto.length > 20) {
                return res.status(400).json({
                    success: false,
                    message: "El teléfono no puede exceder los 20 caracteres"
                });
            }
            camposAActualizar.telefono_defecto = telefono_contacto;
        }

        // Validar, encriptar y asignar nueva contraseña si se envió en el body
        if (password) {
            if (password.length < 6) {
                return res.status(400).json({
                    success: false,
                    message: "La nueva contraseña debe tener al menos 6 caracteres"
                });
            }
            // Generar hash para la nueva contraseña
            const salt = await bcrypt.genSalt(10);
            camposAActualizar.contrasena_hash = await bcrypt.hash(password, salt);
        }

        // Si no se envió ningún dato válido para actualizar
        if (Object.keys(camposAActualizar).length === 0) {
            return res.status(400).json({
                success: false,
                message: "No se enviaron datos válidos para actualizar (puedes actualizar 'telefono_contacto' o 'password')"
            });
        }

        // Guardar los cambios en la base de datos
        await usuario.update(camposAActualizar);

        return res.status(200).json({
            success: true,
            message: "Perfil actualizado correctamente",
            data: {
                nombre: usuario.nombre,
                correo: usuario.correo,
                telefono_defecto: usuario.telefono_defecto
            }
        });

    } catch (error) {
        console.error("Error al actualizar perfil en UTVentas:", error);
        return res.status(500).json({
            success: false,
            message: "Error interno del servidor al actualizar el perfil"
        });
    }
}));


module.exports = usuarioRoute;



 
  
 
 
