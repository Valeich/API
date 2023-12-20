const express = require('express');
const router = express.Router();
const authenticateJWT = require('../utils/authenticateJWT');
const UserRole = require('../models/UserRole');



router.get('/', authenticateJWT, async (req, res) => {
    try {
        const users = await UserRole.findAll();
        res.json(users);
    } catch (error) {
        console.error('Fetch user list error:', error);
        res.status(500).send({ error: 'Internal server error' });
    }
});

module.exports = router;