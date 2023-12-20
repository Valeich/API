const express = require('express');
const router = express.Router();
const amqp = require('amqplib');
const User = require('../models/User');;
const Prospect = require('../models/Prospect');
const AssignedProspect = require('../models/AssignedProspect');
const redisClient = require('../config/redis');



router.post('/', async (req, res) => {
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

  module.exports = router;