const sequelize = require('../config/database');
const Sequelize = require('sequelize');
const express = require('express');
const User = require('./User');
const UserRole = require('./UserRole');


const Prospect = sequelize.define('prospects', {
    id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
    },
    user_roles_id: {
        type: Sequelize.INTEGER,
        references: {
            model: UserRole,
            key: 'id',
        }
    },
    source: {
        type: Sequelize.STRING,
        allowNull: true,
    },
    prospect_name: {
        type: Sequelize.STRING,
        allowNull: true,
    },
    prospect_contact_number: {
        type: Sequelize.STRING,
        allowNull: true,
    },
    prospect_email: {
        type: Sequelize.STRING,
        allowNull: true,
    },
    prospect_type: {
        type: Sequelize.STRING,
        allowNull: true,
    },
    assigned_status: {
        type: Sequelize.INTEGER,
        allowNull: true,
    },
    created_at: {
        type: Sequelize.DATE,
        allowNull: true,
    },
    updated_at: {
        type: Sequelize.DATE,
        allowNull: true,
    },
    deleted_at: {
        type: Sequelize.DATE,
        allowNull: true,
    },
}, {
    timestamps: false,
});


module.exports = Prospect;