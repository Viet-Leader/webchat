async function loadProfile() {
  const user = JSON.parse(localStorage.getItem("user"));
  if (!user) return window.location.href = "login.html";

  const res = await fetch(`/api/users/${user.id}`);
  const json = await res.json();

  if (!json.success) {
    alert("Không tải được dữ liệu người dùng!");
    return;
  }

  const data = json.data;
  console.log("DATA TỪ BACKEND:", data);

  document.getElementById("fullnameDisplay").innerText =
    data.fullname || "...";

    document.getElementById("bioDisplay").innerText =
  data.bio || " ";

  document.getElementById("emailDisplay").innerText =
    data.email || "...";

  document.getElementById("genderDisplay").innerText =
    data.gender || "...";

  // ====== FORMAT NGÀY SINH ======
  if (data.birthday) {
    const d = new Date(data.birthday);
    document.getElementById("birthdayDisplay").innerText =
      d.toLocaleDateString("vi-VN");
  } else {
    document.getElementById("birthdayDisplay").innerText = "Chưa có";
  }

  // ====== HIỂN THỊ AVATAR ======
  const avatarImg = document.getElementById("avatarImg");

  if (data.avatar && data.avatar.startsWith("data:image")) {
    avatarImg.src = data.avatar;
  } else {
    avatarImg.src = "/img/default.png";
  }

  // Lưu lại local dữ liệu mới nhất
  localStorage.setItem("user", JSON.stringify(data));
}

loadProfile();
