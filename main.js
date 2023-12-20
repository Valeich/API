const express = require('express');
const sequelize = require('./config/database');
const app = express();
const amqp = require('amqplib/callback_api');
const redis = require('redis');

// RabbitMQ connection
const rabbitMqConnection = amqp.connect('amqp://rabbitmq');

// Redis connection
const redisClient = redis.createClient({ host: 'redis', port: 6379 });

// Connect to MySQL
sequelize.sync({ force: false }).then(() => {
    console.log('Database synced');
}).catch(err => {
    console.error('Error syncing database:', err);
});

app.use(express.json());

app.get('/', (req, res) => {
    res.send('Test');
});

const registerRoute = require('./routes/register'); 
app.use('/register', registerRoute);

const loginRoute = require('./routes/login'); 
app.use('/login', loginRoute);

const prospectsRoute = require('./routes/prospects'); 
app.use('/prospects', prospectsRoute);

const assignsRoute = require('./routes/assigns'); 
app.use('/assigns', assignsRoute);

const autoassignRoute = require('./routes/auto-assign'); 
app.use('/auto-assign', autoassignRoute);

const autoassignsRoute = require('./routes/auto-assigns'); 
app.use('/auto-assigns', autoassignsRoute);

const autoRoute = require('./routes/auto-assign-user'); 
app.use('/auto-assign-user', autoRoute);

const userRoute = require('./routes/user'); 
app.use('/user', userRoute);


app.listen(3000, () => {
  console.log(`Server is running on http://localhost:3000`);
});
