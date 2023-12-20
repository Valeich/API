const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const amqp = require('amqplib');
const redis = require('./config/redis');
const sequelize = require('./config/database');
const authenticateJWT = require('./utils/authenticateJWT');
const app = express();
const rabbitMqUrl = require ('./rabbitmq');
const User = require('./models/User');
const Roles = require('./models/Roles');
const UserRole = require('./models/UserRole');
const Prospect = require('./models/Prospect');
const AssignedProspect = require('./models/AssignedProspect');
const Response =  require('./models/Response');
const redisClient = require('./config/redis');
const userRoutes = require('./userRoutes');
const { Sequelize, Op } = require('sequelize');


const SECRET_KEY = 'quanta';


// RabbitMQ and Redis configurations
const RABBITMQ_URL = 'amqp://Valeich:fumino@rabbitmq.prospect.com:5672/myvhost';
const QUEUE_NAME = 'prospects';

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


// Registration Endpoint
app.post('/register', async (req, res) => {
    const { name, email, password, Role } = req.body;

    try {
        const t = await sequelize.transaction();

        try {
            const existingUser = await User.findOne({ where: { email } });
            if (existingUser) {
                await t.rollback();
                return res.status(400).send({ error: 'Email is already in use' });
            }

            const hashedPassword = await bcrypt.hash(password, 10);
            const user = await User.create({
                name,
                photo: req.body.photo,
                username: req.body.username,
                email,
                password: hashedPassword
            }, { transaction: t });

            if (Role) {
                const roleRecord = await Roles.findByPk(Role);
                if (!roleRecord) {
                    await t.rollback();
                    return res.status(400).send({ error: 'Role not found' });
                }

                await UserRole.create({
                    user_id: user.id,
                    roles_id: roleRecord.id
                }, { transaction: t });
            }

            await t.commit();

            res.status(201).send({ message: 'User registered', user });
        } catch (error) {
            await t.rollback();
            throw error;
        }
    } catch (error) {
        res.status(500).send({ error: error.message });
    }
});


