const express = require('express');
const router = express.Router();
const User = require('../models/User');

router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ 
        error: 'Username and password are required' 
      });
    }

    const user = await User.findOne({ username }).select('+password');

    if (!user) {
      return res.status(401).json({ 
        error: 'Invalid username or password' 
      });
    }

    const isMatch = await user.comparePassword(password);

    if (!isMatch) {
      return res.status(401).json({ 
        error: 'Invalid username or password' 
      });
    }

    req.session.userId = user._id;

    const userResponse = {
      id: user._id,
      username: user.username,
      avatar: user.avatar,
      createdAt: user.createdAt
    };

    res.json({ 
      message: 'Login successful',
      user: userResponse 
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ 
      error: 'Server error during login' 
    });
  }
});

router.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ 
        error: 'Could not log out' 
      });
    }
    
    res.clearCookie('connect.sid');
    res.json({ message: 'Logout successful' });
  });
});

router.get('/me', async (req, res) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ 
        error: 'Not authenticated' 
      });
    }

    const user = await User.findById(req.session.userId).select('-password');

    if (!user) {
      return res.status(404).json({ 
        error: 'User not found' 
      });
    }

    res.json({ user });

  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ 
      error: 'Server error' 
    });
  }
});

router.post('/register', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ 
        error: 'Username and password are required' 
      });
    }

    if (password.length < 6) {
      return res.status(400).json({ 
        error: 'Password must be at least 6 characters' 
      });
    }

    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(400).json({ 
        error: 'Username already taken' 
      });
    }

    const user = new User({
      username,
      password
    });

    await user.save();

    req.session.userId = user._id;

    res.status(201).json({
      message: 'User created successfully',
      user: {
        id: user._id,
        username: user.username,
        avatar: user.avatar
      }
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ 
      error: 'Server error during registration' 
    });
  }
});

module.exports = router;