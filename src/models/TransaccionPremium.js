const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  return sequelize.define('TransaccionPremium', {
    transaccion_id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    usuario_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    producto_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    monto: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: false
    },
    tipo_pago: {
      type: DataTypes.STRING(30),
      allowNull: true,
      validate: {
        isIn: [['destacado_premium', 'mensualidad_arrendador']]
      }
    },
    fecha_pago: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    },
    expiracion: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    }
  }, {
    tableName: 'transacciones_premium',
    timestamps: false
  });
};