const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  return sequelize.define('Pedido', {
    pedido_id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    producto_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    comprador_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    vendedor_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    precio_final: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false
    },
    estado: {
      type: DataTypes.STRING(40),
      defaultValue: 'pendiente_pago',
      validate: {
        isIn: [['pendiente_pago', 'pagado_escrow', 'entregado_completado', 'cancelado_reembolsado', 'en_disputa']]
      }
    },
    paypal_order_id: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    paypal_capture_id: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    token_entrega: {
      type: DataTypes.STRING(10),
      allowNull: false
    },
    fecha_creacion: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    },
    fecha_actualizacion: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    }
  }, {
    tableName: 'pedidos',
    timestamps: true, // Habilitamos timestamps para controlar "fecha_actualizacion" automáticamente
    createdAt: 'fecha_creacion',
    updatedAt: 'fecha_actualizacion'
  });
};