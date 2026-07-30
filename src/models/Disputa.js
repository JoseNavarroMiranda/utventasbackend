const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  return sequelize.define('Disputa', {
    disputa_id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    pedido_id: {
      type: DataTypes.INTEGER,
      unique: true,
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
    admin_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    motivo: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    estado: {
      type: DataTypes.STRING(30),
      defaultValue: 'abierta',
      validate: {
        isIn: [['abierta', 'en_investigacion', 'resuelta_reembolso', 'resuelta_pago_vendedor', 'cerrada_sin_cambios']]
      }
    },
    resolucion_texto: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    fecha_apertura: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    },
    fecha_resolucion: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: null
    }
  }, {
    tableName: 'disputas',
    timestamps: false
  });
};