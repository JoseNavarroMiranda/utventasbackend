const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  return sequelize.define('SolicitudRelanzamientoImagen', {
    imagen_id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    solicitud_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    url_imagen: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    es_principal: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    }
  }, {
    tableName: 'solicitud_relanzamiento_imagenes',
    timestamps: false
  });
};