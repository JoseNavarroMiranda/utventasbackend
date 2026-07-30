const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  return sequelize.define('Usuario', {
    usuario_id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    nombre: {
      type: DataTypes.STRING(100),
      allowNull: false
    },
    correo: {
      type: DataTypes.STRING(150),
      allowNull: false,
      unique: true,
      validate: {
        isEmail: true
      }
    },
    contrasena_hash: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    telefono_defecto: {
      type: DataTypes.STRING(20),
      allowNull: true
    },
    rol_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    fecha_registro: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    },
    es_verificado: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },

    // NUEVA COLUMNA DE "ES_ACTIVO"
    es_activo: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    }
  }, {
    tableName: 'usuarios',
    timestamps: false
  });
};