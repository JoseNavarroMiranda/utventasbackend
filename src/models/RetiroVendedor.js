const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  return sequelize.define('RetiroVendedor', {
    retiro_id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    vendedor_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    pedido_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    monto_neto: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false
    },
    correo_paypal_destino: {
      type: DataTypes.STRING(150),
      allowNull: false,
      validate: {
        isEmail: true
      }
    },
    estado: {
      type: DataTypes.STRING(30),
      defaultValue: 'pendiente',
      validate: {
        isIn: [['pendiente', 'procesado_payout', 'rechazado']]
      }
    },
    paypal_payout_batch_id: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    fecha_solicitud: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    },
    fecha_procesado: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: null
    }
  }, {
    tableName: 'retiros_vendedor',
    timestamps: false
  });
};