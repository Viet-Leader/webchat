// ----------------------------
// Khởi tạo khi trang load xong
// ----------------------------
document.addEventListener('DOMContentLoaded', async () => {
  // Merge từ inline: Load user từ localStorage (trước khi load chat)
  const userData = localStorage.getItem('user');
  if (!userData) {
    window.location.href = 'login.html';
    return;
  }
  const user = JSON.parse(userData);
  window.currentSenderId = user.id;
  window.currentUserName = user.fullname || user.username;
  window.currentUserAvatar = user.avatar;

  // Cập nhật UI ngay
  document.querySelector('.username-display').textContent = window.currentUserName;
  const avatarImg = document.getElementById('userAvatar');
  if (avatarImg) {
    if (user.avatar) {
      avatarImg.src = user.avatar;
      avatarImg.onerror = () => { avatarImg.src = '/img/default.png'; };
    } else {
      avatarImg.src = '/img/default.png';  // Hoặc 'assets/default-avatar.png' nếu file tồn tại
    }
  }

  // Fallback avatar nếu cần
  if (!user.avatar) {
    loadFallbackAvatar();
  }

  // Refactor globals: messageSenders là object { id: { name, avatar } }
  window.messageSenders = {};  // { senderId: { name: 'User', avatar: 'url' } }
  // Thêm window.friendList để fallback
  window.friendList = {};  // { friendId: { name, avatar, ... } }

  // Kết nối socket
  initSocket(user.id);

  // Load chat list (sửa gọi đúng route param-based)
  await loadFriends(user.id);  // Truyền userId
  await loadFriendRequests(user.id);  // Truyền userId

  // Các event còn lại giữ nguyên
  const chatForm = document.getElementById('chat-form');
  if (chatForm) {
    chatForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const msgInput = document.getElementById('message-input');
      let message = normalizeMessage(msgInput.value);
      if (message && window.currentReceiverId) {
        await sendMessageApiAndSocket(window.currentSenderId, window.currentReceiverId, message);
        msgInput.value = '';
      }
    });
  }

  const searchInput = document.querySelector('.msg-search input');
  if (searchInput) {
    searchInput.addEventListener('keyup', async () => {
      const keyword = searchInput.value.trim();
      await searchAndShowUsers(keyword);
    });
    searchInput.addEventListener('input', () => {
      if (searchInput.value.trim() === '') {
        document.getElementById('search-results').style.display = 'none';
        document.getElementById('chat-lists-container').style.display = 'block';
      }
    });
  }

  attachFriendClickListener();
  attachAcceptRequestListener();
  attachAddFriendListener();
});

// Sửa hàm loadFriends (gọi /api/friends/list/:userId)
async function loadFriends() {
  const res = await fetch(`/api/friends/list/${window.currentSenderId}`);
  const friends = await res.json().catch(() => ([]));
  const listEl = document.getElementById('chat-list-open');
  if (!listEl) return;

  listEl.innerHTML = '';

  if (friends.length === 0) {
    listEl.innerHTML = '<p style="color: #999; text-align: center; padding: 20px;">Chưa có bạn bè</p>';
    return;
  }

  const fragment = document.createDocumentFragment();

  friends.forEach(f => {
    const a = document.createElement('a');
    a.href = '#';
    a.className = 'd-flex align-items-center friend-item';
    a.dataset.friendId = f.id;
    a.dataset.friendName = f.fullname || f.username;
    a.dataset.friendAvatar = f.avatar || '';   // <==== THÊM DÒNG NÀY
    a.style.textDecoration = 'none';
    a.style.padding = '10px 12px';
    a.style.marginBottom = '8px';
    a.style.borderRadius = '8px';

    const avatarEl = document.createElement('img');
    avatarEl.src = f.avatar || '/img/default.png';
    avatarEl.style.width = "40px";
    avatarEl.style.height = "40px";
    avatarEl.style.borderRadius = "50%";
    avatarEl.style.objectFit = "cover";

    const div = document.createElement('div');
    div.style.cssText = 'flex: 1; min-width: 0;';
    div.innerHTML = `
      <h6 style="margin: 0; color: #222; font-weight: 600; font-size: 14px;">${f.fullname || f.username}</h6>
      <p style="margin: 0; color: #999; font-size: 12px;">${f.username}</p>
    `;

    a.appendChild(avatarEl);
    a.appendChild(div);
    fragment.appendChild(a);
  });

  listEl.appendChild(fragment);

  // Populate window.friendList từ friends
  window.friendList = friends.reduce((acc, f) => {
    acc[f.id] = { 
      name: f.fullname || f.username, 
      avatar: f.avatar || '/img/default.png' 
    };
    return acc;
  }, {});

  // Populate window.messageSenders (nếu chưa có)
  friends.forEach(f => {
    if (!window.messageSenders[f.id]) {
      window.messageSenders[f.id] = { 
        name: f.fullname || f.username, 
        avatar: f.avatar || '/img/default.png' 
      };
    }
  });
}

