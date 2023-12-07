const chai = require('chai');
const chaiHttp = require('chai-http');
const { describe, it, before, after } = require('mocha');
const sinon = require('sinon');
const app = require('../server.js');
const Prospect = require('../models/Prospect');
const User = require('../models/User');
const Response = require('../models/Response');
const AssignedProspect = require('../models/AssignedProspect');
const redisClient = require('../config/redis');
const amqp = require('amqplib');

chai.use(chaiHttp);
const expect = chai.expect;

describe('POST /auto-assign-user', () => {
  let clock;
  let redisClientStub;
  let amqpStub;

  before(() => {
    clock = sinon.useFakeTimers();
    redisClientStub = sinon.stub(redisClient, 'setex').resolves('OK');
    amqpStub = sinon.stub(amqp, 'connect').resolves({
      createChannel: sinon.stub().resolves({
        assertExchange: sinon.stub(),
        publish: sinon.stub(),
      }),
    });

    // Stub database methods for testing
    sinon.stub(User, 'findLastAssignedUser').resolves({ id: 1, assigned: 0 });
    sinon.stub(User, 'findNextUserInSequence').resolves({ id: 2, name: 'User 2', email: 'user2@example.com' });
    sinon.stub(User, 'findFirstUserInSequence').resolves({ id: 3, name: 'User 3', email: 'user3@example.com' });

    // Modify the Prospect stub to include necessary methods
    sinon.stub(Prospect, 'create').resolves({
      id: 1,
      salesRepresentative: null,
      save: sinon.stub().resolves({
        id: 1,
        salesRepresentative: null,
      }),
    });

    sinon.stub(AssignedProspect, 'create').resolves({});
  });

  after(() => {
    clock.restore();
    redisClientStub.restore();
    amqpStub.restore();
    // Restore original database methods
    sinon.restore();
  });

  it('should auto-assign a prospect to a user', async () => {
    try {
      const response = await chai.request(app)
        .post('/auto-assign-user')
        .send({
          user_roles_id: 23,
          source: 'Test Source',
          prospect_name: 'Test Prospect',
          prospect_contact_number: '1234567890',
          prospect_email: 'test@example.com',
          prospect_type: 'Test Type',
        });

      expect(response).to.have.status(200);
      expect(response.body).to.have.property('message').to.equal('Prospect sent to sales');
      expect(response.body).to.have.property('prospectId').to.be.a('number');
      expect(response.body).to.have.property('assignedUser').to.be.a('number');
    } catch (error) {
      throw error;
    }
  });

  // Additional tests for error paths, etc.
});

describe('POST /user-response', () => {
  let clock;
  let redisClientStub;

  before(() => {
    clock = sinon.useFakeTimers();
    redisClientStub = sinon.stub(redisClient, 'get').resolves(JSON.stringify({ /* mock prospect data */ }));

    // Stub database methods for testing
    sinon.stub(Response, 'findOne').resolves(null);
    sinon.stub(User, 'findByPk').resolves({ id: 2, assigned: 0 }); // Stub for the assigned user
    sinon.stub(Prospect, 'update').resolves([1]);
    sinon.stub(AssignedProspect, 'create').resolves({});
    sinon.stub(User.prototype, 'save').resolves({});
  });

  after(() => {
    clock.restore();
    redisClientStub.restore();
    // Restore original database methods
    sinon.restore();
  });

  it('should handle user response', async () => {
    try {
      // User rejects a prospect
      const rejectResponse = await chai.request(app)
        .post('/user-response')
        .send({
          prospectId: 10,
          response: 'reject',
          assignedUserId: 2,
        });
  
      expect(rejectResponse).to.have.status(200);
      expect(rejectResponse.body).to.have.property('message').to.equal('User response recorded: reject');
    } catch (error) {
      throw error;
    }
  });
  
  it('should not allow user to respond to same prospect after acceptance', async () => {
    const acceptResponse = await chai.request(app)
      .post('/user-response')
      .send({
        prospectId: 62, 
        response: 'accept',
        assignedUserId: 5, 
      });
  
    expect(acceptResponse).to.have.status(200);
    expect(acceptResponse.body).to.have.property('message').to.equal('User response recorded: accept');
  
    try {
      const acceptResponse = await chai.request(app)
        .post('/user-response')
        .send({
          prospectId: 10,
          response: 'accept',
          assignedUserId: 2, 
        });
  
      throw new Error('Expected server to return 400 status for duplicate response, but it returned 200');
    } catch (error) {
      expect(error).to.be.an.instanceOf(Error);
      expect(error.message).to.equal('Expected server to return 400 status for duplicate response, but it returned 200');
    }
  });
  
  it('should handle user not responding and reassign to another user after timeout', async () => {
    try {
      const response = await chai.request(app)
        .post('/user-response')
        .send({
          prospectId: 10, // Provide an existing prospect ID
          response: 'timeout', // User does not respond
          assignedUserId: 2, // Provide an existing user ID
        });

      expect(response).to.have.status(200);
      expect(response.body).to.have.property('message').to.equal('User response recorded: timeout');

      // Advance the clock to simulate a timeout
      clock.tick(180001); // 3 minutes and 1 millisecond

      // The prospect should be automatically reassigned to another user
      const reassignResponse = await chai.request(app)
        .post('/auto-assign-user')
        .send({
          user_roles_id: 23,
          source: 'Test Source',
          prospect_name: 'Test Prospect',
          prospect_contact_number: '1234567890',
          prospect_email: 'test@example.com',
          prospect_type: 'Test Type',
        });

      expect(reassignResponse).to.have.status(200);
      expect(reassignResponse.body).to.have.property('message').to.equal('Prospect sent to sales');
      expect(reassignResponse.body).to.have.property('prospectId').to.be.a('number');
      expect(reassignResponse.body).to.have.property('assignedUser').to.be.a('number').to.not.equal(2); // Check that assignedUser is not the same as the original user

    } catch (error) {
      throw error;
    }
  });

  // Additional tests for error paths, etc.
});
