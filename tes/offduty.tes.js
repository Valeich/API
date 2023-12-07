const chai = require('chai');
const chaiHttp = require('chai-http');
const app = require('../server.js');

chai.use(chaiHttp);
const expect = chai.expect;

describe('POST /auto-assigns', () => {
  it('should successfully auto-assign prospects when there are active users', async () => {
    const response = await chai.request(app).post('/auto-assigns');
    expect(response).to.have.status(200);
    expect(response.body).to.have.property('message').to.equal('Prospects assigned to sales');
  });

  it('should return a message if no unassigned prospects are found', async () => {
    // Assuming there is at least one active user in the database
    const response = await chai.request(app).post('/auto-assigns');
    expect(response).to.have.status(200);
    expect(response.body).to.have.property('message').to.equal('No unassigned prospects found');
  });

  it('should auto-assign prospects to users in a round-robin fashion', async () => {
    const response = await chai.request(app).post('/auto-assigns');
    expect(response).to.have.status(200);
    expect(response.body).to.have.property('message').to.equal('Prospects assigned to saless');
    // Add more assertions based on the expected structure of the response
  });
  

  // Add more tests to cover additional scenarios, such as testing the RabbitMQ functionality
});
