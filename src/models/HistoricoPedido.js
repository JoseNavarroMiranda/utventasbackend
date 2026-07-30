const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  return sequelize.define('HistoricoPedido', {
    historico_id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    pedido_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    estado_anterior: {
      type: DataTypes.STRING(40),
      allowNull: true
    },
    estado_nuevo: {
      type: DataTypes.STRING(40),
      allowNull: true
    },
    usuario_accion_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    fecha_cambio: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    },
    notes_auditoria: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'notas_auditoria' // Mapeo para respetar el nombre en español de la BD
    }
  }, {
    tableName: 'historico_pedidos',
    timestamps: false
  });
};