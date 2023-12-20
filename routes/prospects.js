const express = require('express');
const router = express.Router();
const amqp = require('amqplib');
const rabbitMqUrl = require ('../rabbitmq');
const Prospect = require('../models/Prospect');
const redisClient = require('../config/redis');

router.post('/', async (req, res) => {
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

  module.exports = router;