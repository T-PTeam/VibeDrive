const redis = require('redis');

async function publishMessage(userId = 'driver123', message = 'Test message from Node.js') {
  const client = redis.createClient({
    url: 'redis://localhost:6379'
  });

  try {
    await client.connect();
    console.log('Connected to Redis');

    const messageData = {
      userId: userId,
      type: 'test',
      data: message,
      timestamp: new Date().toISOString()
    };

    const result = await client.publish('driver_updates', JSON.stringify(messageData));
    console.log(`Message published to ${result} subscriber(s)`);
    console.log('Message:', JSON.stringify(messageData, null, 2));
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await client.quit();
  }
}

const userId = process.argv[2] || 'driver123';
const message = process.argv[3] || 'Test message from Node.js';

publishMessage(userId, message);

