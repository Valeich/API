// userRoutes.js
const express = require('express');
const User  = require('./models/User');

const router = express.Router();

router.put('/change-status/:userId', async (req, res) => {
  const userId = req.params.userId;

  try {
    const user = await User.findOne({ where: { id: userId } });

    if (user) {
      // Update the user's status (toggle between 0 and 1)
      user.status = user.status === 1 ? 0 : 1;
      await user.save();

      return res.json({ message: 'User status updated successfully', status: user.status });
    } else {
      return res.status(404).json({ error: 'User not found' });
    }
  } catch (error) {
    console.error('Error updating user status:', error);
    return res.status(500).json({ error: 'Error updating user status' });
  }
});

module.exports = router;
