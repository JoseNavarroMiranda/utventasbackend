const jwt = require("jsonwebtoken");
const asyncHandler = require("express-async-handler");
const { Usuario, Rol } = require("../models"); // Importación desde el index de modelos
require('dotenv').config();

// 1. Middleware base para verificar que el usuario está autenticado
const proteger = asyncHandler(async (req, res, next) => {
  let token;

  // Prioridad 1: Token de los headers de autorización (Bearer Token)
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer")
  ) {
    token = req.headers.authorization.split(" ")[1];
  } 
  // Prioridad 2: Token almacenado en la sesión de Express
  else if (req.session && req.session.token) {
    token = req.session.token;
  }

  if (!token) {
    return res.status(401).json({ 
      success: false,
      message: "No estás autorizado, token requerido" 
    });
  }

  try {
    // Verificar y decodificar el token
    const decodedToken = jwt.verify(token, process.env.JWT_SECRET);

    // Buscar el usuario usando el ID correcto del esquema (usuario_id) incluyendo su Rol
    const usuario = await Usuario.findByPk(decodedToken.id, {
      include: [{
        model: Rol,
        attributes: ['rol_id', 'nombre']
      }],
      attributes: { exclude: ['contrasena_hash'] } // Excluimos el hash de seguridad
    });

    if (!usuario) {
      return res.status(401).json({ 
        success: false,
        message: "Usuario no encontrado" 
      });
    }

    // OPCIONAL: Comprobar si su correo está validado como UTJ (es_verificado)
    if (!usuario.es_verificado) {
      return res.status(403).json({ 
        success: false,
        message: "Debes verificar tu correo institucional de la UTJ para operar en la plataforma" 
      });
    }

    // Asignar el usuario completo con la nomenclatura correcta del modelo de UTVentas
    req.usuario = usuario;
    req.usuario.id = usuario.usuario_id; 
    req.usuario.rol_nombre = usuario.Rol ? usuario.Rol.nombre : null;

    console.log(`Usuario autenticado en UTVentas: ${usuario.nombre} [Rol: ${req.usuario.rol_nombre}]`);

    return next();
    
  } catch (err) {
    console.error("Error de token en UTVentas:", err);
    
    if (err.name === 'JsonWebTokenError') {
      return res.status(401).json({ 
        success: false,
        message: "Token inválido" 
      });
    }
    
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        success: false,
        message: "El token ha expirado. Inicia sesión nuevamente" 
      });
    }

    // Dentro de tu middleware proteger()
    const usuario = await Usuario.findByPk(decoded.id);

    if (!usuario || !usuario.es_activo) {
      return res.status(401).json({ 
        success: false, 
        message: "Cuenta inexistente o inactiva. Sesión revocada." 
      });
    }


    
    
    return res.status(401).json({ 
      success: false,
      message: "Error de autenticación" 
    });
  }
});

// 2. Middleware para restringir accesos según el Nombre del Rol (ej. 'Administrador', 'Vendedor', 'Comprador')
const verificarRol = (rolesPermitidos) => {
  return (req, res, next) => {
    if (!req.usuario || !req.usuario.Rol) {
      return res.status(401).json({
        success: false,
        message: "No autorizado, rol no identificado"
      });
    }

    const rolUsuario = req.usuario.Rol.nombre; // Ej: 'Administrador'
    
    if (rolesPermitidos.includes(rolUsuario)) {
      return next();
    } else {
      return res.status(403).json({
        success: false,
        message: `Acceso denegado. Esta acción requiere uno de los siguientes roles: ${rolesPermitidos.join(', ')}`
      });
    }
  };
};

// 3. Middleware para restringir accesos según los IDs numéricos de la tabla 'roles'
const verificarRolId = (rolesIdsPermitidos) => {
  return (req, res, next) => {
    if (!req.usuario) {
      return res.status(401).json({
        success: false,
        message: "No autorizado"
      });
    }

    if (rolesIdsPermitidos.includes(req.usuario.rol_id)) {
      return next();
    } else {
      return res.status(403).json({
        success: false,
        message: "Acceso denegado. Tu rol no tiene permisos para esta ruta"
      });
    }
  };
};



module.exports = {
  proteger,
  verificarRol,
  verificarRolId
};