const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const User = require('./User');
const Roles = require('./Roles');


const UserRole = sequelize.define('user_roles', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
    },
    user_id: {
        type: DataTypes.INTEGER,
        references: {
            model: User,
            key: 'id',
        },
    },
    roles_id: {
        type: DataTypes.INTEGER,
        references: {
            model: Roles,
            key: 'id',
        },
    },
    created_at: {
        type: DataTypes.DATE,
        allowNull: true,
    },
    updated_at: {
        type: DataTypes.DATE,
        allowNull: true,
    },
    deleted_at: {
        type: DataTypes.DATE,
        allowNull: true,
    },
}, {
    timestamps: false,
});

module.exports = UserRole;
