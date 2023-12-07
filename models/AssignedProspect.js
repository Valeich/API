const sequelize = require('../config/database');
const Sequelize = require('sequelize');
const User = require('./User');
const Prospect = require('./Prospect');

const AssignedProspect = sequelize.define('assigned_prospect', {
    id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
    },
    prospect_id: {
        type: Sequelize.INTEGER,
        references: {
            model: Prospect,
            key: 'id',
        }
    },
    user_id: {
        type: Sequelize.INTEGER,
        references: {
            model: User,
            key: 'id',
        }
    },
    assignment_date: {
        type: Sequelize.DATE,
        allowNull: true,
    },
}, {
    timestamps: false,
});

module.exports = AssignedProspect;