// Sửa hàm loadFriendRequests (gọi /api/friends/requests/:userId)
async function loadFriendRequests(userId) {
  try {
    console.log('Loading requests for userId:', userId);  // Debug
    const response = await fetch(`/api/friends/requests/${userId}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const requests = await response.json();

    const friendRequests = document.getElementById('friend-requests');
    friendRequests.innerHTML = '';  // Clear cũ
    requests.forEach(req => {
      const item = createRequestItem(req);  // Hàm tạo HTML item (giả sử bạn có)
      friendRequests.appendChild(item);
    });
    console.log('Requests loaded:', requests.length);  // Debug
  } catch (error) {
    console.error('Load requests error:', error);
    document.getElementById('friend-requests').innerHTML = '<p class="text-muted">Không có yêu cầu nào.</p>';
  }
}

// Hàm tạo item mẫu (nếu chưa có, thêm vào scripts.js)
function createFriendItem(friend) {
  const div = document.createElement('div');
  div.className = 'media new';

  const avatarSrc = friend.avatar
    ? friend.avatar
    : '/img/default.png';

  div.innerHTML = `
    <a href="#" class="friend-item" data-userid="${friend.id}">
      <div class="d-flex">
        <div class="avatar-container">
          <img class="avatar" 
               src="${avatarSrc}" 
               alt="${friend.fullname}" 
               style="width:45px;height:45px;border-radius:50%;object-fit:cover;">
        </div>
        <div class="chat-info ms-2">
          <h5 class="user-title mb-0">${friend.fullname || friend.username}</h5>
          <p class="text-muted small">${friend.lastMessage || 'No message yet'}</p>
        </div>
      </div>
    </a>
  `;
  return div;
}


function createRequestItem(req) {
  const avatarSrc = req.avatar ? req.avatar : '/img/default.png';

  const div = document.createElement('div');
  div.className = 'media new';
  div.innerHTML = `
    <a href="#" class="request-item" data-userid="${req.id}">
      <div class="d-flex">
        <img class="avatar" src="${avatarSrc}" 
             style="width:45px;height:45px;border-radius:50%;object-fit:cover;margin-right:10px;">
        <div class="chat-info">
          <h5 class="user-title mb-0">${req.fullname || req.username}</h5>
          <p class="text-muted small">Yêu cầu kết bạn</p>
          <button class="btn btn-success btn-sm accept-btn">Chấp nhận</button>
          <button class="btn btn-danger btn-sm reject-btn">Từ chối</button>
        </div>
      </div>
    </a>
  `;
  return div;
}


// Giữ nguyên các hàm khác: loadFallbackAvatar, initSocket, etc.

// Hàm fallback (dùng placeholder nếu fetch lỗi)
function loadFallbackAvatar() {
  const headerProfile = document.querySelector('.user-profile');
  if (headerProfile) {
    // Xóa avatar cũ nếu có
    const existingAvatar = headerProfile.querySelector('img.user-avatar, .avatar-placeholder');
    if (existingAvatar) existingAvatar.remove();
    
    const avatarEl = document.createElement('img');
    avatarEl.src = '/img/default.png';  // Fix: Không dùng r.avatar (lỗi typo cũ)
    avatarEl.style = "width:40px;height:40px;border-radius:50%;object-fit:cover;";

    headerProfile.insertBefore(avatarEl, headerProfile.firstChild);
  }
}
// Chặn toàn bộ <a href="#"> không cho reload hash
document.addEventListener("click", (e) => {
    const a = e.target.closest("a[href='#']");
    if (a) {
        e.preventDefault();
        return false;
    }
});
document.getElementById("friend-requests").addEventListener("click", async (e) => {
  if (!e.target.classList.contains("reject-btn")) return;

  const requesterId = e.target.dataset.requesterId;
  const res = await rejectFriendRequest(window.currentSenderId, requesterId);

  if (res.ok) {
    await loadFriendRequests();
    await loadFriends();
  } else {
    alert(res.error || "Lỗi khi từ chối!");
  }
});

document.getElementById("chat-menu").addEventListener("click", async (e) => {
  if (!e.target.classList.contains("unfriend-btn")) return;

  const res = await unfriend(window.currentSenderId, window.currentReceiverId);

  if (res.ok) {
    await loadFriends();
    await loadFriendRequests();
  }
});


// ============================
// MỞ MENU 3 CHẤM TRONG CHAT BOX
// ============================
document.addEventListener("click", (e) => {
  const menu = document.getElementById("chat-menu");
  const icon = document.querySelector(".fa-ellipsis-v");

  // Click vào dấu 3 chấm → mở / đóng menu
  if (icon && icon.contains(e.target)) {
    menu.style.display = menu.style.display === "block" ? "none" : "block";
    return;
  }

  // Click ra ngoài → đóng menu
  if (menu && !menu.contains(e.target)) {
    menu.style.display = "none";
  }
});

// ============================
// XỬ LÝ HỦY BẠN BÈ
// ============================
document.getElementById("unfriend-btn").addEventListener("click", async () => {

  if (!window.currentReceiverId) {
    alert("Không có người để hủy bạn bè.");
    return;
  }

  if (!confirm("Bạn có chắc muốn hủy bạn bè?")) return;

  const res = await fetch('/api/friends/unfriend', {
    method: 'POST',
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      user_id: window.currentSenderId,
      friend_id: window.currentReceiverId
    })
  });

  const data = await res.json();

  if (res.ok) {
    alert("Đã hủy bạn bè!");
    document.getElementById("chat-menu").style.display = "none";

    // cập nhật lại danh sách bạn bè
    await loadFriends();
  } else {
    alert(data.error || "Lỗi khi hủy bạn bè");
  }
});

// ----------------------------
// Socket.io
// ----------------------------
let socket;
function initSocket(userId) {
  // Kết nối socket.io với server (tự động detect server URL)
  const serverUrl = window.location.origin;
  socket = io(serverUrl, {
    transports: ['websocket', 'polling'], // Hỗ trợ cả websocket và polling
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionAttempts: 5
  });

  socket.on('connect', () => {
    console.log('✅ Socket connected:', socket.id);
    // Đăng ký socket với userId
    socket.emit('registerSocket', { userId });
    // Join room để nhận tin nhắn
    socket.emit("join", userId);
  });

  socket.on('disconnect', () => {
    console.log('❌ Socket disconnected');
  });

  socket.on('reconnect', (attemptNumber) => {
    console.log('🔄 Socket reconnected after', attemptNumber, 'attempts');
    // Đăng ký lại sau khi reconnect
    socket.emit('registerSocket', { userId });
    socket.emit("join", userId);
  });

  socket.on('reconnect_error', (error) => {
    console.error('⚠️ Socket reconnection error:', error);
  });

  socket.on('reconnect_failed', () => {
    console.error('❌ Socket reconnection failed');
    alert('Không thể kết nối lại với server. Vui lòng tải lại trang.');
  });

  socket.on('receiveMessage', (data) => {
    console.log('📥 Received message:', data);

    // Populate window.messageSenders
    if (data.sender_id) {
      window.messageSenders[data.sender_id] = window.messageSenders[data.sender_id] || {};
      window.messageSenders[data.sender_id].name = data.sender_name || window.messageSenders[data.sender_id].name || window.currentReceiverName || 'User';
      window.messageSenders[data.sender_id].avatar = data.avatar || window.messageSenders[data.sender_id].avatar;
    }

    // Fix avatar fallback (thêm fallback từ messageSenders và friendList)
    const avatar = data.avatar || 
                  window.messageSenders[data.sender_id]?.avatar || 
                  window.friendList[data.sender_id]?.avatar || 
                  window.currentReceiverAvatar || 
                  '/img/default.png';

    // Lưu tên người gửi
    if (data.sender_name) {
        window.messageSenders = window.messageSenders || {};
        window.messageSenders[data.sender_id] = data.sender_name;
    } else if (String(window.currentReceiverId) === String(data.sender_id)) {
        window.messageSenders = window.messageSenders || {};
        window.messageSenders[data.sender_id] = window.currentReceiverName;
    }

    // Nếu đang mở đúng cuộc chat thì append
    if (String(window.currentReceiverId) === String(data.sender_id)) {
        appendMessage(data.sender_id, data.message, avatar, data.created_at, data.id);
    } else {
        console.log('Tin nhắn mới từ', data.sender_id);
    }
  });

  socket.on('messageSent', (data) => {
    console.log('Message sent/confirmed', data);

    const avatar = window.messageSenders[data.sender_id]?.avatar || window.currentUserAvatar || '/img/default.png';

    if (String(window.currentReceiverId) === String(data.receiver_id)) {
        appendMessage(data.sender_id, data.message, avatar, data.created_at, data.id);
    }
  });

  // Real-time notifications cho friend requests
  socket.on('newFriendRequest', async (data) => {
    console.log('📬 New friend request received:', data);
    // Tự động refresh friend requests
    await loadFriendRequests();
    // Hiển thị thông báo
    const shouldView = confirm(`${data.message}\n\nBạn có muốn xem yêu cầu kết bạn không?`);
    if (shouldView) {
      // Chuyển sang tab Requests
      const requestsTab = document.getElementById('Requests-tab');
      if (requestsTab) {
        requestsTab.click();
      }
    }
  });

  socket.on('friendRequestAccepted', async (data) => {
    console.log(' Friend request accepted:', data);
    alert(data.message);
    // Refresh friend list
    await loadFriends();
  });

  socket.on('friendListUpdated', async (data) => {
    console.log(' Friend list updated:', data);
    // Tự động refresh friend list và requests
    await loadFriends();
    await loadFriendRequests();
  });
// Khi người nhận từ chối lời mời
socket.on("friendRequestRejected", async (data) => {
  console.log(" Lời mời đã bị từ chối:", data);

  // Là người gửi → refresh danh sách đang chờ + search
  await loadFriendRequests();
  await refreshSearchUI();
  
  const searchInput = document.querySelector(".msg-search input");
  if (searchInput) {
    const keyword = searchInput.value.trim();
    await searchAndShowUsers(keyword);
  }
});

// Khi người gửi hủy lời mời
socket.on("friendRequestCanceled", async (data) => {
  console.log(" Lời mời đã bị hủy:", data);

  await loadFriendRequests();
  await refreshSearchUI();

  const searchInput = document.querySelector(".msg-search input");
  if (searchInput) {
    const keyword = searchInput.value.trim();
    await searchAndShowUsers(keyword);
  }
});

// Khi hủy kết bạn
socket.on("unfriended", async (data) => {
  console.log("Đã bị hủy kết bạn:", data);

  await loadFriends();
  await loadFriendRequests();
  await refreshSearchUI();
});

  socket.on('error', (data) => {
    console.error('Socket error:', data);
    if (data.message) {
      alert('Lỗi: ' + data.message);
    }
  });
}

// ----------------------------
// Gửi tin nhắn
// ----------------------------
async function sendMessageApiAndSocket(sender_id, receiver_id, message) {
  try {
    // Ưu tiên dùng Socket để gửi (real-time)
    // Socket sẽ xử lý lưu DB và emit lại
    if (socket && socket.connected && socket.emit) {
      socket.emit('sendMessage', { sender_id, receiver_id, message, avatar: window.currentUserAvatar });
      // Không append ở đây, sẽ nhận qua messageSent event để tránh duplicate
    } else {
      // Fallback: nếu socket chưa sẵn sàng, dùng API
      console.warn('Socket not connected, using API fallback');
      const res = await fetch('/api/messages/send', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ sender_id, receiver_id, message })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        console.error('Send message failed', data);
        alert(data.message || 'Không thể gửi tin nhắn. Có thể bạn chưa là bạn bè với người này.');
        return;
      }
      // Append message với messageId từ API response để tránh duplicate
      if (data.id) {
        appendMessage(sender_id, message, window.currentUserAvatar, data.created_at, data.id);
      } else {
        // Nếu không có id, append với timestamp
        appendMessage(sender_id, message, window.currentUserAvatar, new Date().toISOString());
      }
    }
  } catch (error) {
    console.error('Error sending message:', error);
    alert('Lỗi khi gửi tin nhắn!');
  }
}

// Set để track các message đã hiển thị (tránh duplicate)
const displayedMessages = new Set();

// Hàm normalize tin nhắn: loại bỏ tất cả ký tự xuống dòng và khoảng trắng thừa
function normalizeMessage(message) {
  if (!message) return '';
  const original = String(message);
  const normalized = original
    .replace(/\r\n/g, ' ') // Thay thế Windows newline (CRLF)
    .replace(/\n/g, ' ') // Thay thế Unix newline (LF)
    .replace(/\r/g, ' ') // Thay thế Mac newline (CR)
    .replace(/[\u2028\u2029]/g, ' ') // Thay thế Unicode line/paragraph separator
    .replace(/\s+/g, ' ') // Thay thế nhiều khoảng trắng bằng 1 khoảng trắng
    .replace(/[\u200B-\u200D\uFEFF]/g, '') // Loại bỏ zero-width characters
    .trim();
  
  // Debug: Log nếu có thay đổi
  if (original !== normalized) {
    console.log('📝 Message normalized:', {
      original: original,
      normalized: normalized,
      originalLength: original.length,
      normalizedLength: normalized.length,
      changed: original !== normalized
    });
  }
  
  return normalized;
}

// Helper: Xử lý avatar src thống nhất (base64 prefix + fallback)
function getProcessedAvatar(avatar, senderId, isMine) {
  if (!avatar) {
    // Fallback multi-layer
    if (isMine) {
      return window.currentUserAvatar || '/img/default.png';
    } else {
      return window.messageSenders[senderId]?.avatar || 
             window.friendList[senderId]?.avatar || 
             window.currentReceiverAvatar || 
             '/img/default.png';
    }
  }
  
  // Xử lý base64 thiếu prefix
  let src = String(avatar);
  if (src.length > 50 && !src.startsWith('data:image')) {
    src = 'data:image/png;base64,' + src;
  }
  
  return src || '/img/default.png';
}

function appendMessage(senderId, message, avatar, timestamp = null, messageId = null) {
  const container = document.getElementById('message-list');
  if (!container) {
    console.error('Message container not found');
    return;
  }
  
  // Debug: Kiểm tra tin nhắn trước khi normalize
  const originalMessage = String(message || '');
  const hasNewlinesBefore = /[\r\n\u2028\u2029]/.test(originalMessage);
  
  // Normalize tin nhắn: loại bỏ ký tự xuống dòng không mong muốn (quan trọng cho tin nhắn cũ từ DB)
  let normalizedMessage = normalizeMessage(message);
  
  // Debug: Kiểm tra sau khi normalize
  const hasNewlinesAfter = /[\r\n\u2028\u2029]/.test(normalizedMessage);
  
  const isMine = String(senderId) === String(window.currentSenderId);  // Di chuyển lên để dùng cho helper
  
  // Debug log cho avatar (optional - comment nếu không cần)
  console.log('🔍 appendMessage avatar flow:', {
    paramAvatar: avatar,
    processed: getProcessedAvatar(avatar, senderId, isMine),
    senderId,
    isMine,
    messageSendersAvatar: window.messageSenders[senderId]?.avatar,
    friendListAvatar: window.friendList[senderId]?.avatar,
    currentReceiver: window.currentReceiverAvatar
  });
  
  // Log chi tiết để debug
  console.log('🔍 appendMessage debug:', {
    senderId,
    messageId,
    original: originalMessage,
    originalLength: originalMessage.length,
    normalized: normalizedMessage,
    normalizedLength: normalizedMessage.length,
    hadNewlinesBefore: hasNewlinesBefore,
    hasNewlinesAfter: hasNewlinesAfter,
    isMine: isMine
  });
  
  if (hasNewlinesBefore || hasNewlinesAfter) {
    console.warn('⚠️ Message normalization issue:', {
      original: originalMessage,
      normalized: normalizedMessage,
      hadNewlinesBefore: hasNewlinesBefore,
      hasNewlinesAfter: hasNewlinesAfter
    });
  }
  
  if (!normalizedMessage) {
    console.warn('Empty message after normalization, skipping');
    return;
  }
  
  // Tạo unique key để check duplicate (sử dụng normalizedMessage)
  const msgKey = messageId 
    ? `msg-${messageId}` 
    : `msg-${senderId}-${normalizedMessage}-${timestamp || Date.now()}`;
  
  // Kiểm tra xem message đã được hiển thị chưa
  if (displayedMessages.has(msgKey)) {
    console.log('Message already displayed, skipping:', msgKey);
    return;
  }
  
  displayedMessages.add(msgKey);
  
  // Giới hạn size của Set để tránh memory leak (giữ tối đa 1000 messages)
  if (displayedMessages.size > 1000) {
    const firstKey = displayedMessages.values().next().value;
    displayedMessages.delete(firstKey);
  }
  
  const time = timestamp ? new Date(timestamp).toLocaleTimeString() : new Date().toLocaleTimeString();
  
  const li = document.createElement('li');
  li.className = isMine ? 'repaly' : 'sender';
  li.dataset.messageId = messageId || msgKey; // Lưu messageId vào DOM để có thể check sau
  
  // Lấy tên người gửi để tạo avatar (cần lưu thông tin này khi load messages)
  const senderName = window.messageSenders && window.messageSenders[senderId] 
    ? window.messageSenders[senderId].name 
    : (isMine ? (window.currentUserName || 'User') : 'User');
  
  if (!isMine) {
    // Tin nhắn từ người khác: avatar bên trái, message bên phải
    const processedAvatar = getProcessedAvatar(avatar, senderId, isMine);

    const avatarEl = document.createElement('img');
    avatarEl.src = processedAvatar;
    avatarEl.className = "chat-avatar";
    avatarEl.style.width = "40px";
    avatarEl.style.height = "40px";
    avatarEl.style.borderRadius = "50%";
    avatarEl.style.objectFit = "cover";
    avatarEl.style.marginRight = "10px";

    // Thêm onerror fallback
    avatarEl.onerror = () => { avatarEl.src = '/img/default.png'; };

    const msgDiv = document.createElement('div');
    
    // Tạo phần tử p cho tin nhắn
    const msgP = document.createElement('p');
    // Set từng style riêng để đảm bảo override CSS
    msgP.style.margin = '0';
    msgP.style.background = '#e5e5e5';
    msgP.style.color = '#222';
    msgP.style.padding = '12px 16px';
    msgP.style.borderRadius = '18px';
    msgP.style.fontSize = '14px';
    // Áp dụng cùng style cho tất cả tin nhắn - wrap tự nhiên nhưng không break từ
    msgP.style.width = 'fit-content';
    msgP.style.maxWidth = '70%'; // Giới hạn width để không quá rộng
    msgP.style.minWidth = 'fit-content';
    msgP.style.setProperty('white-space', 'normal', 'important'); // Wrap tự nhiên
    msgP.style.setProperty('overflow-wrap', 'break-word', 'important'); // Wrap khi từ quá dài
    msgP.style.setProperty('word-break', 'normal', 'important'); // KHÔNG break từ ở giữa - chỉ wrap ở khoảng trắng
    msgP.style.setProperty('word-wrap', 'break-word', 'important'); // Wrap khi cần
    msgP.style.setProperty('hyphens', 'none', 'important'); // Không dùng hyphen
    msgP.style.display = 'inline-block'; // Cho phép fit-content
    msgP.style.lineHeight = '1.4';
    // Đảm bảo tin nhắn được set đúng - dùng textContent
    msgP.textContent = normalizedMessage;
    console.log('✅ Set textContent for receiver message:', {
      normalized: normalizedMessage,
      actualTextContent: msgP.textContent,
      hasNewlines: /[\r\n\u2028\u2029]/.test(msgP.textContent)
    });
    
    // Tạo phần tử span cho thời gian
    const timeSpan = document.createElement('span');
    timeSpan.className = 'time';
    timeSpan.style.cssText = 'margin-left: 12px; margin-top: 4px; font-size: 11px; color: #999;';
    timeSpan.textContent = time;
    
    msgDiv.appendChild(msgP);
    msgDiv.appendChild(timeSpan);
    
    li.appendChild(avatarEl);
    li.appendChild(msgDiv);
  } else {
    // Tin nhắn của mình: message bên trái, avatar bên phải
    const processedAvatar = getProcessedAvatar(avatar, senderId, isMine);

    const msgDiv = document.createElement('div');
    msgDiv.style.cssText = 'display: flex; flex-direction: column; align-items: flex-end; flex: 1;';
    
    const msgP = document.createElement('p');
    msgP.style.margin = '0';
    msgP.style.background = '#3867d6';
    msgP.style.color = '#fff';
    msgP.style.padding = '12px 16px';
    msgP.style.borderRadius = '18px';
    msgP.style.fontSize = '14px';
    msgP.style.width = 'fit-content';
    msgP.style.maxWidth = '70%';
    msgP.style.minWidth = 'fit-content';
    msgP.style.setProperty('white-space', 'normal', 'important');
    msgP.style.setProperty('overflow-wrap', 'break-word', 'important');
    msgP.style.setProperty('word-break', 'normal', 'important');
    msgP.style.display = 'inline-block';
    msgP.style.lineHeight = '1.4';
    msgP.textContent = normalizedMessage;

    const timeSpan = document.createElement('span');
    timeSpan.className = 'time';
    timeSpan.style.cssText = 'margin-right: 12px; margin-top: 4px; font-size: 11px; color: #999; text-align: right;';
    timeSpan.textContent = time;

    msgDiv.appendChild(msgP);
    msgDiv.appendChild(timeSpan);

    // ❗❗ FIX AVATAR HERE ❗❗
    const avatarEl = document.createElement('img');
    avatarEl.src = processedAvatar;
    avatarEl.className = "chat-avatar";
    avatarEl.style.width = "40px";
    avatarEl.style.height = "40px";
    avatarEl.style.borderRadius = "50%";
    avatarEl.style.objectFit = "cover";
    avatarEl.style.marginLeft = "10px";
    avatarEl.style.flexShrink = "0";

    // Thêm onerror
    avatarEl.onerror = () => { avatarEl.src = '/img/default.png'; };

    li.appendChild(msgDiv);
    li.appendChild(avatarEl);
  }

  
  container.appendChild(li);
  
  // Scroll to bottom after message is added (smooth scroll)
  requestAnimationFrame(() => {
    container.scrollTo({
      top: container.scrollHeight,
      behavior: 'smooth'
    });
  });
}

function escapeHtml(str) {
  if (!str) return '';
  // Normalize trước khi escape (backup normalize)
  let cleaned = normalizeMessage(str);
  // Escape HTML
  return cleaned
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Hàm lấy chữ cái đầu từ tên
function getInitials(name) {
  if (!name || !name.trim()) return 'U';
  const trimmed = name.trim();
  // Lấy chữ cái đầu tiên (có thể là chữ cái đầu của từ đầu tiên)
  const firstChar = trimmed.charAt(0).toUpperCase();
  // Nếu là chữ cái thì trả về, nếu không thì trả về 'U'
  return /[A-Za-zÀ-ỹ]/.test(firstChar) ? firstChar : 'U';
}

// Hàm tạo avatar element với chữ cái đầu
function createAvatarElement(name = 'User', size = 40, className = 'rounded-circles') {
  const initials = getInitials(name);
  const div = document.createElement('div');
  div.className = className;
  div.style.cssText = `
    width: ${size}px;
    height: ${size}px;
    border-radius: 50%;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    display: flex;
    align-items: center;
    justify-content: center;
    color: #fff;
    font-weight: 600;
    font-size: ${Math.floor(size * 0.4)}px;
    flex-shrink: 0;
    text-transform: uppercase;
    user-select: none;
  `;
  div.textContent = initials;
  div.setAttribute('aria-label', name);
  return div;
}

// ----------------------------
// Open chat
// ----------------------------
window.currentReceiverId = null;
window.currentReceiverName = null;
function openChatWith(receiverId, name, avatar) {

  let avatarSrc = avatar;

  // Nếu không có avatar → dùng default
  if (!avatarSrc || avatarSrc === "null" || avatarSrc === "undefined") {
    avatarSrc = '/img/default.png';
  }

  // Nếu avatar là base64 nhưng thiếu tiền tố
  if (avatarSrc.length > 50 && !avatarSrc.startsWith("data:image")) {
    avatarSrc = "data:image/png;base64," + avatarSrc;
  }

  window.currentReceiverId = receiverId;
  window.currentReceiverName = name;
  window.currentReceiverAvatar = avatarSrc;

  const chatTitle = document.querySelector('.chat-username');
  if (chatTitle) chatTitle.textContent = name;

  const chatHeader = document.querySelector('.msg-head .d-flex');
  if (chatHeader) {
    const oldAvatar = chatHeader.querySelector('.chat-avatar');
    if (oldAvatar) oldAvatar.remove();

    const img = document.createElement('img');
    img.src = avatarSrc;
    img.className = "chat-avatar";
    img.style = "width:40px;height:40px;border-radius:50%;object-fit:cover;margin-right:10px;";

    img.onerror = () => (img.src = '/img/default.png');

    const flexGrow = chatHeader.querySelector('.flex-grow-1');
    if (flexGrow) chatHeader.insertBefore(img, flexGrow);
    else chatHeader.insertBefore(img, chatHeader.firstChild);
  }

  // Clear messageSenders cho senderId này nếu cần refresh (optional)
  if (window.currentReceiverId) {
    delete window.messageSenders[window.currentReceiverId];  // Force repopulate từ loadMessages
  }

  loadMessages(window.currentSenderId, window.currentReceiverId);
}

// ----------------------------
// Load danh sách bạn bè
// ----------------------------
async function loadFriends() {
  try {
    const res = await fetch(`/api/friends/list/${window.currentSenderId}`);
    const friends = await res.json().catch(() => ([]));
    const listEl = document.getElementById('chat-list-open');
    if (!listEl) return;

    // Xóa hoàn toàn nội dung cũ
    listEl.innerHTML = '';

    if (!friends || friends.length === 0) {
      listEl.innerHTML = '<p style="color: #999; text-align: center; padding: 20px;">Chưa có bạn bè</p>';
      return;
    }

    const fragment = document.createDocumentFragment();

    friends.forEach(f => {
      const a = document.createElement('a');
      a.href = '#';
      a.className = 'd-flex align-items-center friend-item';
      a.dataset.friendId = f.id;
      a.dataset.friendName = f.fullname || f.username;
      // <<< QUAN TRỌNG: gán friendAvatar tại chỗ, tránh bị undefined sau này
      a.dataset.friendAvatar = f.avatar || '';

      a.style.textDecoration = 'none';
      a.style.padding = '10px 12px';
      a.style.marginBottom = '8px';
      a.style.borderRadius = '8px';
      a.style.transition = 'all 0.3s ease';

      const avatarEl = document.createElement('img');
      // Nếu avatar là base64 thiếu prefix, thêm prefix (nếu bạn muốn)
      let avatarSrc = f.avatar || '';
      if (avatarSrc && /^(?:[A-Za-z0-9+/=\\s]+)$/.test(avatarSrc) && avatarSrc.length > 100 && !/^data:image/.test(avatarSrc)) {
        avatarSrc = 'data:image/png;base64,' + avatarSrc;
      }
      avatarEl.src = avatarSrc || '/img/default.png';
      avatarEl.style.width = "40px";
      avatarEl.style.height = "40px";
      avatarEl.style.borderRadius = "50%";
      avatarEl.style.objectFit = "cover";
      avatarEl.className = "me-2";
      // fallback nếu ảnh broken
      avatarEl.onerror = () => { avatarEl.src = '/img/default.png'; };

      const div = document.createElement('div');
      div.style.cssText = 'flex: 1; min-width: 0;';
      div.innerHTML = `
        <h6 style="margin: 0; color: #222; font-weight: 600; font-size: 14px;">${escapeHtml(f.fullname || f.username)}</h6>
        <p style="margin: 0; color: #999; font-size: 12px;">${escapeHtml(f.username || '')}</p>
      `;

      a.appendChild(avatarEl);
      a.appendChild(div);
      fragment.appendChild(a);
    });

    listEl.appendChild(fragment);

    // debug nhanh: in ra 3 friend đầu để kiểm tra dataset
    try {
      const firstThree = Array.from(listEl.querySelectorAll('.friend-item')).slice(0,3);
      console.log('loadFriends: first items friendAvatar datasets:', firstThree.map(el => el.dataset.friendAvatar));
    } catch (e) { /* ignore */ }

    // Populate window.friendList từ friends
    window.friendList = friends.reduce((acc, f) => {
      acc[f.id] = { 
        name: f.fullname || f.username, 
        avatar: f.avatar || '/img/default.png' 
      };
      return acc;
    }, {});

    // Populate window.messageSenders (nếu chưa có)
    friends.forEach(f => {
      if (!window.messageSenders[f.id]) {
        window.messageSenders[f.id] = { 
          name: f.fullname || f.username, 
          avatar: f.avatar || '/img/default.png' 
        };
      }
    });

  } catch (err) {
    console.error('loadFriends error', err);
  }
}
// Event delegation cho danh sách bạn bè (gắn 1 lần duy nhất)
let friendListenerAttached = false;
function attachFriendClickListener() {
  if (friendListenerAttached) return; // Tránh gắn nhiều lần
  
  const listEl = document.getElementById('chat-list-open');
  if (!listEl) return;
  
  listEl.addEventListener('click', (e) => {
  e.preventDefault();

  const friendLink = e.target.closest('.friend-item');
  if (!friendLink) return;

  const friendId = friendLink.dataset.friendId;
  const friendName = friendLink.dataset.friendName;
  const friendAvatar = friendLink.dataset.friendAvatar;   // <==== LẤY ĐÚNG ẢNH

  openChatWith(friendId, friendName, friendAvatar);
});
  
  friendListenerAttached = true;
}

// ----------------------------
// Load friend requests
// ----------------------------
async function loadFriendRequests() {
  const res = await fetch(`/api/friends/requests/${window.currentSenderId}`);
  const requests = await res.json().catch(() => ([]));
  const reqEl = document.getElementById('friend-requests');
  if (!reqEl) return;
  
  // Xóa hoàn toàn nội dung cũ
  reqEl.innerHTML = '';
  
  if (requests.length === 0) {
    reqEl.innerHTML = '<p style="color: #999; text-align: center; padding: 15px;">Không có yêu cầu kết bạn</p>';
    return;
  }

  const fragment = document.createDocumentFragment();

  requests.forEach(r => {
    const div = document.createElement('div');
    div.classList.add('friend-request-item');
    div.dataset.requesterId = r.requester_id;
    div.style.cssText = 'display: flex; align-items: center; justify-content: space-between; padding: 12px; background: #f5f5f5; border-radius: 8px; margin-bottom: 10px; transition: all 0.3s ease;';
    
    const leftDiv = document.createElement('div');
    leftDiv.style.cssText = 'display: flex; align-items: center; gap: 10px; flex: 1;';
    
    // Tạo avatar với chữ cái đầu
    const avatarEl = document.createElement('img');
    avatarEl.src = r.avatar || '/img/default.png';
    avatarEl.style.width = "36px";
    avatarEl.style.height = "36px";
    avatarEl.style.borderRadius = "50%";
    avatarEl.style.objectFit = "cover";

    leftDiv.appendChild(avatarEl);
    
    const infoDiv = document.createElement('div');
    infoDiv.style.cssText = 'min-width: 0;';
    infoDiv.innerHTML = `
      <p style="margin: 0; font-weight: 500; color: #222; font-size: 14px;">${escapeHtml(r.fullname || r.username)}</p>
      <p style="margin: 0; color: #999; font-size: 12px;">${escapeHtml(r.username)}</p>
    `;
    leftDiv.appendChild(infoDiv);
    
    const acceptBtn = document.createElement('button');
    acceptBtn.className = 'accept-btn';
    acceptBtn.dataset.requesterId = r.requester_id;
    acceptBtn.textContent = 'Chấp nhận';
    
    const rejectBtn = document.createElement('button');
    rejectBtn.className = 'reject-btn';
    rejectBtn.dataset.requesterId = r.requester_id;
    rejectBtn.textContent = 'Từ chối';
    rejectBtn.style.marginLeft = '10px';

    div.appendChild(leftDiv);
    div.appendChild(acceptBtn);
    div.appendChild(rejectBtn);
    fragment.appendChild(div);
  });

  reqEl.appendChild(fragment);
}

// Event delegation cho chấp nhận yêu cầu (gắn 1 lần duy nhất)
let acceptListenerAttached = false;
function attachAcceptRequestListener() {
  if (acceptListenerAttached) return;
  
  const reqEl = document.getElementById('friend-requests');
  if (!reqEl) return;
  
  reqEl.addEventListener('click', async (e) => {
    if (!e.target.classList.contains('accept-btn')) return;
    
    const requesterId = e.target.dataset.requesterId;
    const btn = e.target;
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Đang xử lý...';
    
    try {
      const result = await acceptFriendRequest(window.currentSenderId, requesterId);
      if (result && (result.ok || result.message)) {
        alert(result.message || 'Đã chấp nhận kết bạn!');
        await loadFriendRequests();
      } else {
        alert(result?.error || result?.message || 'Lỗi khi chấp nhận kết bạn!');
      }
    } catch (error) {
      console.error('Error accepting friend request:', error);
      alert('Lỗi khi chấp nhận kết bạn!');
    } finally {
      btn.disabled = false;
      btn.textContent = originalText;
    }
  });
  
  acceptListenerAttached = true;
}

// ----------------------------
// Load messages
// ----------------------------
async function loadMessages(senderId, receiverId) {
  const res = await fetch(`/api/messages/history/${senderId}/${receiverId}`);
  const msgs = await res.json().catch(() => ([]));
  const container = document.getElementById('message-list');
  if (!container) {
    console.error('Message container not found');
    return;
  }
  
  // Xóa hoàn toàn nội dung cũ và clear displayedMessages khi load chat mới
  container.innerHTML = '';
  displayedMessages.clear();
  
  // Lưu thông tin tên người gửi để tạo avatar đúng
  window.messageSenders = window.messageSenders || {};
  msgs.forEach(m => {
    // Populate window.messageSenders với avatar từ m (ưu tiên m.avatar nếu có)
    if (m.sender_id) {
      const senderInfo = window.messageSenders[m.sender_id] || {};
      window.messageSenders[m.sender_id] = {
        name: m.sender_fullname || m.sender_username || senderInfo.name || 'User',
        avatar: m.avatar || senderInfo.avatar || (String(m.sender_id) === String(window.currentSenderId) ? window.currentUserAvatar : window.currentReceiverAvatar) || '/img/default.png'
      };
    }
  });
  
  if (msgs.length === 0) {
    container.innerHTML = '<li style="text-align: center; color: #999; padding: 40px 20px;">Chưa có tin nhắn. Hãy gửi tin nhắn đầu tiên!</li>';
    return;
  }
  
  // Sử dụng appendMessage để đảm bảo consistency và tránh duplicate
  msgs.forEach(m => {
    appendMessage(m.sender_id, m.message, m.avatar, m.created_at, m.id);
  });
  
  // Scroll to bottom after all messages are loaded (instant scroll for initial load)
  requestAnimationFrame(() => {
    container.scrollTop = container.scrollHeight;
  });
}

// ----------------------------
// Tìm người dùng và gửi lời mời
// ----------------------------
async function searchAndShowUsers(keyword) {
  const listEl = document.getElementById('search-results');
  const chatLists = document.getElementById('chat-lists-container');
  
  if (!keyword || keyword.length < 1) {
    if (listEl) {
      listEl.innerHTML = '';
      listEl.style.display = 'none';
    }
    if (chatLists) chatLists.style.display = 'block';
    return;
  }

  // Hiển thị search results, ẩn chat lists
  if (listEl) listEl.style.display = 'block';
  if (chatLists) chatLists.style.display = 'none';

  const res = await fetch(`/api/friends/search?q=${encodeURIComponent(keyword)}&exclude=${window.currentSenderId}`);
  const users = await res.json().catch(() => ([]));
  
  if (!listEl) return;
  
  listEl.innerHTML = '';

  if (users.length === 0) {
    listEl.innerHTML = '<p style="color: #999; text-align: center; padding: 15px;">Không tìm thấy người dùng</p>';
    return;
  }

 const fragment = document.createDocumentFragment();
  users.forEach(u => {
    const div = document.createElement('div');
    div.classList.add('search-user-item');
    div.dataset.userId = u.id;

    // CLICK ITEM
   div.addEventListener("click", (ev) => {
  // Nếu click vào NÚT → không mở chat, không block sự kiện của nút
  if (ev.target.closest("button")) return;

  // Người lạ → không làm gì cả
  if (u.relationship !== "friend") {
      ev.stopPropagation();
      ev.preventDefault();
      return;
  }

  // Là bạn bè → mở chat
  openChatWith(u.id, u.fullname || u.username);
});

    div.style.cssText = 'display: flex; align-items: center; justify-content: space-between; padding: 12px; background: #f5f5f5; border-radius: 8px; margin-bottom: 10px; transition: all 0.3s ease;';

    const leftDiv = document.createElement('div');
    leftDiv.style.cssText = 'display: flex; align-items: center; gap: 10px; flex: 1;';

const avatarEl = document.createElement('img');
avatarEl.src = u.avatar || '/img/default.png';
avatarEl.style.width = "36px";
avatarEl.style.height = "36px";
avatarEl.style.borderRadius = "50%";
avatarEl.style.objectFit = "cover";
    leftDiv.appendChild(avatarEl);

    const infoDiv = document.createElement('div');
    infoDiv.style.cssText = 'min-width: 0;';
    infoDiv.innerHTML = `
      <p style="margin: 0; font-weight: 500; color: #222; font-size: 14px;">${escapeHtml(u.fullname || u.username)}</p>
      <p style="margin: 0; color: #999; font-size: 12px;">${escapeHtml(u.username)}</p>
    `;
    leftDiv.appendChild(infoDiv);

    let btn = document.createElement("button");
    btn.dataset.id = u.id;

    if (u.relationship === "pending_sent") {
        btn.className = "cancel-request-btn";
        btn.textContent = "Hủy yêu cầu";
    }
    else if (u.relationship === "pending_received") {
        btn.className = "accept-btn";
        btn.textContent = "Chấp nhận";
    }
    else if (u.relationship === "friend") {
        btn.className = "friend-btn";
        btn.textContent = "Bạn bè";
    }
    else {
        btn.className = "add-friend-btn";
        btn.textContent = "Kết bạn";
    }

    div.appendChild(leftDiv);
    div.appendChild(btn);
    fragment.appendChild(div);
  });

  listEl.appendChild(fragment);

    }

// Event delegation cho thêm bạn (gắn 1 lần duy nhất)
let addFriendListenerAttached = false;

function attachAddFriendListener() {
  if (addFriendListenerAttached) return;

  const searchEl = document.getElementById("search-results");
  if (!searchEl) return;

  searchEl.addEventListener("click", async (e) => {

    // Nếu click vào BUTTON → chặn nổi bọt để không trigger click vào item
    if (e.target.tagName.toUpperCase() === "BUTTON") {
      e.stopPropagation();
      e.preventDefault();
    }

    // =============================
    // 1) NÚT KẾT BẠN
    // =============================
    if (e.target.classList.contains("add-friend-btn")) {
      const receiverId = e.target.dataset.id;
      const btn = e.target;
      const originalText = btn.textContent;

      btn.disabled = true;
      btn.textContent = "Đang gửi...";

      try {
        const result = await sendFriendRequest(window.currentSenderId, receiverId);

        if (result?.message) {
          alert(result.message);
        } else {
          alert("Đã gửi lời mời kết bạn!");
        }

        // Cập nhật UI
        await refreshSearchUI();

      } catch (err) {
        console.error("Error sending friend request:", err);
        alert("Lỗi khi gửi lời mời kết bạn!");
        btn.disabled = false;
        btn.textContent = originalText;
      }

      return;
    }

    // =============================
    // 2) NÚT HỦY YÊU CẦU (pending_sent)
    // =============================
    if (e.target.classList.contains("cancel-request-btn")) {
      const friendId = e.target.dataset.id;

      const res = await cancelFriendRequest(window.currentSenderId, friendId);

      if (!res.ok) {
        alert(res.error || "Lỗi khi hủy yêu cầu!");
      }

      // Cập nhật UI ngay
      await refreshSearchUI();
      return;
    }

  });

  addFriendListenerAttached = true;
}


// ----------------------------
// API helpers
// ----------------------------
async function sendFriendRequest(sender_id, receiver_id) {
  try {
    const res = await fetch('/api/friends/request', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ sender_id, receiver_id })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { error: data.message || data.error || 'Lỗi khi gửi lời mời' };
    }
    return data;
  } catch (error) {
    console.error('Error in sendFriendRequest:', error);
    return { error: 'Lỗi kết nối' };
  }
}

async function acceptFriendRequest(user_id, friend_id) {
  try {
    const res = await fetch('/api/friends/accept', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ user_id, friend_id })
    });
    const body = await res.json().catch(() => ({}));
    return { ok: res.ok, ...body };
  } catch (error) {
    console.error('Error in acceptFriendRequest:', error);
    return { ok: false, error: 'Lỗi kết nối' };
  }
}
// ----------------------------
// API: Reject friend request
// ----------------------------
async function rejectFriendRequest(user_id, friend_id) {
  try {
    const res = await fetch("/api/friends/reject", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id, friend_id })
    });

    const data = await res.json();
    return { ok: res.ok, ...data };
  } catch {
    return { ok: false, error: "Lỗi kết nối" };
  }
}

// ----------------------------
// API: Cancel sent friend request (người gửi hủy)
// ----------------------------
async function cancelFriendRequest(user_id, friend_id) {
  try {
    const res = await fetch("/api/friends/cancel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id, friend_id })
    });

    const data = await res.json();
    return { ok: res.ok, ...data };
  } catch {
    return { ok: false, error: "Lỗi kết nối" };
  }
}

// ----------------------------
// API: Unfriend (hủy kết bạn)
// ----------------------------
async function unfriend(user_id, friend_id) {
  try {
    const res = await fetch("/api/friends/unfriend", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id, friend_id })
    });

    const data = await res.json();
    return { ok: res.ok, ...data };
  } catch {
    return { ok: false, error: "Lỗi kết nối" };
  }
}
 async function refreshSearchUI() {
    const input = document.querySelector(".msg-search input");
    const keyword = input ? input.value.trim() : "";
    await searchAndShowUsers(keyword);
}