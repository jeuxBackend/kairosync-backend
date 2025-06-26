const express = require('express');
const router = express.Router();
const userController = require('../controllers/auth.controller'); 
const { 
  authenticateToken, 
  requireVerification, 
  requireCompleteProfile 
} = require('../middlewares/auth.middleware'); 
const { profilePictureUpload } = require('../middlewares/upload.middleware');

const uploadProfilePicture = profilePictureUpload();

router.post('/signup', userController.signup);
router.post('/login', userController.login);
router.post('/verify-otp', userController.verifyOTP);
router.post('/resend-otp', userController.resendOTP);
router.post('/forgot-password', userController.forgotPassword);
router.post('/reset-password', userController.resetPassword);

router.get('/profile', authenticateToken, userController.getProfile);
router.get('/getUserById/:userId', authenticateToken, userController.getUserById);
router.put('/complete-profile', 
  authenticateToken, 
  requireVerification, 
  uploadProfilePicture.single('profilePicture'), 
  userController.completeProfile
);
router.put('/update-profile', 
  authenticateToken, 
  requireVerification, 
  uploadProfilePicture.single('profilePicture'), 
  userController.updateProfile
);
router.post('/upload-contacts', 
  authenticateToken, 
  requireVerification, 
  userController.uploadContacts
);

module.exports = router;