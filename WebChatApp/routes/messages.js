const express = require('express');
const router = express.Router();
const messagesController = require('../controllers/messagesController');

router.get('/history/:senderId/:receiverId', messagesController.getMessages);
router.post('/send', messagesController.sendMessage);

module.exports = router;
