const express = require('express');
const bcrypt = require('bcryptjs');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');


const SECRET_KEY = 'quanta';

router.post('/', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }

        const user = await User.findOne({ where: { email } });

        if (!user) {
            return res.status(401).json({ error: 'Invalid email' });
        }

        const isPasswordValid = await bcrypt.compare(password, user.password);

        if (!isPasswordValid) {
            return res.status(401).json({ error: 'Invalid password' });
        }

        const token = jwt.sign({ userId: user.id }, SECRET_KEY, { expiresIn: '1h' });

        res.json({ token });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;