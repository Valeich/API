const chai = require('chai');
const chaiHttp = require('chai-http');
const app = require('../server.js'); 
const AssignedProspect = require('../models/AssignedProspect.js');
const redisClient = require('../config/redis.js');

chai.use(chaiHttp);
const expect = chai.expect;

describe('POST /prospects', () => {
  it('should create a new prospect and return 201', async () => {
    const response = await chai
      .request(app)
      .post('/prospects')
      .send({
        user_roles_id: 17,
        source: 'Web',
        prospect_name: 'Test Prospect',
        prospect_contact_number: '1234567890',
        prospect_email: 'test@example.com',
        prospect_type: 'Lead',
      });

    expect(response).to.have.status(201);
    expect(response.body).to.have.property('message').to.equal('Prospect created');
    expect(response.body).to.have.property('prospect');
    // You can add more assertions based on the expected structure of the response
  });

  it('should return an error if required fields are missing', async () => {
    const response = await chai.request(app).post('/prospects').send({

    });

    expect(response).to.have.status(400);
    expect(response.body).to.have.property('error');
  });

  it('should handle database errors and return 500', async () => {
    const response = await chai.request(app).post('/prospects').send({
      user_roles_id: 999, // Non-existent user_roles_id
      source: 'Web',
      prospect_name: 'Test Prospect',
      prospect_contact_number: '1234567890',
      prospect_email: 'test@example.com',
      prospect_type: 'Lead',
    });

    expect(response).to.have.status(500);
    expect(response.body).to.have.property('error');
    // You can add more assertions based on the expected structure of the response
  });

  // Add more tests for validation, handling specific scenarios, etc.
});

describe('POST /assign', () => {
  it('should assign a prospect to a user and return success', async () => {
    const prospectId = 23;
    const userId = 21;

    const response = await chai
      .request(app)
      .post('/assign')
      .send({
        prospectId,
        userId,
      });

    expect(response).to.have.status(200);
    expect(response.body).to.have.property('message').to.equal('Prospect assigned to sales');
    expect(response.body).to.have.property('prospect');
    // You can add more assertions based on the expected structure of the response

    // Clean up after the test (delete the assigned prospect, reset Redis, etc.)
    await AssignedProspect.destroy({ where: { prospect_id: prospectId } });
    await redisClient.del(`prospect:${prospectId}`);
  });

  it('should return an error if user is not found', async () => {
    const response = await chai.request(app).post('/assign').send({
      prospectId: 2,
      userId: 999, // Non-existent user
    });

    expect(response).to.have.status(404);
    expect(response.body).to.have.property('error');
    // You can add more assertions based on the expected structure of the response
  });

  it('should return an error if prospect is not found', async () => {
    const response = await chai.request(app).post('/assign').send({
      prospectId: 999, // Non-existent prospect
      userId: 1,
    });

    expect(response).to.have.status(404);
    expect(response.body).to.have.property('error');
  });

  // Add more tests for handling specific scenarios, edge cases, etc.
});
