// routes/auth.js

const express = require('express');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const authenticateJWT = require('../utils/authenticateJWT');
const jwt = require('jsonwebtoken');

const router = express.Router();


module.exports = {authenticateJWT};
module.exports = router;
