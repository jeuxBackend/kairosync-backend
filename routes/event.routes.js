const express = require('express');
const router = express.Router();
const eventController = require('../controllers/event.controller');
const { 
  authenticateToken, 
  requireVerification, 
  requireCompleteProfile 
} = require('../middlewares/auth.middleware');
const { generalUpload } = require('../middlewares/upload.middleware');

const uploadEventImage = generalUpload({
  destination: 'uploads/events',
  fileTypes: ['image/'],
  maxSize: 5 * 1024 * 1024, 
  filePrefix: 'event'
});

router.post('/events/create', 
  authenticateToken, 
  requireVerification, 
  requireCompleteProfile,
  uploadEventImage.single('coverPic'), 
  eventController.createEvent
);

router.get('/events', 
  authenticateToken, 
  eventController.getEvents
);

router.get('/events/:eventId', 
  authenticateToken, 
  eventController.getEventById
);

router.put('/events/update/:eventId', 
  authenticateToken, 
  requireVerification, 
  requireCompleteProfile,
  uploadEventImage.single('coverPic'), 
  eventController.updateEvent
);

router.delete('/events/delete/:eventId', 
  authenticateToken, 
  requireVerification, 
  requireCompleteProfile,
  eventController.deleteEvent
);

router.post('/events/:eventId/invite', 
  authenticateToken, 
  requireVerification, 
  requireCompleteProfile,
  eventController.inviteUsers
);

router.post('/events/:eventId/respond', 
  authenticateToken, 
  requireVerification,
  eventController.respondToInvite
);

router.post('/events/:eventId/join', 
  authenticateToken, 
  requireVerification,
  eventController.joinPublicEvent
);

router.post('/events/:eventId/like-toggle', 
  authenticateToken, 
  requireVerification,
  eventController.toggleLikeEvent
);

router.post('/events/:eventId/addComment', 
  authenticateToken, 
  requireVerification,
  eventController.addComment
);

router.get('/events/:eventId/comments', 
  authenticateToken, 
  eventController.getComments
);

router.post('/events/comments/:commentId/like-toggle', 
  authenticateToken, 
  requireVerification,
  eventController.toggleLikeComment
);

router.post('/templates/create', 
  authenticateToken, 
  requireVerification, 
  requireCompleteProfile,
  eventController.createTemplate
);

router.get('/templates', 
  authenticateToken, 
  eventController.getTemplates
);

router.put('/templates/:templateId/update', 
  authenticateToken, 
  requireVerification, 
  requireCompleteProfile,
  eventController.updateTemplate
);

router.delete('/templates/:templateId/delete', 
  authenticateToken, 
  requireVerification, 
  requireCompleteProfile,
  eventController.deleteTemplate
);

router.post('/:eventId/attendance', 
  authenticateToken, 
  requireVerification,
  eventController.markAttendance
);
router.get('/getUserLikedEvents', 
  authenticateToken, 
  requireVerification,
  eventController.getMyLikedEvents
);

module.exports = router;