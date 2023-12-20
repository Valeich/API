const express = require('express');
const router = express.Router();
const amqp = require('amqplib');;
const User = require('../models/User');
const Prospect = require('../models/Prospect');
const AssignedProspect = require('../models/AssignedProspect');
const redisClient = require('../config/redis');

router.post('/', async (req, res) => { //Off-duty
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

  User.findNextUser = async (assigned) => {
    return User.findOne({
      where: {
        status: 0, 
      },
      order: [['assigned', 'ASC']],
    });
  };;

  module.exports = router;