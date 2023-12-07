const chai = require('chai');
const chaiHttp = require('chai-http');
const app = require('../server.js'); 
const sequelize = require('sequelize');

chai.use(chaiHttp);
const expect = chai.expect;

describe('POST /register', () => {
  after(async () => {
  });

  it('should successfully register a user', async () => {
    const response = await chai.request(app)
      .post('/register')
      .send({
        name: 'John Doe',
        email: 'john.doe@example.com',
        password: 'password123',
        Role: 6,
      });

    expect(response).to.have.status(201);
    expect(response.body).to.have.property('message').to.equal('User registered');
    expect(response.body).to.have.property('user');
    expect(response.body.user).to.have.property('name').to.equal('John Doe');
    // Add more assertions based on the expected structure of the response
  });

  it('should return an error if email is already in use', async () => {
    // Register a user first
    await chai.request(app)
      .post('/register')
      .send({
        name: 'Jane Doe',
        email: 'jane.doe@example.com',
        password: 'password123',
        Role: 1, 
      });

    // Try to register another user with the same email
    const response = await chai.request(app)
      .post('/register')
      .send({
        name: 'Another User',
        email: 'jane.doe@example.com', // use the same email
        password: 'password456',
        Role: 2, 
      });

    expect(response).to.have.status(400);
    expect(response.body).to.have.property('error').to.equal('Email is already in use');
  });

  it('should return an error if role is not found', async () => {
    const response = await chai.request(app)
      .post('/register')
      .send({
        name: 'Invalid Role User',
        photo: 'tes.jpg',
        username: 'tes',
        email: 'invalid.role@example.com',
        password: 'password789',
        Role: 10,
      });

    expect(response).to.have.status(400);
    expect(response.body).to.have.property('error').to.equal('Role not found');
  });
});

describe('POST /login', () => {
  after(async () => {
  });

  it('should successfully log in a user', async () => {
    // Register a user first
    await chai.request(app)
      .post('/register')
      .send({
        name: 'Login User',
        email: 'login.user@example.com',
        password: 'password123',
        Role: 6, 
      });

    // Log in the user
    const response = await chai.request(app)
      .post('/login')
      .send({
        email: 'login.user@example.com',
        password: 'password123',
      });

    expect(response).to.have.status(200);
    expect(response.body).to.have.property('token');
    // Add more assertions based on the expected structure of the response
  });

  it('should return an error if email is invalid', async () => {
    const response = await chai.request(app)
      .post('/login')
      .send({
        email: 'nonexistent.user@example.com', // use a nonexistent email
        password: 'password456',
      });

    expect(response).to.have.status(401);
    expect(response.body).to.have.property('error').to.equal('Invalid email');
  });

  it('should return an error if password is invalid', async () => {
    // Register a user first
    await chai.request(app)
      .post('/register')
      .send({
        name: 'Invalid Password User',
        email: 'invalid.password@example.com',
        password: 'password123',
        Role: 6,
      });

    // Log in the user with an invalid password
    const response = await chai.request(app)
      .post('/login')
      .send({
        email: 'invalid.password@example.com',
        password: 'wrongpassword',
      });

    expect(response).to.have.status(401);
    expect(response.body).to.have.property('error').to.equal('Invalid password');
  });

  it('should return an error if email and password are not provided', async () => {
    const response = await chai.request(app)
      .post('/login')
      .send({
        email: '',
        password: ''
      });

    expect(response).to.have.status(400);
    expect(response.body).to.have.property('error').to.equal('Email and password are required');
  });
});
