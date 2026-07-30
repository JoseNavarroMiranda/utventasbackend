const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  return sequelize.define('Producto', {
    producto_id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    usuario_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    categoria_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    titulo: {
      type: DataTypes.STRING(100),
      allowNull: false
    },
    descripcion: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    precio: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0.00
    },
    es_activo: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    contacto_telefono: {
      type: DataTypes.STRING(20),
      allowNull: false
    },
    contacto_metodo: {
      type: DataTypes.STRING(30),
      defaultValue: 'whatsapp',
      validate: {
        isIn: [['whatsapp', 'llamada', 'telegram', 'correo']]
      }
    },
    es_premium: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    premium_hasta: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: null
    },
    fecha_publicacion: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    }
  }, {
    tableName: 'productos',
    timestamps: false
  });
};