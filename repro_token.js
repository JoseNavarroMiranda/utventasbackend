require('dotenv').config();
const { Usuario, Rol, sequelize } = require('./src/models');
const generateToken = require('./src/tokenGenerate');

(async () => {
  try {
    const rol = await Rol.findOne({ where: { nombre: 'Comprador' } });
    const usuario = await Usuario.findOne({
      where: { es_verificado: true, es_activo: true, rol_id: rol.rol_id },
      order: [['usuario_id', 'ASC']]
    });
    if (!usuario) {
      console.log('NO_BUYER');
    } else {
      console.log(JSON.stringify({
        token: generateToken(usuario.usuario_id),
        usuario_id: usuario.usuario_id,
        nombre: usuario.nombre,
        correo: usuario.correo,
        rol: 'Comprador'
      }));
    }
  } catch (e) {
    console.error('ERROR', e.message);
  } finally {
    await sequelize.close();
  }
})();