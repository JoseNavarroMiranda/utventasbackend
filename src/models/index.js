
const sequelize = require('../config/database');
require('dotenv').config();

// Importar Modelos
const Rol = require('./Rol')(sequelize);
const Usuario = require('./Usuario')(sequelize);
const Categoria = require('./Categoria')(sequelize);
const Producto = require('./Producto')(sequelize);
const ProductoImagen = require('./ProductoImagen')(sequelize);
const Pedido = require('./Pedido')(sequelize);
const Disputa = require('./Disputa')(sequelize);
const RetiroVendedor = require('./RetiroVendedor')(sequelize);
const HistoricoPedido = require('./HistoricoPedido')(sequelize);
const TransaccionPremium = require('./TransaccionPremium')(sequelize);

// --- DEFINICIÓN DE RELACIONES (ASOCIACIONES) ---

// Roles <-> Usuarios
Rol.hasMany(Usuario, { foreignKey: 'rol_id', onDelete: 'SET NULL' });
Usuario.belongsTo(Rol, { foreignKey: 'rol_id' });

// Usuarios <-> Productos
Usuario.hasMany(Producto, { foreignKey: 'usuario_id', onDelete: 'CASCADE' });
Producto.belongsTo(Usuario, { foreignKey: 'usuario_id' });

// Categorias <-> Productos
Categoria.hasMany(Producto, { foreignKey: 'categoria_id', onDelete: 'SET NULL' });
Producto.belongsTo(Categoria, { foreignKey: 'categoria_id' });

// Productos <-> ProductoImagenes
Producto.hasMany(ProductoImagen, { foreignKey: 'producto_id', onDelete: 'CASCADE' });
ProductoImagen.belongsTo(Producto, { foreignKey: 'producto_id' });

// Productos <-> Pedidos
Producto.hasMany(Pedido, { foreignKey: 'producto_id', onDelete: 'SET NULL' });
Pedido.belongsTo(Producto, { foreignKey: 'producto_id' });

// Comprador/Vendedor <-> Pedidos
Usuario.hasMany(Pedido, { foreignKey: 'comprador_id', as: 'Compras', onDelete: 'SET NULL' });
Pedido.belongsTo(Usuario, { foreignKey: 'comprador_id', as: 'Comprador' });

Usuario.hasMany(Pedido, { foreignKey: 'vendedor_id', as: 'Ventas', onDelete: 'SET NULL' });
Pedido.belongsTo(Usuario, { foreignKey: 'vendedor_id', as: 'Vendedor' });

// Pedido <-> Disputas (Uno a Uno)
Pedido.hasOne(Disputa, { foreignKey: 'pedido_id', onDelete: 'CASCADE' });
Disputa.belongsTo(Pedido, { foreignKey: 'pedido_id' });

// Comprador / Vendedor / Admin <-> Disputas
Usuario.hasMany(Disputa, { foreignKey: 'comprador_id', as: 'DisputasComprador', onDelete: 'SET NULL' });
Disputa.belongsTo(Usuario, { foreignKey: 'comprador_id', as: 'Comprador' });

Usuario.hasMany(Disputa, { foreignKey: 'vendedor_id', as: 'DisputasVendedor', onDelete: 'SET NULL' });
Disputa.belongsTo(Usuario, { foreignKey: 'vendedor_id', as: 'Vendedor' });

Usuario.hasMany(Disputa, { foreignKey: 'admin_id', as: 'DisputasModeradas', onDelete: 'SET NULL' });
Disputa.belongsTo(Usuario, { foreignKey: 'admin_id', as: 'Administrador' });

// Vendedor / Pedido <-> Retiros
Usuario.hasMany(RetiroVendedor, { foreignKey: 'vendedor_id', onDelete: 'CASCADE' });
RetiroVendedor.belongsTo(Usuario, { foreignKey: 'vendedor_id', as: 'Vendedor' });

Pedido.hasMany(RetiroVendedor, { foreignKey: 'pedido_id', onDelete: 'SET NULL' });
RetiroVendedor.belongsTo(Pedido, { foreignKey: 'pedido_id' });

// Pedido / UsuarioAccion <-> HistoricoPedidos
Pedido.hasMany(HistoricoPedido, { foreignKey: 'pedido_id', onDelete: 'CASCADE' });
HistoricoPedido.belongsTo(Pedido, { foreignKey: 'pedido_id' });

Usuario.hasMany(HistoricoPedido, { foreignKey: 'usuario_accion_id', onDelete: 'SET NULL' });
HistoricoPedido.belongsTo(Usuario, { foreignKey: 'usuario_accion_id', as: 'UsuarioAccion' });

// Usuario / Producto <-> Transacciones Premium
Usuario.hasMany(TransaccionPremium, { foreignKey: 'usuario_id', onDelete: 'CASCADE' });
TransaccionPremium.belongsTo(Usuario, { foreignKey: 'usuario_id' });

Producto.hasMany(TransaccionPremium, { foreignKey: 'producto_id', onDelete: 'SET NULL' });
TransaccionPremium.belongsTo(Producto, { foreignKey: 'producto_id' });

// Exportar base de datos y modelos
module.exports = {
  sequelize,
  Rol,
  Usuario,
  Categoria,
  Producto,
  ProductoImagen,
  Pedido,
  Disputa,
  RetiroVendedor,
  HistoricoPedido,
  TransaccionPremium
};