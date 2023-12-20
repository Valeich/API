const express = require('express');
const router = express.Router();
const amqp = require('amqplib');
const User = require('../models/User');
const Prospect = require('../models/Prospect');
const AssignedProspect = require('../models/AssignedProspect');
const redisClient = require('../config/redis');

router.post('/', async (req, res) => {
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

  module.exports = router;