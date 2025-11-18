async function loadOldData() {
  const user = JSON.parse(localStorage.getItem("user"));
  if (!user) return window.location.href = "login.html";

  const res = await fetch(`/api/users/${user.id}`);
  const json = await res.json();
  if (!json.success) return;

  const data = json.data;

  // Lưu avatar hiện tại (để giữ lại nếu không upload ảnh mới)
  localStorage.setItem("currentAvatar", data.avatar);

  document.getElementById("fullnameInput").value = data.fullname || "";
  document.getElementById("emailInput").value = data.email || "";
  document.getElementById("bioInput").value = data.bio || "";

  // ====== FIX ngày sinh dạng ISO → yyyy-mm-dd ======
  if (data.birthday) {
    const date = new Date(data.birthday);
    document.getElementById("birthdayInput").value = date.toISOString().split("T")[0];
  }

  // Giới tính
  if (data.gender) {
    const g = document.querySelector(
      `input[name="gender"][value="${data.gender}"]`
    );
    if (g) g.checked = true;
  }
}
loadOldData();


async function updateProfile() {
  const user = JSON.parse(localStorage.getItem("user"));

  let avatarBase64 = null;
  const file = document.getElementById("avatarInput").files[0];

  if (file) {
    avatarBase64 = await convertToBase64(file);
  }

  const oldAvatar = localStorage.getItem("currentAvatar");

  const genderSelected = document.querySelector('input[name="gender"]:checked');
  const gender = genderSelected ? genderSelected.value : null;

  const body = {
    id: user.id,
    fullname: document.getElementById("fullnameInput").value,
    email: document.getElementById("emailInput").value,
    bio: document.getElementById("bioInput").value,
    gender,
    birthday: document.getElementById("birthdayInput").value,
    avatar: avatarBase64 ? avatarBase64 : oldAvatar
  };

  const res = await fetch("/api/users/update", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  const result = await res.json();

  if (result.success) {
    alert("Cập nhật thành công!");

    // cập nhật localStorage
    user.fullname = body.fullname;
    user.email = body.email;
    user.gender = body.gender;
    user.bio = body.bio;
    user.birthday = body.birthday;
    user.avatar = body.avatar;

    localStorage.setItem("user", JSON.stringify(user));

    window.location.href = "profile.html";
  } else {
    alert("Lỗi cập nhật: " + result.message);
  }
}

function convertToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
