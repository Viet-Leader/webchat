const express = require('express');
const router = express.Router();
const friendsController = require('../controllers/friendsController');

router.get('/search', friendsController.searchUsers);
router.post('/request', friendsController.sendFriendRequest);
router.post('/accept', friendsController.acceptFriendRequest);
router.post('/reject', friendsController.rejectFriendRequest);
router.post('/cancel', friendsController.cancelFriendRequest);
router.post('/unfriend', friendsController.unfriend);

// Danh sách bạn bè
router.get('/list/:userId', friendsController.getFriends);

// Danh sách yêu cầu (received)
router.get('/requests/:userId', friendsController.getFriendRequests);

module.exports = router;
