const { Sequelize } = require('sequelize');
const sequelize = require('../config/database');
const User = require('./User');
const Prospect = require('./Prospect');


const Response = sequelize.define('responses', {
    id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
    },
    user_id: {
        type: Sequelize.INTEGER,
        references: {
            model: User,
            key: 'id',
        },
    },
    prospect_id: {
        type: Sequelize.INTEGER,
        references: {
            model: Prospect,
            key: 'id',
        },
    },
    response: {
        type: Sequelize.STRING,
        allowNull:true
    },
});


module.exports = Response;
