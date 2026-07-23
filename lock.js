(function () {
  "use strict";

  // =========================================================
  //  비밀번호는 코드에 직접 넣지 않습니다.
  //  배포 시 GitHub Actions(deploy.yml)가 저장소 Secret(SITE_PASSWORD)의
  //  SHA-256 해시를 아래 자리표시자에 넣어줍니다.
  //
  //  - 로컬에서 file:// 로 직접 열어 테스트할 때는(해시 미주입 상태)
  //    아래 DEV_PASSWORD 로 통과합니다.
  // =========================================================
  const PASSWORD_HASH = "__PASSWORD_HASH__";   // 빌드 시 실제 해시로 치환됨
  const DEV_PASSWORD = "1234";                 // 로컬 개발용(빌드 전) 비밀번호

  const STORAGE_KEY = "quiz_unlocked_v1";

  const screen = document.getElementById("lockScreen");
  const form = document.getElementById("lockForm");
  const input = document.getElementById("lockInput");
  const errorEl = document.getElementById("lockError");
  const rememberEl = document.getElementById("lockRemember");

  if (!screen || !form) return;

  const built = PASSWORD_HASH.indexOf("PASSWORD_HASH") === -1; // 해시가 실제로 주입됐는지

  function isUnlocked() {
    try {
      return sessionStorage.getItem(STORAGE_KEY) === "1" ||
             localStorage.getItem(STORAGE_KEY) === "1";
    } catch (e) { return false; }
  }

  function unlock(remember) {
    try {
      sessionStorage.setItem(STORAGE_KEY, "1");
      if (remember) localStorage.setItem(STORAGE_KEY, "1");
    } catch (e) { /* 저장 실패 무시 */ }
    screen.remove();
    document.body.classList.remove("locked");
  }

  // SHA-256 → hex 문자열
  async function sha256Hex(text) {
    const data = new TextEncoder().encode(text);
    const buf = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(buf))
      .map(b => b.toString(16).padStart(2, "0")).join("");
  }

  async function check(value) {
    // 빌드된 상태: 해시 비교 (crypto.subtle 은 https 등 보안 컨텍스트에서만 동작)
    if (built && window.crypto && crypto.subtle) {
      try {
        const h = await sha256Hex(value);
        return h === PASSWORD_HASH.toLowerCase();
      } catch (e) { /* 아래 개발용 비교로 폴백 */ }
    }
    // 미빌드/로컬 파일 열람: 개발용 평문 비교
    return value === DEV_PASSWORD;
  }

  if (isUnlocked()) {
    screen.remove();
    return;
  }

  document.body.classList.add("locked");
  setTimeout(function () { input && input.focus(); }, 50);

  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    const ok = await check(input.value);
    if (ok) {
      unlock(rememberEl && rememberEl.checked);
    } else {
      errorEl.classList.add("show");
      input.value = "";
      input.focus();
      const box = screen.querySelector(".lock-box");
      box.classList.remove("shake");
      void screen.offsetWidth; // 리플로우로 애니메이션 재실행
      box.classList.add("shake");
    }
  });

  input.addEventListener("input", function () {
    errorEl.classList.remove("show");
  });
})();
