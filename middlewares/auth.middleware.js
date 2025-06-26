const jwt = require('jsonwebtoken');
const User = require('../models/User'); 

const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1]; 

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Access token required'
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    const user = await User.findByPk(decoded.userId);
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User not found'
      });
    }

    req.user = decoded;
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    return res.status(403).json({
      success: false,
      message: 'Invalid or expired token'
    });
  }
};

const requireVerification = async (req, res, next) => {
  try {
    const user = await User.findByPk(req.user.userId);
    
    if (!user.isVerified) {
      return res.status(400).json({
        success: false,
        message: 'Please verify your phone number first',
        requiresVerification: true
      });
    }
    
    next();
  } catch (error) {
    console.error('Verification middleware error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

const requireCompleteProfile = async (req, res, next) => {
  try {
    const user = await User.findByPk(req.user.userId);
    
    const isComplete = !!(user.name && user.dateOfBirth && user.gender);
    
    if (!isComplete) {
      return res.status(400).json({
        success: false,
        message: 'Please complete your profile first',
        requiresProfileCompletion: true
      });
    }
    
    next();
  } catch (error) {
    console.error('Profile completion middleware error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

module.exports = {
  authenticateToken,
  requireVerification,
  requireCompleteProfile
};