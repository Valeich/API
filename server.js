const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const User = require('./models/User');

const app = express();
const SECRET_KEY = 'secret';

// Connect to MongoDB
mongoose.connect('mongodb://127.0.0.1:27017/testapi', { 
    useUnifiedTopology: true
});


app.use(express.json());

app.get('/', (req, res) => {
    res.send('Test');
  });

// Registration Endpoint
app.post('/register', async (req, res) => {
    try {
        const hashedPassword = await bcrypt.hash(req.body.password, 10);
        const user = new User({
            email: req.body.email,
            password: hashedPassword
        });
        await user.save();
        res.status(201).send({ message: 'User registered' });
    } catch (error) {
        res.status(500).send({ error: error.message });
    }
});


// Login Endpoint
app.post('/login', async (req, res) => {
    try {
        const user = await User.findOne({ email: req.body.email });
        if (!user) {
            return res.status(401).send({ message: 'Invalid email or password' });
        }

        const isPasswordValid = await bcrypt.compare(req.body.password, user.password);
        if (!isPasswordValid) {
            return res.status(401).send({ message: 'Invalid email or password' });
        }

        const token = jwt.sign({ userId: user._id }, SECRET_KEY, { expiresIn: '1h' });
        res.send({ token });
    } catch (error) {
        res.status(500).send({ error: error.message });
    }
});


//User Information
app.get('/users', async (req, res) => {
    try {
        const users = await User.find().select('-password'); // Excluding the password
        res.json(users);
    } catch (error) {
        console.error(error.message);
        res.status(500).send('Server error');
    }
});

app.listen(3000, () => {
    console.log('Server is running on http://localhost:3000');
});
