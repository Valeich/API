const amqp = require('amqplib');
const Prospect = require('./models/Prospect');


const rabbitMqUrl = 'amqp://localhost';

async function startConsumer() {
  try {
    const connection = await amqp.connect(rabbitMqUrl);
    const channel = await connection.createChannel();
    const queueName = 'prospects_queue';

    channel.assertQueue(queueName, { durable: true });

    console.log('Prospects Consumer waiting for prospect data...');

    channel.consume(queueName, async (msg) => {
      if (msg !== null) {
        const prospectData = JSON.parse(msg.content.toString());

        // Process the prospect data and save it to the database
        try {
          const prospect = await Prospect.create(prospectData);
          console.log('Prospect created:', prospect);
        } catch (error) {
          console.error('Error creating prospect:', error);
        }

        // Acknowledge the message to remove it from the queue
        channel.ack(msg);
      }
    });
  } catch (error) {
    console.error('Prospects Consumer error:', error);
  }
}

startConsumer();

module.exports = {rabbitMqUrl};