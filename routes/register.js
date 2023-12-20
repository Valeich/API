const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const sequelize = require('../config/database');
const User = require('../models/User');
const Roles = require('../models/Roles');
const UserRole = require('../models/UserRole');


router.post('/', async (req, res) => {
    console.log('register route reached');
    const { name, email, password, Role } = req.body;

    try {
        const t = await sequelize.transaction();

        try {
            const existingUser = await User.findOne({ where: { email } });
            if (existingUser) {
                await t.rollback();
                return res.status(400).send({ error: 'Email is already in use' });
            }

            const hashedPassword = await bcrypt.hash(password, 10);
            const user = await User.create({
                name,
                photo: req.body.photo,
                username: req.body.username,
                email,
                password: hashedPassword
            }, { transaction: t });

            if (Role) {
                const roleRecord = await Roles.findByPk(Role);
                if (!roleRecord) {
                    await t.rollback();
                    return res.status(400).send({ error: 'Role not found' });
                }

                await UserRole.create({
                    user_id: user.id,
                    roles_id: roleRecord.id
                }, { transaction: t });
            }

            await t.commit();

            res.status(201).send({ message: 'User registered', user });
        } catch (error) {
            await t.rollback();
            throw error;
        }
    } catch (error) {
        res.status(500).send({ error: error.message });
    }
});

module.exports = router;