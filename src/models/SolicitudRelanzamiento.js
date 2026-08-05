const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  return sequelize.define('SolicitudRelanzamiento', {
    solicitud_id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    producto_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    vendedor_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    disputa_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    descripcion: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    estado: {
      type: DataTypes.STRING(20),
      defaultValue: 'pendiente',
      validate: {
        isIn: [['pendiente', 'aprobada', 'rechazada']]
      }
    },
    resolucion_texto: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    admin_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    fecha_solicitud: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    },
    fecha_revision: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: null
    }
  }, {
    tableName: 'solicitudes_relanzamiento',
    timestamps: false
  });
};