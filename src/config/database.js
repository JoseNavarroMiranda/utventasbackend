const { Sequelize } = require('sequelize');
require('dotenv').config();

const sequelize = new Sequelize(
    process.env.DB_NAME ,
    process.env.DB_USER ,
    process.env.DB_PASSWORD ,
    {
        host: process.env.DB_HOST ,
        port: process.env.DB_PORT ,
        logging: console.log,
        dialect: 'mysql',
        logging: false, // Cambia a true si quieres ver las consultas SQL
        define: {
            timestamps: false, // Desactivamos timestamps automáticos
            underscored: true, // Usar snake_case para campos
            freezeTableName: true // No pluralizar nombres de tablas
        }
    }
);

module.exports = sequelize;