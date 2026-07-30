const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  return sequelize.define('Categoria', {
    categoria_id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    nombre: {
      type: DataTypes.STRING(50),
      allowNull: false,
      unique: true
    }
  }, {
    tableName: 'categorias',
    timestamps: false
  });
};