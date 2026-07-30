const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  return sequelize.define('Rol', {
    rol_id: {
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
    tableName: 'roles',
    timestamps: false
  });
};