// Login Endpoint
app.post('/login', async (req, res) => {
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

app.post('/prospects', async (req, res) => {
  const { user_roles_id, source, prospect_name, prospect_contact_number, prospect_email, prospect_type } = req.body;

  try {
    // Validate prospect_contact_number starts with "62"
    if (!prospect_contact_number.startsWith('62')) {
      return res.status(400).json({ error: 'Prospect contact number must start with "62"' });
    }

    const referProspect = prospect_type || 'Refer Prospect';

    // Create a prospect in the database
    const prospect = await Prospect.create({
      user_roles_id,
      source,
      prospect_name,
      prospect_contact_number,
      prospect_email,
      prospect_type: referProspect,
    });

    // Send a message to RabbitMQ when a new prospect is created
    const connection = await amqp.connect(rabbitMqUrl);
    const channel = await connection.createChannel();
    const queueName = 'prospects_queue';
    const message = JSON.stringify(prospect);
    channel.assertQueue(queueName, { durable: true });
    channel.sendToQueue(queueName, Buffer.from(message));

    // Store prospect data in Redis with a TTL (time-to-live) for caching
    const redisKey = `prospect:${prospect.id}`;
    const redisValue = JSON.stringify(prospect);
    redisClient.setex(redisKey, 3600, redisValue); // Cache for 1 hour

    res.status(201).json({ message: 'Prospect created', prospect });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});


  app.post('/assign', async (req, res) => {
    try {
      const { prospectId, userId } = req.body;
  
      // Retrieve the user (sales representative) from your users table
      const user = await User.findByPk(userId);
  
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
  
      // Retrieve the prospect data from Redis
      const redisKey = `prospect:${prospectId}`;
      const prospectData = await redisClient.get(redisKey);
  
      if (!prospectData) {
        return res.status(404).json({ error: 'Prospect not found in Redis' });
      }
  
      // Update the prospect data in Redis
      await redisClient.setex(redisKey, 3600, JSON.stringify(prospectData));
  
      // Publish a message to RabbitMQ to inform about the assignment
      const rabbitMqUrl = 'amqp://localhost';
      const connection = await amqp.connect(rabbitMqUrl);
      const channel = await connection.createChannel();
      const exchangeName = 'sales-assignment';
      const message = JSON.stringify({ prospectId, userId });
      channel.assertExchange(exchangeName, 'fanout', { durable: false });
      channel.publish(exchangeName, '', Buffer.from(message));
  
      // Store the assignment data in the "assigned_prospects" table
      const assignmentDate = new Date();
      AssignedProspect.create({
        prospect_id: prospectId,
        user_id: userId,
        assignment_date: assignmentDate,
      });
  
      // Increment the assignedOrder
      user.assigned += 1;
  
      // Save the updated user
      await user.save();
  
      // Now you can assign the prospect to the user with the updated assignedOrder
      const prospect = await Prospect.findByPk(prospectId);
  
      if (prospect) {
        prospect.assignedUserId = userId; // Assign the prospect to the user
        await prospect.save();
      }
  
      // Respond with a success message
      return res.json({ message: 'Prospect assigned to sales', prospect: prospectData });
    } catch (error) {
      console.error('Error assigning sales:', error);
      return res.status(500).json({ error: 'Error assigning sales' });
    }
  });
  

app.post('/auto-assign', async (req, res) => {
  try {
    // Retrieve the last assigned user or the user next in the sequence
    const lastAssignedUser = await User.findLastAssignedUser();
    
    // If there's no last assigned user, start with the first user
    const nextUser = lastAssignedUser
      ? await User.findNextUserInSequence(lastAssignedUser.assigned)
      : await User.findFirstUserInSequence();

    if (!nextUser) {
      return res.status(404).json({ error: 'No in-house sales representative found' });
    }

    const {user_roles_id, source, prospect_name, prospect_contact_number, prospect_email, prospect_type } = req.body;
 
    // Create a new prospect
    const prospect = await Prospect.create({
      user_roles_id,
      source,
      prospect_name,
      prospect_contact_number,
      prospect_email,
      prospect_type,
    });

    // Assign the prospect to the next in-house sales representative
    prospect.salesRepresentative = {
      id: nextUser.id,
      name: nextUser.name,
      email: nextUser.email,
      // Include other user information as needed
    };

    // Update the prospect data in Redis
    const redisKey = `prospect:${prospect.id}`;
    const redisValue = JSON.stringify(prospect);
    redisClient.setex(redisKey, 3600, redisValue);

    // Publish a message to RabbitMQ to inform about the assignment
    const rabbitMqUrl = 'amqp://localhost';
    const connection = await amqp.connect(rabbitMqUrl);
    const channel = await connection.createChannel();
    const exchangeName = 'sales-assignment';
    const message = JSON.stringify({ prospectId: prospect.id, userId: nextUser.id });
    channel.assertExchange(exchangeName, 'fanout', { durable: false });
    channel.publish(exchangeName, '', Buffer.from(message));

    prospect.assigned_status = 1;
    await prospect.save();

    const assignmentDate = new Date();
    await AssignedProspect.create({
      prospect_id: prospect.id,
      user_id: nextUser.id, // The next assigned user
      assignment_date: assignmentDate,
    });
    
    nextUser.assigned += 1;
    await nextUser.save();

    // Respond with the updated prospect data
    res.json({ message: 'Prospect assigned to sales', prospect: prospect })
  } catch (error) {
    console.error('Error auto-assigning sales:', error);
    res.status(500).json({ error: 'Error auto-assigning sales'});
  }
});

// Method to find the last assigned user
User.findLastAssignedUser = async () => {
    return User.findOne({
      order: [['assigned', 'DESC']], 
    });
  };
  
// Method to find the next active user in the sequence
User.findNextUserInSequence = async (assigned) => {
  return User.findOne({
    where: {
      status: 1, // Assuming 1 represents active status; adjust as needed
    },
    order: [['assigned', 'ASC']],
  });
};;
  
  // Method to find the first user in the sequence
  User.findFirstUserInSequence = async () => {
    return User.findOne({
      order: [['assigned', 'ASC']], // Find the user with the lowest assignedOrder
    });
  };

app.post('/auto-assigns', async (req, res) => { //Off-duty
    try {
      // Retrieve all users
      const activeUsers = await User.findAll({ where: { status: 0 } });
  
      if (activeUsers.length === 0) {
        return res.status(404).json({ error: 'No in-house sales representatives found' });
      }
  
      // Retrieve unassigned prospects from the database
      const unassignedProspects = await Prospect.findAll({ where: { assigned_status: 0 } });
  
      if (unassignedProspects.length === 0) {
        return res.json({ message: 'No unassigned prospects found' });
      }
  
      // Assign prospects to the users in a round-robin fashion
      for (let i = 0; i < unassignedProspects.length; i++) {
        const userIndex = i % activeUsers.length;
        const nextUser = activeUsers[userIndex];
        const prospect = unassignedProspects[i];
  
        // Automatically assign the prospect to the next in-house sales representative
        prospect.salesRepresentative = {
          id: nextUser.id,
          name: nextUser.name,
          email: nextUser.email,
          // Include other user information as needed
        };
  
        // Change the assigned_status of the prospect to indicate it's assigned
        prospect.assigned_status = 1;
        await prospect.save();
  
        // Update the prospect data in Redis (if needed)
        const redisKey = `prospect:${prospect.id}`;
        const redisValue = JSON.stringify(prospect);
        redisClient.setex(redisKey, 3600, redisValue);
  
        // Publish a message to RabbitMQ to inform about the assignment (if needed)
        const rabbitMqUrl = 'amqp://localhost';
        const connection = await amqp.connect(rabbitMqUrl);
        const channel = await connection.createChannel();
        const exchangeName = 'sales-assignment';
        const message = JSON.stringify({ prospectId: prospect.id, userId: nextUser.id });
        channel.assertExchange(exchangeName, 'fanout', { durable: false });
        channel.publish(exchangeName, '', Buffer.from(message));

        const assignmentDate = new Date();
        await AssignedProspect.create({
          prospect_id: prospect.id,
          user_id: nextUser.id, // The next assigned user
          assignment_date: assignmentDate,
        });

        nextUser.assigned += 1;
        await nextUser.save();
      }
  
      // Respond with the updated prospect data
      res.status(200).json({ message: 'Prospects assigned to sales', prospects: unassignedProspects });
    } catch (error) {
      console.error('Error auto-assigning sales:', error);
      res.status(500).json({ error: 'Error auto-assigning sales' });
    }
  });
  
  User.findNextUser = async (assigned) => {
    return User.findOne({
      where: {
        status: 0, 
      },
      order: [['assigned', 'ASC']],
    });
  };;

  
// auto-assign-user API
app.post('/auto-assign-user', async (req, res) => {
  try {
    const lastAssignedUser = await User.findLastAssignedUser();
    const nextUser = lastAssignedUser
      ? await User.findNextUserInSequence(lastAssignedUser.assigned)
      : await User.findFirstUserInSequence();

    if (!nextUser) {
      return res.status(404).json({ error: 'No in-house sales representative found' });
    }

    const {
      user_roles_id,
      source,
      prospect_name,
      prospect_contact_number,
      prospect_email,
    } = req.body;

    const prospect_type = 'E appointment';
    if (!prospect_contact_number.startsWith('62')) {
      return res.status(400).json({ error: 'Prospect contact number must start with "62"' });
    }

    const prospect = await Prospect.create({
      user_roles_id,
      source,
      prospect_name,
      prospect_contact_number,
      prospect_email,
      prospect_type,
    });

    prospect.salesRepresentative = {
      id: nextUser.id,
      name: nextUser.name,
      email: nextUser.email,
    };

    await prospect.save();

    const redisKey = `prospect:${prospect.id}`;
    const redisValue = JSON.stringify(prospect);
    redisClient.setex(redisKey, 3600, redisValue);

    const rabbitMqUrl = 'amqp://localhost';
    const connection = await amqp.connect(rabbitMqUrl);
    const channel = await connection.createChannel();
    const exchangeName = 'sales-assignment';
    const message = JSON.stringify({ prospectId: prospect.id, userId: nextUser.id });
    channel.assertExchange(exchangeName, 'fanout', { durable: false });
    channel.publish(exchangeName, '', Buffer.from(message));

    const timer = setTimeout(async () => {
      await handleTimeout(prospect.id, nextUser.id, channel);
    }, 180000); // 3 minutes

    // Do not record anything at this point; wait for user response or timeout

    res.status(200).json({ message: 'Prospect sent to sales', prospectId: prospect.id, assignedUser: nextUser.id });
  } catch (error) {
    console.error('Error auto-assigning sales:', error);
    res.status(500).json({ error: 'Error auto-assigning sales' });
  }
});

app.post('/user-response', async (req, res) => {
  try {
    const { prospectId, response } = req.body;
    const assignedUserId = req.body.assignedUserId;

    if (!assignedUserId) {
      return res.status(500).json({ error: 'Assigned user ID not available' });
    }

    // Check if the user has already responded (either accept or reject)
    const hasResponded = await Response.findOne({
      where: {
        prospect_id: prospectId,
        user_id: assignedUserId,
      },
    });

    // Check if the user has already timed out for the same prospect
    const hasTimedOut = await Response.findOne({
      where: {
        prospect_id: prospectId,
        user_id: assignedUserId,
        response: 'timeout',
      },
    });

    // If the user has already responded or timed out, return an error
    if (hasResponded || hasTimedOut) {
      return res.status(400).json({ error: 'User has already responded or timed out for the prospect' });
    }

    // Retrieve the prospect from Redis
    const redisKey = `prospect:${prospectId}`;
    const prospectString = await redisClient.get(redisKey);
    const prospect = JSON.parse(prospectString);

    if (!prospect) {
      return res.status(404).json({ error: 'Prospect not found' });
    }

    // Record the user response in the Response table
    await Response.create({
      prospect_id: prospectId,
      user_id: assignedUserId,
      response: response,
    });

    // Update the prospect's assigned status based on the user's response
    if (response === 'accept') {
      if (prospect.assigned === 1) {
        // If already accepted, return an error
        return res.status(400).json({ error: 'User has already accepted the prospect' });
      }

      prospect.assigned = 1; // Assuming 1 represents accepted status; adjust as needed

      // Update the AssignedProspect table only if the user accepted
      const assignmentDate = new Date();
      await AssignedProspect.create({
        prospect_id: prospectId,
        user_id: assignedUserId,
        assignment_date: assignmentDate,
      });

      // Update the user's assigned count
      const assignedUserModel = await User.findByPk(assignedUserId);
      if (assignedUserModel instanceof User) {
        assignedUserModel.assigned += 1;
        await assignedUserModel.save();
      }

      // Update the prospect data in Redis
      const redisValue = JSON.stringify(prospect);
      await redisClient.setex(redisKey, 3600, redisValue); // Use await here

      // Update the assigned_status in the Prospect table to 1
      await Prospect.update({ assigned_status: 1 }, { where: { id: prospectId } });
    }

    res.status(200).json({ message: `User response recorded: ${response}` });
  } catch (error) {
    console.error('Error recording user response:', error);
    res.status(500).json({ error: 'Error recording user response' });
  }
});

async function handleTimeout(prospectId, userId, channel) {
  try {
    // Check if the user has already responded (either accept or reject)
    const hasResponded = await Response.findOne({
      where: {
        prospect_id: prospectId,
        user_id: userId,
      },
    });

    // Check if the user has already timed out for the same prospect
    const hasTimedOut = await Response.findOne({
      where: {
        prospect_id: prospectId,
        user_id: userId,
        response: 'timeout',
      },
    });

    if (hasResponded || hasTimedOut) {
      console.log(`User ${userId} has already responded or timed out for prospect ${prospectId}`);
      return;
    }

    // Find the next user in sequence who fulfills the requirement
    const reassignUser = await User.findNextUserInSequence(userId);

    if (reassignUser) {
      const redisKeyReassign = `prospect:${prospectId}`;
      const prospectString = await redisClient.get(redisKeyReassign);
      const prospect = JSON.parse(prospectString);

      if (prospect) {
        prospect.salesRepresentative = {
          id: reassignUser.id,
          name: reassignUser.name,
          email: reassignUser.email,
        };

        const redisValueReassign = JSON.stringify(prospect);
        redisClient.setex(redisKeyReassign, 3600, redisValueReassign);

        const exchangeName = 'sales-assignment';
        const reassignMessage = JSON.stringify({ prospectId: prospectId, userId: reassignUser.id });
        channel.publish(exchangeName, '', Buffer.from(reassignMessage));

        // Record the user response in the Response table
        await Response.create({
          prospect_id: prospectId,
          user_id: reassignUser.id,
          response: 'timeout',
        });

        // If the next user is not the current user, handle the timeout for the next user
        if (reassignUser.id !== userId) {
          await handleTimeout(prospectId, reassignUser.id, channel);
        }
      }
    }
  } catch (error) {
    console.error('Error handling timeout:', error);
  }
}

app.use('/users', userRoutes);


// User Information
app.get('/users', async (req, res) => {
    try {
        const users = await User.findAll({ attributes: ['id', 'name', 'username', 'email'] });
        res.json(users);
    } catch (error) {
        console.error('Fetch users error:', error);
        res.status(500).send({ error: 'Internal server error' });
    }
});

// Access userrole list for user using Token
app.get('/user', authenticateJWT, async (req, res) => {
    try {
        const users = await UserRole.findAll();
        res.json(users);
    } catch (error) {
        console.error('Fetch user list error:', error);
        res.status(500).send({ error: 'Internal server error' });
    }
});



app.listen(3000, () => {
    console.log('Server is running on http://localhost:3000');
});

module.exports = {authenticateJWT};
module.exports = app;