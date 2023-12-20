const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Prospect = require('../models/Prospect');
const AssignedProspect = require('../models/AssignedProspect');
const Response =  require('../models/Response');
const redisClient = require('../config/redis');


router.post('/', async (req, res) => {
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
  
  module.exports = router;