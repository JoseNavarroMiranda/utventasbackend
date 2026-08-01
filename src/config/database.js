const { Sequelize } = require('sequelize');
require('dotenv').config();

// Si existe MYSQL_URL o DATABASE_URL (Railway/Heroku), usar esa conexión.
// Formato esperado: mysql://usuario:password@host:puerto/base_de_datos
const dbUrl = process.env.MYSQL_URL || process.env.DATABASE_URL;

const sequelize = dbUrl
    ? new Sequelize(dbUrl, {
          dialect: 'mysql',
          logging: false,
          define: {
              timestamps: false,
              underscored: true,
              freezeTableName: true
          }
      })
    : new Sequelize(
          process.env.DB_NAME,
          process.env.DB_USER,
          process.env.DB_PASSWORD,
          {
              host: process.env.DB_HOST,
              port: process.env.DB_PORT,
              dialect: 'mysql',
              logging: false,
              define: {
                  timestamps: false,
                  underscored: true,
                  freezeTableName: true
              }
          }
      );

module.exports = sequelize;