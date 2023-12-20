const express = require('express');
const router = express.Router();
const amqp = require('amqplib');
const User = require('../models/User');
const Prospect = require('../models/Prospect');
const Response =  require('../models/Response');
const redisClient = require('../config/redis');

router.post('/', async (req, res) => {
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

  module.exports = router;