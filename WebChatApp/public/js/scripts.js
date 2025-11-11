jQuery(document).ready(function() {

    $(".chat-list a").click(function() {
        $(".chatbox").addClass('showbox');
        return false;
    });

    $(".chat-icon").click(function() {
        $(".chatbox").removeClass('showbox');
    });


});
// Chạy khi trang tải xong
jQuery(document).ready(function() {
    $(".chat-list a").click(function() {
        $(".chatbox").addClass('showbox');
        return false;
    });

    $(".chat-icon").click(function() {
        $(".chatbox").removeClass('showbox');
    });
});

// Chạy khi trang tải xong
document.addEventListener('DOMContentLoaded', function () {
  const usernameDisplay = document.querySelector('.username-display');
  if (!usernameDisplay) {
    console.error('❌ Selector .username-display không tìm thấy!');
    return;
  }

  const userData = localStorage.getItem('user');
  console.log('localStorage.user:', userData);  // Giữ để debug

  if (userData) {
    try {
      const user = JSON.parse(userData);
      const displayName = user.fullname || user.username || 'Người dùng';
      usernameDisplay.textContent = displayName;
      console.log('✅ Hiển thị tên:', displayName);  // Thêm log để kiểm tra
    } catch (e) {
      console.error('❌ Lỗi parse userData:', e);
      usernameDisplay.textContent = 'Lỗi dữ liệu';
    }
  } else {
    // Chưa đăng nhập → chuyển về login
    usernameDisplay.textContent = 'Chưa đăng nhập';
    setTimeout(() => window.location.href = 'login.html', 1000);
  }
});

