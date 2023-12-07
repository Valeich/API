const Sequelize = require('sequelize');
const express = require('express');

const sequelize = new Sequelize('testing', 'root', '', {
  host: 'localhost',
  dialect: 'mysql'
});


module.exports = sequelize;