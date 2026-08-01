const { sequelize } = require('../models');

async function setup() {
    try {
        await sequelize.authenticate();
        console.log('Conexión a MySQL establecida');
        await sequelize.sync({ alter: true });
        console.log('Tablas creadas/actualizadas correctamente');
    } catch (error) {
        console.error('Error al configurar la base de datos:', error.message);
        process.exit(1);
    } finally {
        await sequelize.close();
    }
}

setup();
