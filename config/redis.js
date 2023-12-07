const Redis = require('ioredis');
const redisClient = new Redis();

// Check the Redis connection status
redisClient.ping((err, result) => {
  if (err) {
    console.error('Redis connection error:', err);
  } else {
    console.log('Redis connection is active:', result);
  }
});

// Store data in Redis with a TTL (time-to-live)
function cacheData(key, data, ttl) {
  try {
    redisClient.setex(key, ttl, JSON.stringify(data));
    console.log('Data cached in Redis');
  } catch (error) {
    console.error('Error caching data in Redis:', error);
    throw error;
  }
}

// Retrieve cached data from Redis
function retrieveCachedData(key) {
  return new Promise((resolve, reject) => {
    redisClient.get(key, (err, reply) => {
      if (err) {
        console.error('Error retrieving data from Redis:', err);
        reject(err);
      } else {
        const data = JSON.parse(reply);
        resolve(data);
      }
    });
  });
}

module.exports = redisClient;
