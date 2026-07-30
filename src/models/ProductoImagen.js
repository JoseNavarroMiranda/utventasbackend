const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  return sequelize.define('ProductoImagen', {
    imagen_id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    producto_id: {
      type: DataTypes.INTEGER,
      allowNull: true
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
    tableName: 'producto_imagenes',
    timestamps: false
  });
};