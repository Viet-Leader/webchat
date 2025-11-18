// ----------------------------
// Khởi tạo khi trang load xong
// ----------------------------
document.addEventListener('DOMContentLoaded', async () => {
  const userData = localStorage.getItem('user');
  if (!userData) {
    window.location.href = 'login.html';
    return;
  }

  const user = JSON.parse(userData);
  window.currentSenderId = user.id;
  window.currentUserAvatar = user.avatar;
  window.currentUserName = user.fullname || user.username;
  document.querySelector('.username-display').textContent = window.currentUserName;
  
  // Tạo avatar trong header
  const headerProfile = document.querySelector('.user-profile');
  if (headerProfile) {
    const avatarEl = createAvatarElement(window.currentUserName, 40, 'rounded-circle');
    avatarEl.style.marginRight = '12px';
    headerProfile.insertBefore(avatarEl, headerProfile.firstChild);
  }

  // Kết nối socket
  initSocket(user.id);

  // Load danh sách bạn bè và yêu cầu kết bạn
  await loadFriends();
  await loadFriendRequests();

  // Gắn sự kiện gửi tin nhắn
  const chatForm = document.getElementById('chat-form');
  if (chatForm) {
    chatForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const msgInput = document.getElementById('message-input');
      // Loại bỏ các ký tự xuống dòng không mong muốn và normalize tin nhắn
      let message = normalizeMessage(msgInput.value);
      if (message && window.currentReceiverId) {
        await sendMessageApiAndSocket(window.currentSenderId, window.currentReceiverId, message);
        msgInput.value = '';
      }
    });
  }

  // Gắn sự kiện tìm kiếm người dùng
  const searchInput = document.querySelector('.msg-search input');
  if (searchInput) {
    searchInput.addEventListener('keyup', async () => {
      const keyword = searchInput.value.trim();
      await searchAndShowUsers(keyword);
    });
    
    // Khi xóa hết text, ẩn kết quả tìm kiếm
    searchInput.addEventListener('input', () => {
      if (searchInput.value.trim() === '') {
        const searchResults = document.getElementById('search-results');
        const chatLists = document.getElementById('chat-lists-container');
        if (searchResults) searchResults.style.display = 'none';
        if (chatLists) chatLists.style.display = 'block';
      }
    });
  }

  // Gắn event delegation cho danh sách bạn bè (chỉ 1 lần)
  attachFriendClickListener();
  // Gắn event delegation cho yêu cầu kết bạn (chỉ 1 lần)
  attachAcceptRequestListener();
  // Gắn event delegation cho tìm kiếm (chỉ 1 lần)
  attachAddFriendListener();
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
    // Debug: Kiểm tra tin nhắn nhận được
    console.log('📥 Received message:', {
      id: data.id,
      sender_id: data.sender_id,
      receiver_id: data.receiver_id,
      original: data.message,
      hasNewlines: /[\r\n\u2028\u2029]/.test(data.message || ''),
      length: data.message?.length,
      fullData: data
    });
    
    // Lưu thông tin người gửi nếu có
    if (data.sender_name) {
      window.messageSenders = window.messageSenders || {};
      window.messageSenders[data.sender_id] = data.sender_name;
    } else if (window.currentReceiverName && String(window.currentReceiverId) === String(data.sender_id)) {
      // Nếu đang chat với người này, dùng tên hiện tại
      window.messageSenders = window.messageSenders || {};
      window.messageSenders[data.sender_id] = window.currentReceiverName;
    }
    
    // Nếu đang mở chat với người gửi thì append trực tiếp
    if (String(window.currentReceiverId) === String(data.sender_id)) {
      appendMessage(data.sender_id, data.message, data.avatar, data.created_at, data.id);
    } else {
      console.log('New message from user', data.sender_id);
      // TODO: thêm badge/notification
    }
  });

  socket.on('messageSent', (data) => {
    console.log('Message sent/confirmed', data);
    // Chỉ append nếu đang chat với người nhận
    if (String(window.currentReceiverId) === String(data.receiver_id)) {
      appendMessage(data.sender_id, data.message, window.currentUserAvatar, data.created_at, data.id);
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
    console.log('✅ Friend request accepted:', data);
    alert(data.message);
    // Refresh friend list
    await loadFriends();
  });

  socket.on('friendListUpdated', async (data) => {
    console.log('🔄 Friend list updated:', data);
    // Tự động refresh friend list và requests
    await loadFriends();
    await loadFriendRequests();
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

function appendMessage(senderId, message, avatar = null, timestamp = null, messageId = null) {
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
    isMine: String(senderId) === String(window.currentSenderId)
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
  
  const isMine = String(senderId) === String(window.currentSenderId);
  const time = timestamp ? new Date(timestamp).toLocaleTimeString() : new Date().toLocaleTimeString();
  
  const li = document.createElement('li');
  li.className = isMine ? 'repaly' : 'sender';
  li.dataset.messageId = messageId || msgKey; // Lưu messageId vào DOM để có thể check sau
  
  // Lấy tên người gửi để tạo avatar (cần lưu thông tin này khi load messages)
  const senderName = window.messageSenders && window.messageSenders[senderId] 
    ? window.messageSenders[senderId] 
    : (isMine ? (window.currentUserName || 'User') : 'User');
  
  if (!isMine) {
    // Tin nhắn từ người khác: avatar bên trái, message bên phải
    const avatarEl = createAvatarElement(senderName, 32, 'rounded-circle');
    avatarEl.style.flexShrink = '0';
    
    const msgDiv = document.createElement('div');
    msgDiv.style.cssText = 'display: flex; flex-direction: column; align-items: flex-start;';
    
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
    const msgDiv = document.createElement('div');
    msgDiv.style.cssText = 'display: flex; flex-direction: column; align-items: flex-end; flex: 1;';
    
    // Tạo phần tử p cho tin nhắn
    const msgP = document.createElement('p');
    // Set từng style riêng để đảm bảo override CSS
    msgP.style.margin = '0';
    msgP.style.background = '#3867d6';
    msgP.style.color = '#fff';
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
    console.log('✅ Set textContent for sender message:', {
      normalized: normalizedMessage,
      actualTextContent: msgP.textContent,
      hasNewlines: /[\r\n\u2028\u2029]/.test(msgP.textContent)
    });
    
    // Tạo phần tử span cho thời gian
    const timeSpan = document.createElement('span');
    timeSpan.className = 'time';
    timeSpan.style.cssText = 'margin-right: 12px; margin-top: 4px; font-size: 11px; color: #999; text-align: right;';
    timeSpan.textContent = time;
    
    msgDiv.appendChild(msgP);
    msgDiv.appendChild(timeSpan);
    
    const avatarEl = createAvatarElement(window.currentUserName || 'User', 32, 'rounded-circle');
    avatarEl.style.flexShrink = '0';
    
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
function createAvatarElement(name = 'User', size = 40, className = 'rounded-circle') {
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
function openChatWith(receiverId, name) {
  window.currentReceiverId = receiverId;
  window.currentReceiverName = name;
  const chatTitle = document.querySelector('.chat-username');
  if (chatTitle) chatTitle.textContent = name;
  
  // Cập nhật avatar trong chat box header
  const chatHeader = document.querySelector('.msg-head .d-flex');
  if (chatHeader) {
    // Xóa avatar cũ nếu có
    const oldAvatar = chatHeader.querySelector('.chat-avatar');
    if (oldAvatar) oldAvatar.remove();
    
    // Tạo avatar mới
    const avatarEl = createAvatarElement(name, 40, 'rounded-circle chat-avatar');
    // Chèn vào đầu d-flex, trước flex-grow-1
    const flexGrow = chatHeader.querySelector('.flex-grow-1');
    if (flexGrow) {
      chatHeader.insertBefore(avatarEl, flexGrow);
    } else {
      chatHeader.insertBefore(avatarEl, chatHeader.firstChild);
    }
  }
  
  loadMessages(window.currentSenderId, window.currentReceiverId);
}

// ----------------------------
// Load danh sách bạn bè
// ----------------------------
async function loadFriends() {
  const res = await fetch(`/api/friends/list/${window.currentSenderId}`);
  const friends = await res.json().catch(() => ([]));
  const listEl = document.getElementById('chat-list-open');
  if (!listEl) return;
  
  // Xóa hoàn toàn nội dung cũ
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
    a.style.textDecoration = 'none';
    a.style.padding = '10px 12px';
    a.style.marginBottom = '8px';
    a.style.borderRadius = '8px';
    a.style.transition = 'all 0.3s ease';
    
    // Tạo avatar với chữ cái đầu
    const avatarEl = createAvatarElement(f.fullname || f.username, 40, 'rounded-circle me-2');
    
    const div = document.createElement('div');
    div.style.cssText = 'flex: 1; min-width: 0;';
    div.innerHTML = `
      <h6 style="margin: 0; color: #222; font-weight: 600; font-size: 14px;">${escapeHtml(f.fullname || f.username)}</h6>
      <p style="margin: 0; color: #999; font-size: 12px;">${escapeHtml(f.username)}</p>
    `;
    
    a.appendChild(avatarEl);
    a.appendChild(div);
    fragment.appendChild(a);
  });
  
  listEl.appendChild(fragment);
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
    
    // Highlight active friend
    document.querySelectorAll('#chat-list-open .friend-item').forEach(el => {
      el.style.backgroundColor = '';
    });
    friendLink.style.backgroundColor = '#f5f5f5';
    
    // Mở chat
    openChatWith(friendId, friendName);
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
    const avatarEl = createAvatarElement(r.fullname || r.username, 40, 'rounded-circle');
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
    
    div.appendChild(leftDiv);
    div.appendChild(acceptBtn);
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
        await loadFriends();
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
    // Lưu tên từ API response nếu có
    if (m.sender_fullname || m.sender_username) {
      window.messageSenders[m.sender_id] = m.sender_fullname || m.sender_username;
    } else if (!window.messageSenders[m.sender_id]) {
      // Fallback: Lấy từ danh sách bạn bè hoặc dùng tên mặc định
      if (String(m.sender_id) === String(window.currentSenderId)) {
        window.messageSenders[m.sender_id] = window.currentUserName;
      } else if (window.currentReceiverName) {
        window.messageSenders[m.sender_id] = window.currentReceiverName;
      } else {
        window.messageSenders[m.sender_id] = 'User';
      }
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
    div.style.cssText = 'display: flex; align-items: center; justify-content: space-between; padding: 12px; background: #f5f5f5; border-radius: 8px; margin-bottom: 10px; transition: all 0.3s ease;';
    
    const leftDiv = document.createElement('div');
    leftDiv.style.cssText = 'display: flex; align-items: center; gap: 10px; flex: 1;';
    
    // Tạo avatar với chữ cái đầu
    const avatarEl = createAvatarElement(u.fullname || u.username, 36, 'rounded-circle');
    leftDiv.appendChild(avatarEl);
    
    const infoDiv = document.createElement('div');
    infoDiv.style.cssText = 'min-width: 0;';
    infoDiv.innerHTML = `
      <p style="margin: 0; font-weight: 500; color: #222; font-size: 14px;">${escapeHtml(u.fullname || u.username)}</p>
      <p style="margin: 0; color: #999; font-size: 12px;">${escapeHtml(u.username)}</p>
    `;
    leftDiv.appendChild(infoDiv);
    
    const addBtn = document.createElement('button');
    addBtn.className = 'add-friend-btn';
    addBtn.dataset.id = u.id;
    addBtn.textContent = 'Kết bạn';
    
    div.appendChild(leftDiv);
    div.appendChild(addBtn);
    fragment.appendChild(div);
  });
  
  listEl.appendChild(fragment);
}

// Event delegation cho thêm bạn (gắn 1 lần duy nhất)
let addFriendListenerAttached = false;
function attachAddFriendListener() {
  if (addFriendListenerAttached) return;
  
  const searchEl = document.getElementById('search-results');
  if (!searchEl) return;
  
  searchEl.addEventListener('click', async (e) => {
    if (!e.target.classList.contains('add-friend-btn')) return;
    
    const receiverId = e.target.dataset.id;
    const btn = e.target;
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Đang gửi...';
    
    try {
      const result = await sendFriendRequest(window.currentSenderId, receiverId);
      
      if (result && result.message) {
        alert(result.message);
        // Nếu đã gửi thành công hoặc đã là bạn bè, có thể thay đổi nút
        if (result.message.includes('thành công') || result.message.includes('Đã gửi')) {
          btn.textContent = 'Đã gửi';
          btn.style.background = '#999 !important';
        }
      } else {
        alert('Đã gửi lời mời kết bạn!');
        btn.textContent = 'Đã gửi';
        btn.style.background = '#999 !important';
      }
      
      // Refresh search results
      const searchInput = document.querySelector('.msg-search input');
      const k = searchInput ? searchInput.value.trim() : '';
      await searchAndShowUsers(k);
    } catch (error) {
      console.error('Error sending friend request:', error);
      alert('Lỗi khi gửi lời mời kết bạn!');
      btn.disabled = false;
      btn.textContent = originalText;
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