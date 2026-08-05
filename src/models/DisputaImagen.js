const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  return sequelize.define('DisputaImagen', {
    imagen_id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    disputa_id: {
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
    tableName: 'disputa_imagenes',
    timestamps: false
  });
};