const express = require('express');
const router = express.Router();
const User = require('../models/User');


// User Information
router.get('/', async (req, res) => {
    try {
        const users = await User.findAll({ attributes: ['id', 'name', 'username', 'email'] });
        res.json(users);
    } catch (error) {
        console.error('Fetch users error:', error);
        res.status(500).send({ error: 'Internal server error' });
    }
});

module.exports = router;