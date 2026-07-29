(function () {
  "use strict";

  const LIB_KEY = "quiz_library_v1";
  const BM_KEY = "quiz_bookmarks_v1";
  const WRONG_KEY = "quiz_wrong_v1";
  const STATS_KEY = "quiz_stats_v1";
  const PREF_KEY = "quiz_prefs_v1";
  const SUBJECTS_KEY = "quiz_subjects_v1";
  const DAILY_KEY = "quiz_daily_v1";
  const RESUME_KEY = "quiz_resume_v1";

  // ---------- 저장소 유틸 ----------
  function lsGet(key, def) {
    try { const v = JSON.parse(localStorage.getItem(key)); return v == null ? def : v; }
    catch (e) { return def; }
  }
  function lsSet(key, val) { localStorage.setItem(key, JSON.stringify(val)); }

  function hashId(str) {
    let h = 5381;
    for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
    return "q" + (h >>> 0).toString(36);
  }
  function questionId(q) { return hashId(q.question + "|" + (q.options || []).join("§")); }
  function shuffleArray(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function fmtDate(ts) {
    const d = new Date(ts);
    return d.getFullYear() + "." + String(d.getMonth() + 1).padStart(2, "0") + "." + String(d.getDate()).padStart(2, "0");
  }

  // ---------- 모달 ----------
  function openModal(build) {
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    const modal = document.createElement("div");
    modal.className = "modal";
    overlay.appendChild(modal);
    const close = () => { overlay.remove(); document.removeEventListener("keydown", onEsc); };
    function onEsc(e) { if (e.key === "Escape") close(); }
    overlay.addEventListener("mousedown", e => { if (e.target === overlay) close(); });
    document.addEventListener("keydown", onEsc);
    document.body.appendChild(overlay);
    build(modal, close);
    return close;
  }
  function mkBtn(cls, html) { const b = document.createElement("button"); b.className = "btn " + cls; b.innerHTML = html; return b; }

  // ---------- 환경설정 ----------
  function getPrefs() { return lsGet(PREF_KEY, { shuffleQ: false, shuffleO: false, hideAccuracy: false, hideTodaySubjects: false }); }
  function setPref(k, v) { const p = getPrefs(); p[k] = v; lsSet(PREF_KEY, p); }

  // ---------- 라이브러리 ----------
  const DEFAULT_SUBJECT = "미분류";
  function getLibrary() { return lsGet(LIB_KEY, {}); }
  function getLibraryList() { return Object.values(getLibrary()).sort((a, b) => b.addedAt - a.addedAt); }
  function saveQuiz(quiz) { const lib = getLibrary(); lib[quiz.id] = quiz; lsSet(LIB_KEY, lib); }
  function deleteQuiz(id) { const lib = getLibrary(); delete lib[id]; lsSet(LIB_KEY, lib); }
  function subjectOf(quiz) { return (quiz.subject && String(quiz.subject).trim()) || DEFAULT_SUBJECT; }
  function setQuizSubject(id, subject) { const lib = getLibrary(); if (lib[id]) { lib[id].subject = subject || DEFAULT_SUBJECT; lsSet(LIB_KEY, lib); } }
  // 파일이 없어도 유지되는 사용자 지정 과목 목록
  function getStoredSubjects() { return lsGet(SUBJECTS_KEY, []); }
  function setStoredSubjects(arr) { lsSet(SUBJECTS_KEY, arr); }
  function addSubjectName(name) {
    name = (name || "").trim();
    if (!name) return false;
    const a = getStoredSubjects();
    if (a.indexOf(name) !== -1 || getSubjects().indexOf(name) !== -1) return false;
    a.push(name); setStoredSubjects(a); return true;
  }
  function getSubjects() {
    const set = {};
    getLibraryList().forEach(q => { set[subjectOf(q)] = true; });
    getStoredSubjects().forEach(s => { set[s] = true; });
    return Object.keys(set).sort((a, b) => (a === DEFAULT_SUBJECT ? 1 : b === DEFAULT_SUBJECT ? -1 : a.localeCompare(b, "ko")));
  }
  function renameSubject(oldName, newName) {
    const lib = getLibrary();
    Object.values(lib).forEach(q => { if (subjectOf(q) === oldName) q.subject = newName; });
    lsSet(LIB_KEY, lib);
    let a = getStoredSubjects().map(s => (s === oldName ? newName : s));
    a = a.filter((s, i) => a.indexOf(s) === i);
    setStoredSubjects(a);
    const st = getStats();
    if (st["subject:" + oldName]) {
      if (!st["subject:" + newName]) st["subject:" + newName] = st["subject:" + oldName];
      delete st["subject:" + oldName];
      lsSet(STATS_KEY, st);
    }
  }
  function deleteSubject(name) {
    const quizzes = getLibraryList().filter(q => subjectOf(q) === name);
    const st = getStats();
    quizzes.forEach(q => { deleteQuiz(q.id); delete st[q.id]; });
    delete st["subject:" + name];
    lsSet(STATS_KEY, st);
    clearResumePoint("subject:" + name);
    quizzes.forEach(q => clearResumePoint(q.id));
    setStoredSubjects(getStoredSubjects().filter(s => s !== name));
  }

  // ---------- 통계 ----------
  function getStats() { return lsGet(STATS_KEY, {}); }
  function getQuizStat(id) { return getStats()[id] || null; }
  function recordAttempt(id, correct, total) {
    const s = getStats();
    if (!s[id]) s[id] = { attempts: [] };
    s[id].attempts.push({ date: Date.now(), correct: correct, total: total });
    if (s[id].attempts.length > 100) s[id].attempts = s[id].attempts.slice(-100);
    lsSet(STATS_KEY, s);
  }
  function statSummary(id) {
    const st = getQuizStat(id);
    if (!st || !st.attempts.length) return null;
    const pcts = st.attempts.map(a => a.total ? a.correct / a.total : 0);
    const last = st.attempts[st.attempts.length - 1];
    return {
      count: st.attempts.length,
      lastPct: Math.round((last.correct / last.total) * 100),
      bestPct: Math.round(Math.max.apply(null, pcts) * 100),
      avgPct: Math.round((pcts.reduce((a, b) => a + b, 0) / pcts.length) * 100),
    };
  }

  // ---------- 일별 학습 기록 ----------
  function dayKey(ts) {
    const d = new Date(ts);
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  function getDaily() { return lsGet(DAILY_KEY, {}); }
  // 문제 하나를 풀 때마다 호출 (정답 여부 + 과목 기록)
  function recordDaily(correct, subject) {
    const d = getDaily();
    const k = dayKey(Date.now());
    if (!d[k]) d[k] = { total: 0, correct: 0, subjects: {} };
    if (!d[k].subjects) d[k].subjects = {};
    d[k].total += 1;
    if (correct) d[k].correct += 1;
    const s = subject || "기타";
    d[k].subjects[s] = (d[k].subjects[s] || 0) + 1;
    lsSet(DAILY_KEY, d);
  }

  // ---------- 저장 지점(이어풀기) ----------
  function getResume() { return lsGet(RESUME_KEY, {}); }
  function getResumePoint(key) { return key ? (getResume()[key] || null) : null; }
  function setResumePoint(key, data) { const r = getResume(); r[key] = data; lsSet(RESUME_KEY, r); }
  function clearResumePoint(key) { const r = getResume(); if (r[key]) { delete r[key]; lsSet(RESUME_KEY, r); } }

  // ---------- 북마크 ----------
  function getBookmarks() { return lsGet(BM_KEY, {}); }
  function isBookmarked(q) { return !!getBookmarks()[questionId(q)]; }
  function toggleBookmark(q, quizTitle) {
    const bm = getBookmarks(); const id = questionId(q);
    if (bm[id]) delete bm[id];
    else bm[id] = { question: q.question, options: q.options, answer: q.answer, explanation: q.explanation || "", quizTitle: quizTitle || "", savedAt: Date.now() };
    lsSet(BM_KEY, bm); return !!bm[id];
  }
  function getBookmarkList() { return Object.values(getBookmarks()).sort((a, b) => a.savedAt - b.savedAt); }

  // ---------- 오답 노트 ----------
  function getWrong() { return lsGet(WRONG_KEY, {}); }
  function addWrong(q, quizTitle) {
    const w = getWrong(); const id = questionId(q);
    if (w[id]) w[id].wrongCount = (w[id].wrongCount || 1) + 1;
    else w[id] = { question: q.question, options: q.options, answer: q.answer, explanation: q.explanation || "", quizTitle: quizTitle || "", wrongCount: 1, addedAt: Date.now() };
    lsSet(WRONG_KEY, w);
  }
  function removeWrong(q) { const w = getWrong(); delete w[questionId(q)]; lsSet(WRONG_KEY, w); }
  function getWrongList() { return Object.values(getWrong()).sort((a, b) => (b.wrongCount || 0) - (a.wrongCount || 0)); }

  // 라이브러리에는 아직 존재하는 퀴즈인데 그 안에서 문제가 삭제/수정된 경우,
  // 북마크·오답 노트에 남은 옛 스냅샷을 정리한다.
  // (퀴즈 자체가 라이브러리에 없으면 = 통째로 삭제된 것이므로 그대로 보존)
  function reconcileReview() {
    const validIdsByTitle = {};
    Object.values(getLibrary()).forEach(quiz => {
      const title = quiz && quiz.title || "";
      const ids = validIdsByTitle[title] || (validIdsByTitle[title] = {});
      (quiz && quiz.questions || []).forEach(q => { ids[questionId(q)] = true; });
    });
    let changed = false;
    [BM_KEY, WRONG_KEY].forEach(key => {
      const store = lsGet(key, {});
      let dirty = false;
      Object.keys(store).forEach(id => {
        const entry = store[id];
        const title = entry && entry.quizTitle;
        const known = title && validIdsByTitle[title];
        if (known && !known[id]) { delete store[id]; dirty = true; }
      });
      if (dirty) { lsSet(key, store); changed = true; }
    });
    return changed;
  }

  // ---------- 카운트 배지 갱신 ----------
  function refreshCounts() {
    document.getElementById("cntLib").textContent = getSubjects().length;
    document.getElementById("cntBm").textContent = getBookmarkList().length;
    document.getElementById("cntWrong").textContent = getWrongList().length;
  }

  // ==========================================================
  //  퀴즈 플레이어
  // ==========================================================
  let currentKeydown = null;

  function transform(q, shuffleO) {
    let order = q.options.map((_, i) => i);
    if (shuffleO) order = shuffleArray(order);
    return {
      question: q.question,
      options: order.map(i => q.options[i]),
      answer: order.indexOf(q.answer),
      explanation: q.explanation || "",
      _source: q._source || "",
      _orig: { question: q.question, options: q.options, answer: q.answer, explanation: q.explanation || "", _source: q._source || "" }
    };
  }

  // sourceQuestions: 원본 문제 배열
  // ctx: { quizId, quizTitle, onExit, onChange, savedOrder, savedIdx }
  function QuizPlayer(container, sourceQuestions, ctx) {
    ctx = ctx || {};
    const prefs = getPrefs();
    const subjMap = buildQuestionSubjectMap(); // 세션 시작 시 1회만 (일별 과목 기록용)
    const saveKey = ctx.saveKey || ctx.quizId || null; // 저장/이어풀기 키 (통계 quizId와 분리 가능)
    let shuffleQ = prefs.shuffleQ;
    let shuffleO = prefs.shuffleO;
    let resumeOrder = (ctx.savedOrder && ctx.savedOrder.length) ? ctx.savedOrder : null; // 초기 1회만 적용
    let questions = build();
    let idx = (ctx.savedIdx && ctx.savedIdx < questions.length) ? ctx.savedIdx : 0;
    let answered = new Array(questions.length).fill(null);
    let correctCount = 0;
    let sessionWrong = [];

    function build() {
      let base;
      if (resumeOrder) {
        // 저장된 순서대로 복원 (없어진 문제는 건너뛰고, 새로 생긴 문제는 뒤에 추가)
        const byId = {};
        sourceQuestions.forEach(q => { byId[questionId(q)] = q; });
        const used = {};
        base = [];
        resumeOrder.forEach(id => { if (byId[id] && !used[id]) { used[id] = 1; base.push(byId[id]); } });
        sourceQuestions.forEach(q => { const id = questionId(q); if (!used[id]) { used[id] = 1; base.push(q); } });
        resumeOrder = null; // 이후 rebuild부터는 일반 동작
      } else {
        base = shuffleQ ? shuffleArray(sourceQuestions) : sourceQuestions.slice();
      }
      return base.map(q => transform(q, shuffleO));
    }
    function reset() { idx = 0; correctCount = 0; sessionWrong = []; answered = new Array(questions.length).fill(null); }
    function rebuild() { questions = build(); reset(); render(); }

    function render() {
      if (idx >= questions.length) { renderResult(); return; }
      const q = questions[idx];
      const marked = isBookmarked(q._orig);
      const already = answered[idx];
      const pct = Math.round((idx / questions.length) * 100);
      const progressText = q._source
        ? ('문제 (' + (idx + 1) + '번/' + questions.length + '개) <span class="progress-src">- ' + escapeHtml(q._source) + '</span>')
        : ('문제 ' + (idx + 1) + ' / ' + questions.length);

      container.innerHTML = "";
      const card = document.createElement("div");
      card.className = "card";
      card.innerHTML =
        '<div class="quiz-meta">' +
          '<span class="progress-text">' + progressText + '</span>' +
          '<div class="meta-btns">' +
            (saveKey ? '<button class="bookmark-btn" id="saveBtn"><i class="fa-regular fa-bookmark"></i> 현재 지점 저장</button>' : '') +
            '<button class="bookmark-btn ' + (marked ? "active" : "") + '" id="bmBtn">' + (marked ? '<i class="fa-solid fa-star"></i> 북마크됨' : '<i class="fa-regular fa-star"></i> 북마크') + '</button>' +
          '</div>' +
        '</div>' +
        '<div class="toggles">' +
          '<label class="toggle ' + (shuffleQ ? "on" : "") + '" id="tgQ"><span class="switch"></span><i class="fa-solid fa-shuffle"></i> 문제 순서</label>' +
          '<label class="toggle ' + (shuffleO ? "on" : "") + '" id="tgO"><span class="switch"></span><i class="fa-solid fa-shuffle"></i> 보기 순서</label>' +
        '</div>' +
        '<div class="progress-bar"><div class="progress-fill" style="width:' + pct + '%"></div></div>' +
        '<p class="question-text"></p>' +
        '<div class="options"></div>' +
        '<div class="explanation" id="exp"></div>' +
        '<div class="btn-row">' +
          '<button class="btn secondary" id="prevBtn"><i class="fa-solid fa-arrow-left"></i> 이전</button>' +
          '<div class="spacer"></div>' +
          '<button class="btn" id="nextBtn">' + (idx === questions.length - 1 ? "결과 보기" : '다음 <i class="fa-solid fa-arrow-right"></i>') + '</button>' +
        '</div>';

      card.querySelector(".question-text").textContent = q.question;
      const optWrap = card.querySelector(".options");
      q.options.forEach((opt, i) => {
        const el = document.createElement("div");
        el.className = "option";
        el.innerHTML = '<span class="marker">' + String.fromCharCode(65 + i) + '</span><span class="opt-text"></span><span class="key-hint">' + (i + 1) + '</span>';
        el.querySelector(".opt-text").textContent = opt;
        el.addEventListener("click", () => choose(i));
        optWrap.appendChild(el);
      });

      card.querySelector("#bmBtn").addEventListener("click", () => {
        const now = toggleBookmark(q._orig, q._source || ctx.quizTitle);
        const b = card.querySelector("#bmBtn");
        b.classList.toggle("active", now); b.innerHTML = now ? '<i class="fa-solid fa-star"></i> 북마크됨' : '<i class="fa-regular fa-star"></i> 북마크';
        refreshCounts(); if (ctx.onChange) ctx.onChange();
      });

      if (saveKey) {
        card.querySelector("#saveBtn").addEventListener("click", () => {
          setResumePoint(saveKey, {
            idx: idx,
            total: questions.length,
            order: questions.map(qq => questionId(qq._orig)),
            title: ctx.quizTitle || "",
            savedAt: Date.now()
          });
          const b = card.querySelector("#saveBtn");
          b.classList.add("active");
          b.innerHTML = '<i class="fa-solid fa-bookmark"></i> 저장됨';
          setTimeout(() => { if (card.querySelector("#saveBtn") === b) { b.classList.remove("active"); b.innerHTML = '<i class="fa-regular fa-bookmark"></i> 현재 지점 저장'; } }, 1500);
        });
      }
      card.querySelector("#tgQ").addEventListener("click", () => { shuffleQ = !shuffleQ; setPref("shuffleQ", shuffleQ); rebuild(); });
      card.querySelector("#tgO").addEventListener("click", () => { shuffleO = !shuffleO; setPref("shuffleO", shuffleO); rebuild(); });

      card.querySelector("#prevBtn").disabled = idx === 0;
      card.querySelector("#prevBtn").addEventListener("click", () => { idx--; render(); });
      card.querySelector("#nextBtn").addEventListener("click", () => { idx++; render(); });

      container.appendChild(card);

      // 목록으로 버튼: 퀴즈 카드와 분리된 별도 영역
      if (ctx.onExit) {
        const exitRow = document.createElement("div");
        exitRow.className = "exit-row";
        const exitBtn = document.createElement("button");
        exitBtn.className = "btn secondary small";
        exitBtn.id = "exitBtn";
        exitBtn.innerHTML = '<i class="fa-solid fa-arrow-left"></i> 목록으로';
        exitBtn.addEventListener("click", ctx.onExit);
        exitRow.appendChild(exitBtn);
        container.appendChild(exitRow);
      }

      if (already !== null) showResult(already);

      function choose(i) {
        if (answered[idx] !== null) return;
        answered[idx] = i;
        const isCorrect = i === q.answer;
        if (isCorrect) { correctCount++; removeWrong(q._orig); }
        else { addWrong(q._orig, q._source || ctx.quizTitle); sessionWrong.push(q._orig); }
        recordDaily(isCorrect, subjMap[questionId(q._orig)] || "기타");
        refreshCounts(); if (ctx.onChange) ctx.onChange();
        showResult(i);
      }
      function showResult(selected) {
        optWrap.querySelectorAll(".option").forEach((el, i) => {
          el.classList.add("disabled");
          if (i === q.answer) el.classList.add("correct");
          if (i === selected && i !== q.answer) el.classList.add("wrong");
          if (i === selected) el.classList.add("selected");
        });
        const exp = card.querySelector("#exp");
        if (q.explanation) {
          exp.innerHTML = '<span class="label">해설 </span>';
          exp.appendChild(document.createTextNode(q.explanation));
          exp.classList.add("show");
        }
      }
    }

    function renderResult() {
      const pct = Math.round((correctCount / questions.length) * 100);
      if (ctx.quizId) recordAttempt(ctx.quizId, correctCount, questions.length);
      if (saveKey) clearResumePoint(saveKey);
      if (ctx.onChange) ctx.onChange();
      const wrongUnique = [];
      const seen = {};
      sessionWrong.forEach(q => { const id = questionId(q); if (!seen[id]) { seen[id] = 1; wrongUnique.push(q); } });

      container.innerHTML = "";
      const card = document.createElement("div");
      card.className = "card result";
      let html =
        '<span class="badge">완료!</span>' +
        '<div class="score">' + correctCount + ' / ' + questions.length + '</div>' +
        '<p style="color:var(--muted)">정답률 ' + pct + '%' + (wrongUnique.length ? ' · 틀린 문제 ' + wrongUnique.length + '개' : ' · 전부 정답 <i class="fa-solid fa-circle-check" style="color:var(--correct)"></i>') + '</p>' +
        '<div class="btn-row" style="justify-content:center">';
      if (wrongUnique.length) html += '<button class="btn" id="retryWrongBtn"><i class="fa-solid fa-clipboard-list"></i> 틀린 문제만 다시 풀기</button>';
      html += '<button class="btn secondary" id="retryBtn"><i class="fa-solid fa-rotate-right"></i> 전체 다시 풀기</button>';
      if (ctx.onExit) html += '<button class="btn secondary" id="exitBtn2">목록으로</button>';
      html += '</div>';
      card.innerHTML = html;
      container.appendChild(card);

      card.querySelector("#retryBtn").addEventListener("click", () => rebuild());
      if (ctx.onExit) card.querySelector("#exitBtn2").addEventListener("click", ctx.onExit);
      if (wrongUnique.length) card.querySelector("#retryWrongBtn").addEventListener("click", () => {
        QuizPlayer(container, wrongUnique, { quizTitle: ctx.quizTitle, onExit: ctx.onExit, onChange: ctx.onChange });
      });
    }

    // 키보드 단축키
    if (currentKeydown) document.removeEventListener("keydown", currentKeydown);
    currentKeydown = function (e) {
      if (!document.body.contains(container)) return;
      if (idx >= questions.length) return;
      if (e.key >= "1" && e.key <= "9") {
        const n = parseInt(e.key, 10) - 1;
        const opts = container.querySelectorAll(".option");
        if (opts[n] && answered[idx] === null) opts[n].click();
      } else if (e.key === "ArrowRight" || e.key === "Enter") {
        idx++; render();
      } else if (e.key === "ArrowLeft") {
        if (idx > 0) { idx--; render(); }
      }
    };
    document.addEventListener("keydown", currentKeydown);

    render();
  }

  // ==========================================================
  //  파일 처리
  // ==========================================================
  function validate(questions) {
    if (!Array.isArray(questions) || questions.length === 0) return "문제 목록(questions)이 비어 있거나 배열이 아닙니다.";
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      if (!q.question) return (i + 1) + "번 문제에 question(질문)이 없습니다.";
      if (!Array.isArray(q.options) || q.options.length < 2) return (i + 1) + "번 문제의 options(보기)가 2개 이상이어야 합니다.";
      if (typeof q.answer !== "number" || q.answer < 0 || q.answer >= q.options.length) return (i + 1) + "번 문제의 answer(정답 번호)가 올바르지 않습니다.";
    }
    return null;
  }

  function handleFiles(fileList) {
    const files = Array.from(fileList);
    let done = 0;
    const parsed = [], errors = [];
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const data = JSON.parse(reader.result);
          const questions = Array.isArray(data) ? data : data.questions;
          const err = validate(questions);
          if (err) errors.push(file.name + ": " + err);
          else parsed.push({
            title: (data && data.title) ? data.title : file.name.replace(/\.json$/i, ""),
            subtitle: (data && data.subtitle) ? String(data.subtitle).trim() : "",
            fileSubject: (data && data.subject) ? String(data.subject).trim() : "",
            description: (data && data.description) || "",
            questions: questions
          });
        } catch (e) { errors.push(file.name + ": JSON 형식 오류 (" + e.message + ")"); }
        finish();
      };
      reader.onerror = () => { errors.push(file.name + ": 파일을 읽을 수 없습니다."); finish(); };
      reader.readAsText(file, "utf-8");
    });
    function finish() {
      done++;
      if (done !== files.length) return;
      if (parsed.length === 0) { if (errors.length) alert("파일을 추가하지 못했습니다:\n\n" + errors.join("\n")); return; }
      const def = (parsed.every(p => p.fileSubject && p.fileSubject === parsed[0].fileSubject)) ? parsed[0].fileSubject : "";
      openSubjectPickModal(parsed, def, subject => {
        parsed.forEach(p => {
          const id = hashId(p.title);
          const existing = getLibrary()[id];
          saveQuiz({
            id: id, title: p.title, subtitle: p.subtitle, subject: subject,
            description: p.description, questions: p.questions,
            addedAt: existing ? existing.addedAt : Date.now(), updatedAt: Date.now()
          });
        });
        refreshCounts(); renderSubjectsTab();
        if (errors.length) alert("일부 파일을 추가하지 못했습니다:\n\n" + errors.join("\n"));
      });
    }
  }

  // 업로드 시 과목 선택 모달 (비우면 미분류)
  function openSubjectPickModal(parsed, defValue, onConfirm) {
    openModal((modal, close) => {
      const h = document.createElement("h3"); h.textContent = "과목 선택";
      const desc = document.createElement("p"); desc.className = "modal-desc";
      desc.innerHTML = parsed.length + "개 파일(" + parsed.reduce((n, p) => n + p.questions.length, 0) + "문제)을 저장할 과목을 선택하세요. 비워두면 <b>미분류</b>로 저장됩니다.";
      modal.appendChild(h); modal.appendChild(desc);

      const existing = getSubjects();
      if (existing.length) {
        const chips = document.createElement("div"); chips.className = "chips";
        existing.forEach(s => {
          const c = document.createElement("span"); c.className = "chip"; c.textContent = s;
          c.addEventListener("click", () => { input.value = s; input.focus(); });
          chips.appendChild(c);
        });
        modal.appendChild(chips);
      }

      const field = document.createElement("div"); field.className = "field";
      const label = document.createElement("label"); label.textContent = "과목 이름";
      const input = document.createElement("input"); input.type = "text";
      input.placeholder = "예: Python (비우면 미분류)"; input.value = defValue || "";
      field.appendChild(label); field.appendChild(input);
      modal.appendChild(field);

      const actions = document.createElement("div"); actions.className = "modal-actions";
      const cancel = mkBtn("secondary", "취소"); cancel.addEventListener("click", close);
      const ok = mkBtn("", "저장");
      const submit = () => { const v = input.value.trim() || DEFAULT_SUBJECT; close(); onConfirm(v); };
      ok.addEventListener("click", submit);
      input.addEventListener("keydown", e => { if (e.key === "Enter") submit(); });
      actions.appendChild(cancel); actions.appendChild(ok);
      modal.appendChild(actions);
      setTimeout(() => input.focus(), 50);
    });
  }

  // 과목 관리 모달 (이름 변경 / 삭제)
  function openManageSubjectsModal() {
    openModal((modal, close) => {
      function draw() {
        modal.innerHTML = "";
        const h = document.createElement("h3"); h.textContent = "과목 관리";
        const desc = document.createElement("p"); desc.className = "modal-desc"; desc.textContent = "과목을 추가하거나, 이름을 변경하거나, 통째로 삭제할 수 있어요.";
        modal.appendChild(h); modal.appendChild(desc);

        // 새 과목 추가
        const addRow = document.createElement("div"); addRow.className = "field"; addRow.style.marginBottom = "18px";
        const addLabel = document.createElement("label"); addLabel.textContent = "새 과목 추가";
        const addWrap = document.createElement("div"); addWrap.style.cssText = "display:flex;gap:8px";
        const addInput = document.createElement("input"); addInput.type = "text"; addInput.placeholder = "예: 수학, 영어"; addInput.style.flex = "1";
        const addBtn = mkBtn("small", "추가");
        const doAdd = () => {
          const name = addInput.value.trim();
          if (!name) { addInput.focus(); return; }
          if (!addSubjectName(name)) { alert('"' + name + '" 과목은 이미 있습니다.'); return; }
          addInput.value = ""; refreshCounts(); renderSubjectsTab(); draw();
        };
        addBtn.addEventListener("click", doAdd);
        addInput.addEventListener("keydown", e => { if (e.key === "Enter") doAdd(); });
        addWrap.appendChild(addInput); addWrap.appendChild(addBtn);
        addRow.appendChild(addLabel); addRow.appendChild(addWrap);
        modal.appendChild(addRow);

        const subs = getSubjects();
        if (subs.length === 0) {
          const p = document.createElement("p"); p.className = "modal-desc"; p.textContent = "아직 과목이 없습니다.";
          modal.appendChild(p);
        } else {
          subs.forEach(s => {
            const quizzes = getLibraryList().filter(q => subjectOf(q) === s);
            const subjQ = quizzes.reduce((n, q) => n + q.questions.length, 0);
            const row = document.createElement("div"); row.className = "subj-row";
            const name = document.createElement("span"); name.className = "name"; name.innerHTML = '<i class="fa-solid fa-folder"></i> ' + escapeHtml(s);
            const cnt = document.createElement("span"); cnt.className = "subject-count"; cnt.textContent = quizzes.length + "개 · " + subjQ + "문제";
            const ren = mkBtn("secondary small", "이름변경");
            const del = mkBtn("danger small", "삭제");
            ren.addEventListener("click", () => {
              const nn = (prompt('"' + s + '" 과목의 새 이름:', s) || "").trim();
              if (!nn || nn === s) return;
              if (getSubjects().indexOf(nn) !== -1 && !confirm('"' + nn + '" 과목이 이미 있어요. 두 과목을 합칠까요?')) return;
              renameSubject(s, nn); refreshCounts(); renderSubjectsTab(); draw();
            });
            del.addEventListener("click", () => {
              if (confirm('"' + s + '" 과목의 퀴즈 ' + quizzes.length + '개를 모두 삭제할까요?\n(통계도 함께 사라집니다. 북마크·오답 노트는 유지됩니다.)')) {
                deleteSubject(s); refreshCounts(); renderSubjectsTab(); draw();
              }
            });
            row.appendChild(name); row.appendChild(cnt); row.appendChild(ren); row.appendChild(del);
            modal.appendChild(row);
          });
        }
        const actions = document.createElement("div"); actions.className = "modal-actions";
        const done = mkBtn("", "닫기"); done.addEventListener("click", close);
        actions.appendChild(done); modal.appendChild(actions);
      }
      draw();
    });
  }

  const fileInput = document.getElementById("fileInput");
  fileInput.addEventListener("change", () => { if (fileInput.files.length) { handleFiles(fileInput.files); fileInput.value = ""; } });

  // ==========================================================
  //  공용: 파일 추가 버튼 (드래그&드롭)
  // ==========================================================
  function uploadBox(compact) {
    const drop = document.createElement("div");
    drop.className = "upload-box" + (compact ? " compact" : "");
    drop.innerHTML = compact
      ? '<span><i class="fa-solid fa-file-arrow-up"></i> 퀴즈 파일 추가 <small>(클릭 또는 드래그, 여러 개 가능)</small></span>'
      : '<div class="icon"><i class="fa-solid fa-cloud-arrow-up"></i></div><p>퀴즈 파일 추가하기</p><small>클릭하거나 파일을 끌어다 놓으세요 · 여러 개 동시 가능 (.json)</small>';
    drop.addEventListener("click", () => fileInput.click());
    drop.addEventListener("dragover", e => { e.preventDefault(); drop.classList.add("dragover"); });
    drop.addEventListener("dragleave", () => drop.classList.remove("dragover"));
    drop.addEventListener("drop", e => { e.preventDefault(); drop.classList.remove("dragover"); if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files); });
    return drop;
  }

  // ==========================================================
  //  과목 필터 공용 (역추적 방식)
  // ==========================================================
  // 선택된 과목 배열 (빈 배열 = 전체)
  let allFilter = [], bmFilter = [], wrongFilter = [];

  // 문제 → 과목 매핑 (라이브러리 기준, 항상 최신 과목 반영)
  function buildQuestionSubjectMap() {
    const map = {};
    getLibraryList().forEach(quiz => {
      const subj = subjectOf(quiz);
      quiz.questions.forEach(q => { map[questionId(q)] = subj; });
    });
    return map;
  }
  function itemSubject(item, map) { return map[questionId(item)] || "기타"; }
  function subjectsInItems(items, map) {
    const set = {};
    items.forEach(it => { set[itemSubject(it, map)] = true; });
    return Object.keys(set).sort((a, b) => (a === "기타" ? 1 : b === "기타" ? -1 : a.localeCompare(b, "ko")));
  }
  // subjects: 과목명 배열, selected: 선택된 과목 배열(빈 배열=전체), onChange(새 배열)
  function makeFilterBar(subjects, selected, onChange) {
    const bar = document.createElement("div");
    bar.className = "filter-bar";
    const chip = (label, icon, active, handler) => {
      const c = document.createElement("button");
      c.className = "chip filter-chip" + (active ? " active" : "");
      c.innerHTML = '<i class="fa-solid ' + (active ? "fa-check" : icon) + '"></i> ' + escapeHtml(label);
      c.addEventListener("click", handler);
      return c;
    };
    // "전체" 칩: 선택이 없을 때 활성, 누르면 모두 해제
    bar.appendChild(chip("전체", "fa-layer-group", selected.length === 0, () => { if (selected.length) onChange([]); }));
    subjects.forEach(s => {
      const on = selected.indexOf(s) !== -1;
      bar.appendChild(chip(s, "fa-folder", on, () => {
        const next = on ? selected.filter(x => x !== s) : selected.concat([s]);
        onChange(next);
      }));
    });
    return bar;
  }

  // ==========================================================
  //  탭: 전체 풀기
  // ==========================================================
  const allTab = document.getElementById("tab-all");
  function renderAllTab() {
    const fullList = getLibraryList();
    allTab.innerHTML = "";
    if (fullList.length === 0) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.innerHTML = '<div class="icon"><i class="fa-solid fa-font"></i></div><p>저장된 퀴즈가 없습니다.</p><small>먼저 <b>과목별 풀기</b> 탭에서 퀴즈 파일을 추가하세요.</small>';
      allTab.appendChild(empty);
      return;
    }

    // 과목 필터 (복수 선택)
    const subjects = getSubjects();
    allFilter = allFilter.filter(s => subjects.indexOf(s) !== -1);
    if (subjects.length > 1) {
      allTab.appendChild(makeFilterBar(subjects, allFilter, v => { allFilter = v; renderAllTab(); }));
    }

    const list = allFilter.length ? fullList.filter(q => allFilter.indexOf(subjectOf(q)) !== -1) : fullList;
    const totalQ = list.reduce((n, q) => n + q.questions.length, 0);
    const statId = allFilter.length === 0 ? "all"
      : (allFilter.length === 1 ? ("subject:" + allFilter[0]) : ("subjects:" + allFilter.slice().sort().join("|")));
    const title = allFilter.length === 0 ? "전체 퀴즈"
      : (allFilter.length === 1 ? allFilter[0] : ("선택 과목 " + allFilter.length + "개"));
    const icon = allFilter.length ? "fa-folder-open" : "fa-font";
    const subLabel = allFilter.length
      ? ('선택한 과목의 파일 ' + list.length + '개 · ' + totalQ + '문제를 한 번에')
      : ('저장된 모든 과목 ' + subjects.length + '개 · 총 ' + totalQ + '문제를 한 번에');

    const card = document.createElement("div");
    card.className = "card feature-card feature-all";
    const info = document.createElement("div");
    info.innerHTML = '<p class="quiz-item-title"><i class="fa-solid ' + icon + '"></i> ' + escapeHtml(title) + ' 풀기</p><p class="quiz-item-sub">' + subLabel + '</p>';
    card.appendChild(info);
    card.appendChild(statPills(statSummary(statId)));
    const actions = document.createElement("div"); actions.className = "quiz-item-actions";
    const btn = document.createElement("button"); btn.className = "btn"; btn.innerHTML = '<i class="fa-solid fa-play"></i> 시작하기 (' + totalQ + '문제)';
    btn.addEventListener("click", () => playCombined(allTab, title, list, statId, renderAllTab));
    actions.appendChild(btn);
    appendResumeControls(actions, statId, "", () => playCombined(allTab, title, list, statId, renderAllTab, true), renderAllTab);
    card.appendChild(actions);
    allTab.appendChild(card);
  }

  // 전체 초기화 (경고 모달 2회). onDone: 초기화 후 실행할 콜백
  function confirmResetAll(onDone) {
    confirmModal({
      title: "전체 초기화",
      desc: "저장된 <b>모든 퀴즈 · 과목 · 북마크 · 오답 노트 · 통계</b>가 삭제됩니다.<br>이 작업은 <b>되돌릴 수 없습니다.</b>",
      confirmText: "네, 초기화합니다"
    }, () => {
      confirmModal({
        title: "정말 초기화할까요?",
        desc: "모든 데이터가 <b>영구히 삭제</b>됩니다.",
        confirmText: "모두 삭제"
      }, () => {
        [LIB_KEY, SUBJECTS_KEY, BM_KEY, WRONG_KEY, STATS_KEY, DAILY_KEY, RESUME_KEY].forEach(k => localStorage.removeItem(k));
        refreshCounts();
        if (typeof onDone === "function") onDone();
        else renderAllTab();
      });
    });
  }

  function confirmModal(opts, onConfirm) {
    openModal((modal, close) => {
      const h = document.createElement("h3"); h.textContent = opts.title;
      const d = document.createElement("p"); d.className = "modal-desc"; d.innerHTML = opts.desc;
      modal.appendChild(h); modal.appendChild(d);
      const actions = document.createElement("div"); actions.className = "modal-actions";
      const cancel = mkBtn("secondary", "취소"); cancel.addEventListener("click", close);
      const ok = mkBtn("danger-solid", opts.confirmText || "확인");
      ok.addEventListener("click", () => { close(); onConfirm(); });
      actions.appendChild(cancel); actions.appendChild(ok);
      modal.appendChild(actions);
    });
  }

  // ==========================================================
  //  탭: 과목별 풀기
  // ==========================================================
  const subjectsTab = document.getElementById("tab-subjects");

  // 과목 목록 화면 (과목 카드만 표시)
  function renderSubjectsTab() {
    const list = getLibraryList();
    subjectsTab.innerHTML = "";
    subjectsTab.appendChild(uploadBox(true));

    if (list.length === 0) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.innerHTML = '<div class="icon"><i class="fa-solid fa-folder-open"></i></div><p>아직 저장된 과목이 없습니다.</p><small>위에서 퀴즈 파일을 추가하면 과목별로 정리돼요.<br>같은 폴더의 <code>example-quiz.json</code>으로 먼저 시험해 보세요.</small>';
      subjectsTab.appendChild(empty);
      return;
    }

    const head = document.createElement("div");
    head.className = "section-head";
    head.innerHTML = '<h2>과목</h2>';
    const manageBtn = mkBtn("secondary small", '<i class="fa-solid fa-gear"></i> 과목 관리');
    manageBtn.addEventListener("click", openManageSubjectsModal);
    head.appendChild(manageBtn);
    subjectsTab.appendChild(head);

    getSubjects().forEach(subj => {
      const quizzes = list.filter(q => subjectOf(q) === subj);
      const subjQ = quizzes.reduce((n, q) => n + q.questions.length, 0);
      const stat = statSummary("subject:" + subj);

      const card = document.createElement("div");
      card.className = "subject-card";
      const info = document.createElement("div");
      info.innerHTML = '<p class="subject-card-name"><i class="fa-solid fa-folder"></i> ' + escapeHtml(subj) + '</p><p class="quiz-item-sub">' + quizzes.length + '개 파일 · ' + subjQ + '문제' + (stat ? ' · 최근 ' + stat.lastPct + '%' : '') + '</p>';
      const enter = document.createElement("button");
      enter.className = "btn small"; enter.innerHTML = '열기 <i class="fa-solid fa-arrow-right"></i>';
      card.appendChild(info); card.appendChild(enter);
      const open = () => renderSubjectDetail(subj);
      enter.addEventListener("click", open);
      info.style.cursor = "pointer"; info.addEventListener("click", open);
      subjectsTab.appendChild(card);
    });
  }

  // 과목 진입 화면 (과목 전체 풀기 + 파일별 풀기)
  function renderSubjectDetail(subj) {
    const list = getLibraryList().filter(q => subjectOf(q) === subj);
    subjectsTab.innerHTML = "";
    // 과목 자체가 사라졌으면 목록으로
    if (list.length === 0 && getSubjects().indexOf(subj) === -1) { renderSubjectsTab(); return; }

    const back = document.createElement("button");
    back.className = "btn secondary small"; back.innerHTML = '<i class="fa-solid fa-arrow-left"></i> 과목 목록';
    back.style.marginBottom = "14px";
    back.addEventListener("click", renderSubjectsTab);
    subjectsTab.appendChild(back);

    // 빈 과목: 파일 추가 안내
    if (list.length === 0) {
      const title = document.createElement("div");
      title.className = "section-head";
      title.innerHTML = '<h2><i class="fa-solid fa-folder-open"></i> ' + escapeHtml(subj) + '</h2>';
      subjectsTab.appendChild(title);
      subjectsTab.appendChild(uploadBox(true));
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.innerHTML = '<div class="icon"><i class="fa-solid fa-folder-open"></i></div><p>이 과목에는 아직 파일이 없습니다.</p><small>위 버튼으로 퀴즈 파일을 추가하고, 과목 선택에서 <b>' + escapeHtml(subj) + '</b>을(를) 고르세요.</small>';
      subjectsTab.appendChild(empty);
      return;
    }

    const subjQ = list.reduce((n, q) => n + q.questions.length, 0);
    const statId = "subject:" + subj;

    // 과목 전체 풀기 카드
    const card = document.createElement("div");
    card.className = "card feature-card feature-subject";
    const info = document.createElement("div");
    info.innerHTML = '<p class="quiz-item-title"><i class="fa-solid fa-folder-open"></i> ' + escapeHtml(subj) + ' 전체 풀기</p><p class="quiz-item-sub">이 과목의 모든 파일 ' + list.length + '개 · ' + subjQ + '문제를 한 번에</p>';
    card.appendChild(info);
    card.appendChild(statPills(statSummary(statId)));
    const acts = document.createElement("div"); acts.className = "quiz-item-actions";
    const playAll = document.createElement("button"); playAll.className = "btn"; playAll.innerHTML = '<i class="fa-solid fa-play"></i> 과목 전체 풀기 (' + subjQ + '문제)';
    playAll.addEventListener("click", () => playCombined(subjectsTab, subj, list, statId, () => renderSubjectDetail(subj)));
    acts.appendChild(playAll);
    appendResumeControls(acts, statId, "", () => playCombined(subjectsTab, subj, list, statId, () => renderSubjectDetail(subj), true), () => renderSubjectDetail(subj));
    card.appendChild(acts);
    subjectsTab.appendChild(card);

    // 파일별 풀기
    const label = document.createElement("div");
    label.className = "subject-head";
    label.innerHTML = '<span class="subject-name">파일별 풀기</span><span class="subject-count">' + list.length + '개</span>';
    subjectsTab.appendChild(label);

    const allSubjects = getSubjects();
    const sortKey = t => {
      const title = t || "";
      const m = title.match(/day\s*_?\s*(\d+)/i);
      return {
        day: m ? parseInt(m[1], 10) : Number.MAX_SAFE_INTEGER,
        advanced: /advanced/i.test(title) ? 1 : 0,
        title
      };
    };
    const sortedList = list.slice().sort((a, b) => {
      const ka = sortKey(a.title), kb = sortKey(b.title);
      if (ka.day !== kb.day) return ka.day - kb.day;
      if (ka.advanced !== kb.advanced) return ka.advanced - kb.advanced;
      return ka.title.localeCompare(kb.title, "ko", { numeric: true, sensitivity: "base" });
    });
    sortedList.forEach(quiz => subjectsTab.appendChild(quizItemEl(quiz, allSubjects, subj)));
  }

  function statPills(s) {
    const pills = document.createElement("div");
    pills.className = "stat-pills";
    if (s) {
      pills.innerHTML =
        '<span class="pill">시도 ' + s.count + '회</span>' +
        '<span class="pill ' + (s.bestPct >= 80 ? "good" : "") + '">최고 ' + s.bestPct + '%</span>' +
        '<span class="pill ' + (s.lastPct >= 80 ? "good" : (s.lastPct < 60 ? "warn" : "")) + '">최근 ' + s.lastPct + '%</span>' +
        '<span class="pill">평균 ' + s.avgPct + '%</span>';
    } else {
      pills.innerHTML = '<span class="pill">아직 풀지 않음</span>';
    }
    return pills;
  }

  function quizItemEl(quiz, allSubjects, currentSubj) {
    const item = document.createElement("div");
    item.className = "quiz-item";
    const rerender = () => renderSubjectDetail(currentSubj);

    const top = document.createElement("div");
    top.className = "quiz-item-top";
    const info = document.createElement("div");
    const h = document.createElement("p"); h.className = "quiz-item-title"; h.textContent = quiz.title;
    if (quiz.builtin) {
      const badge = document.createElement("span");
      badge.className = "builtin-badge";
      badge.innerHTML = '<i class="fa-solid fa-bolt"></i> 기본 제공';
      badge.title = "페이지가 기본으로 제공하는 퀴즈입니다. 매일 업데이트될 수 있어요.";
      h.appendChild(document.createTextNode(" "));
      h.appendChild(badge);
    }
    info.appendChild(h);
    if (quiz.subtitle) {
      const st = document.createElement("p"); st.className = "quiz-item-subtitle";
      st.textContent = quiz.subtitle;
      info.appendChild(st);
    }
    const sub = document.createElement("p"); sub.className = "quiz-item-sub";
    sub.textContent = quiz.questions.length + "문제 · 추가일 " + fmtDate(quiz.addedAt);
    info.appendChild(sub);
    top.appendChild(info);
    item.appendChild(top);

    item.appendChild(statPills(statSummary(quiz.id)));

    const actions = document.createElement("div");
    actions.className = "quiz-item-actions";
    const playBtn = document.createElement("button"); playBtn.className = "btn small"; playBtn.innerHTML = '<i class="fa-solid fa-play"></i> 풀기';
    playBtn.addEventListener("click", () => playLibraryQuiz(quiz, currentSubj));

    // 과목 변경 선택
    const sel = document.createElement("select");
    sel.className = "subject-select";
    allSubjects.forEach(s => { const o = document.createElement("option"); o.value = s; o.textContent = s; if (s === subjectOf(quiz)) o.selected = true; sel.appendChild(o); });
    const newOpt = document.createElement("option"); newOpt.value = "__new__"; newOpt.textContent = "+ 새 과목 만들기…"; sel.appendChild(newOpt);
    sel.addEventListener("change", () => {
      if (sel.value === "__new__") {
        const name = (prompt("새 과목 이름을 입력하세요:", "") || "").trim();
        if (name) { setQuizSubject(quiz.id, name); refreshCounts(); (name === currentSubj ? rerender() : renderSubjectDetail(currentSubj)); }
        else rerender();
      } else { setQuizSubject(quiz.id, sel.value); refreshCounts(); rerender(); }
    });

    const delBtn = document.createElement("button"); delBtn.className = "btn small danger"; delBtn.textContent = "삭제";
    delBtn.addEventListener("click", () => {
      if (confirm('"' + quiz.title + '" 퀴즈를 삭제할까요?\n(통계도 함께 사라집니다. 북마크·오답 노트는 유지됩니다.)')) {
        deleteQuiz(quiz.id);
        const st = getStats(); delete st[quiz.id]; lsSet(STATS_KEY, st);
        clearResumePoint(quiz.id);
        refreshCounts();
        getLibraryList().some(q => subjectOf(q) === currentSubj) ? rerender() : renderSubjectsTab();
      }
    });
    actions.appendChild(playBtn);
    appendResumeControls(actions, quiz.id, "small", () => playLibraryQuiz(quiz, currentSubj, true), rerender);
    actions.appendChild(sel); actions.appendChild(delBtn);
    item.appendChild(actions);
    return item;
  }

  // ctx에 저장 지점(resume)이 있으면 반영
  function applyResume(ctx, key, resume) {
    if (!resume) return;
    const rp = getResumePoint(key);
    if (rp) { ctx.savedOrder = rp.order; ctx.savedIdx = rp.idx; }
  }
  // 저장 지점이 있으면 actions에 '이어풀기' + '저장 삭제' 버튼 추가
  function appendResumeControls(actionsEl, key, cls, onResume, afterDelete) {
    const rp = getResumePoint(key);
    if (!rp) return;
    const suffix = cls ? " " + cls : "";
    const rb = document.createElement("button");
    rb.className = "btn secondary" + suffix;
    rb.innerHTML = '<i class="fa-solid fa-bookmark"></i> 이어풀기 (' + (rp.idx + 1) + '/' + rp.total + ')';
    rb.addEventListener("click", onResume);
    actionsEl.appendChild(rb);
    const db = document.createElement("button");
    db.className = "btn danger" + suffix;
    db.title = "저장 지점 삭제";
    db.innerHTML = '<i class="fa-solid fa-trash"></i> 저장 지점 삭제';
    db.addEventListener("click", () => { clearResumePoint(key); if (afterDelete) afterDelete(); });
    actionsEl.appendChild(db);
  }
  // 복습 탭(북마크/오답)의 저장 키 (필터 조합별)
  function reviewKey(base, filter) {
    return filter.length ? (base + ":" + filter.slice().sort().join("|")) : base;
  }
  // 저장 데이터가 있을 때 물어보는 모달 (처음부터 / 이어서 / 삭제)
  function askResumeModal(rp, onChoice) {
    openModal((modal, close) => {
      const h = document.createElement("h3"); h.textContent = "저장된 진행 데이터가 있어요";
      const d = document.createElement("p"); d.className = "modal-desc";
      d.innerHTML = "저장 지점: <b>" + (rp.idx + 1) + " / " + rp.total + "</b>번째 문제 · " + fmtDate(rp.savedAt) + "<br>어떻게 시작할까요?";
      modal.appendChild(h); modal.appendChild(d);

      // 1행: 처음부터 / 이어서
      const mainRow = document.createElement("div");
      mainRow.style.cssText = "display:flex;gap:10px;flex-wrap:wrap;justify-content:flex-end;margin-top:20px";
      const fresh = mkBtn("secondary", "처음부터 풀기");
      const resume = mkBtn("", '<i class="fa-solid fa-bookmark"></i> 이어서 풀기');
      const cancel = mkBtn("secondary", "취소");
      fresh.addEventListener("click", () => { close(); onChoice("fresh"); });
      resume.addEventListener("click", () => { close(); onChoice("resume"); });
      cancel.addEventListener("click", () => { close(); onChoice("cancel"); });
      mainRow.appendChild(fresh); mainRow.appendChild(resume); mainRow.appendChild(cancel);
      modal.appendChild(mainRow);

      // 2행: 저장 데이터 삭제 (우측)
      const delRow = document.createElement("div");
      delRow.style.cssText = "display:flex;justify-content:flex-end;margin-top:10px";
      const del = mkBtn("danger small", '<i class="fa-solid fa-trash"></i> 저장 지점 삭제');
      del.addEventListener("click", () => { close(); onChoice("delete"); });
      delRow.appendChild(del);
      modal.appendChild(delRow);
    });
  }

  function playLibraryQuiz(quiz, currentSubj, resume) {
    const ctx = { quizId: quiz.id, quizTitle: quiz.title };
    applyResume(ctx, quiz.id, resume);
    openPlayer(subjectsTab, quiz.title, quiz.questions, ctx, () => renderSubjectDetail(currentSubj));
  }

  // 여러 퀴즈를 합쳐서 풀기 (과목 전체 / 전체 퀴즈)
  function playCombined(container, title, quizzes, statId, onExit, resume) {
    const merged = [];
    quizzes.forEach(qz => qz.questions.forEach(q => merged.push(Object.assign({}, q, { _source: qz.title }))));
    if (merged.length === 0) { alert("풀 수 있는 문제가 없습니다."); return; }
    const ctx = { quizId: statId, quizTitle: title };
    applyResume(ctx, statId, resume);
    openPlayer(container, title, merged, ctx, onExit);
  }

  function setTabsHidden(hidden) {
    const tabs = document.querySelector(".tabs");
    if (tabs) tabs.classList.toggle("hidden", hidden);
  }

  // 복습 화면(북마크/오답 노트)에서 메인으로 돌아가는 버튼 영역
  function backHomeRow() {
    const row = document.createElement("div");
    row.className = "exit-row";
    const btn = document.createElement("button");
    btn.className = "btn secondary small";
    btn.innerHTML = '<i class="fa-solid fa-arrow-left"></i> 돌아가기';
    btn.addEventListener("click", goHome);
    row.appendChild(btn);
    return row;
  }

  function openPlayer(container, title, questions, ctx, onExit) {
    container.innerHTML = "";
    setTabsHidden(true); // 문제풀기 화면에서는 탭 버튼 숨김
    const wrappedExit = onExit ? () => { setTabsHidden(false); onExit(); } : null;
    const head = document.createElement("div");
    head.className = "section-head";
    const h = document.createElement("h2"); h.textContent = title + " · " + questions.length + "문제";
    head.appendChild(h);
    container.appendChild(head);
    const player = document.createElement("div");
    container.appendChild(player);
    QuizPlayer(player, questions, {
      quizId: ctx.quizId, quizTitle: ctx.quizTitle,
      savedOrder: ctx.savedOrder || null,
      savedIdx: ctx.savedIdx || 0,
      onExit: wrappedExit,
      onChange: () => refreshCounts()
    });
    window.scrollTo(0, 0);
  }

  // ==========================================================
  //  탭: 복습 (북마크 / 오답 노트 공용)
  // ==========================================================
  // cfg: { tab, getList, storageKey, baseKey, getFilter, setFilter,
  //        emptyHtml, headHtml(n), clearConfirm, quizTitle, hintText?, rerender }
  function renderReviewTab(cfg, promptResume) {
    const fullList = cfg.getList();
    cfg.tab.innerHTML = "";
    if (fullList.length === 0) {
      setTabsHidden(false);
      cfg.tab.innerHTML = cfg.emptyHtml;
      return;
    }
    setTabsHidden(true); // 복습 화면에서는 탭 버튼 숨김

    // 과목 필터 (역추적, 복수 선택)
    const map = buildQuestionSubjectMap();
    const subjects = subjectsInItems(fullList, map);
    const filter = cfg.getFilter().filter(s => subjects.indexOf(s) !== -1);
    cfg.setFilter(filter);
    const list = filter.length ? fullList.filter(it => filter.indexOf(itemSubject(it, map)) !== -1) : fullList;
    const key = reviewKey(cfg.baseKey, filter);

    const head = document.createElement("div");
    head.className = "section-head";
    head.innerHTML = cfg.headHtml(list.length);
    const clr = document.createElement("button"); clr.className = "btn secondary small"; clr.textContent = "전체 삭제";
    clr.addEventListener("click", () => { if (confirm(cfg.clearConfirm)) { lsSet(cfg.storageKey, {}); clearResumePoint(key); refreshCounts(); cfg.rerender(); } });
    head.appendChild(clr);
    cfg.tab.appendChild(head);

    if (cfg.hintText) {
      const hint = document.createElement("p");
      hint.style.cssText = "color:var(--muted);font-size:13px;margin:0 0 14px";
      hint.textContent = cfg.hintText;
      cfg.tab.appendChild(hint);
    }

    if (subjects.length > 1) {
      cfg.tab.appendChild(makeFilterBar(subjects, filter, v => { cfg.setFilter(v); cfg.rerender(); }));
    }

    const playerWrap = document.createElement("div");
    cfg.tab.appendChild(playerWrap);
    cfg.tab.appendChild(backHomeRow());

    function startPlayer(resume) {
      playerWrap.innerHTML = "";
      const player = document.createElement("div");
      playerWrap.appendChild(player);
      const ctx = { quizTitle: cfg.quizTitle, saveKey: key, onChange: () => { refreshCounts(); if (cfg.getList().length === 0) cfg.rerender(); } };
      if (resume) { const rp = getResumePoint(key); if (rp) { ctx.savedOrder = rp.order; ctx.savedIdx = rp.idx; } }
      const sourced = list.map(it => it.quizTitle ? Object.assign({}, it, { _source: it.quizTitle }) : it);
      QuizPlayer(player, sourced, ctx);
    }
    startPlayer(false);

    const rp = getResumePoint(key);
    if (promptResume && rp) {
      askResumeModal(rp, choice => {
        if (choice === "resume") startPlayer(true);
        else if (choice === "delete") clearResumePoint(key);
        else if (choice === "cancel") goHome(); // 탭 진입 취소 → 메인으로
        // fresh: 이미 처음부터 렌더된 상태
      });
    }
  }

  // ---------- 탭: 북마크 ----------
  const bmTab = document.getElementById("tab-bookmark");
  function renderBookmarkTab(promptResume) {
    renderReviewTab({
      tab: bmTab,
      getList: getBookmarkList,
      storageKey: BM_KEY,
      baseKey: "bookmark",
      getFilter: () => bmFilter,
      setFilter: v => { bmFilter = v; },
      emptyHtml: '<div class="empty"><div class="icon"><i class="fa-regular fa-star"></i></div><p>아직 북마크한 문제가 없습니다.</p><small>퀴즈를 풀면서 <i class="fa-regular fa-star"></i> 북마크 버튼을 눌러 중요한 문제를 저장하세요.</small></div>',
      headHtml: n => '<h2><i class="fa-solid fa-star"></i> 북마크한 문제 (' + n + ')</h2>',
      clearConfirm: "북마크를 모두 삭제할까요?",
      quizTitle: "북마크",
      rerender: () => renderBookmarkTab()
    }, promptResume);
  }

  // ---------- 탭: 오답 노트 ----------
  const wrongTab = document.getElementById("tab-wrong");
  function renderWrongTab(promptResume) {
    renderReviewTab({
      tab: wrongTab,
      getList: getWrongList,
      storageKey: WRONG_KEY,
      baseKey: "wrong",
      getFilter: () => wrongFilter,
      setFilter: v => { wrongFilter = v; },
      emptyHtml: '<div class="empty"><div class="icon"><i class="fa-solid fa-clipboard-list"></i></div><p>오답 노트가 비어 있습니다.</p><small>퀴즈를 풀다 틀린 문제가 자동으로 여기에 모여요.<br>다시 풀어서 정답을 맞히면 목록에서 자동으로 사라집니다.</small></div>',
      headHtml: n => '<h2><i class="fa-solid fa-clipboard-list"></i> 오답 노트 (' + n + ')</h2>',
      clearConfirm: "오답 노트를 모두 비울까요?",
      quizTitle: "오답 노트",
      hintText: "틀린 횟수가 많은 문제부터 정렬됩니다. 정답을 맞히면 자동으로 제거돼요.",
      rerender: () => renderWrongTab()
    }, promptResume);
  }

  // ==========================================================
  //  전용 통계 화면
  // ==========================================================
  function openStatsScreen() {
    const overlay = document.createElement("div");
    overlay.className = "stats-overlay";
    document.body.appendChild(overlay);
    const prevBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function close() {
      overlay.remove();
      document.body.style.overflow = prevBodyOverflow;
      document.removeEventListener("keydown", onEsc);
    }
    function onEsc(e) { if (e.key === "Escape") close(); }
    document.addEventListener("keydown", onEsc);

    function draw() {
      const daily = getDaily();
      const hideAcc = !!getPrefs().hideAccuracy;
      const hideTodaySubj = !!getPrefs().hideTodaySubjects;

      // 전체 요약
      const allKeys = Object.keys(daily).sort();
      let totalSolved = 0, totalCorrect = 0;
      allKeys.forEach(k => { totalSolved += daily[k].total; totalCorrect += daily[k].correct; });
      const studyDays = allKeys.length;
      const overallAcc = totalSolved ? Math.round((totalCorrect / totalSolved) * 100) : 0;

      overlay.innerHTML = "";
      const inner = document.createElement("div");
      inner.className = "stats-inner";

      // 상단 바
      const topbar = document.createElement("div");
      topbar.className = "stats-topbar";
      const backBtn = mkBtn("secondary small", '<i class="fa-solid fa-arrow-left"></i> 닫기');
      backBtn.addEventListener("click", close);
      const title = document.createElement("h2");
      title.innerHTML = '<i class="fa-solid fa-chart-column"></i> 학습 통계';
      topbar.appendChild(backBtn);
      topbar.appendChild(title);
      inner.appendChild(topbar);

      // ---- 화면 설정 섹션 (테마 · 색상 · 폰트) : 통계 맨 아래 배치 ----
      function displaySettingsEl() {
        const curColor = lsGet(COLOR_KEY, "default");
        const curFont = lsGet(FONT_KEY, "default");
        const curSize = clampFontSize(lsGet(FONTSIZE_KEY, 100));
        const macOn = isMacSkin();

        const sec = document.createElement("div");
        sec.className = "chart-card display-settings";
        sec.innerHTML =
          '<div class="chart-card-head"><h3><i class="fa-solid fa-sliders"></i> 화면 설정</h3></div>' +
          '<div class="ds-row">' +
            '<span class="ds-label"><i class="fa-brands fa-apple"></i> Mac OS 스타일</span>' +
            '<label class="toggle ' + (macOn ? "on" : "") + '" id="dsMac"><span class="switch"></span>' + (macOn ? "켜짐" : "꺼짐") + '</label>' +
          '</div>' +
          '<div class="ds-row">' +
            '<span class="ds-label"><i class="fa-solid fa-palette"></i> 컬러 테마</span>' +
            '<select class="ds-select" id="dsColor">' + colorOptionsHtml(curColor) + '</select>' +
          '</div>' +
          '<div class="ds-row">' +
            '<span class="ds-label"><i class="fa-solid fa-font"></i> 폰트</span>' +
            '<select class="ds-select" id="dsFont">' + fontOptionsHtml(curFont) + '</select>' +
          '</div>' +
          '<div class="ds-row">' +
            '<span class="ds-label"><i class="fa-solid fa-text-height"></i> 폰트 크기 <b id="dsSizeVal">' + curSize + '%</b></span>' +
            '<input type="range" class="ds-range" id="dsSize" min="80" max="140" step="5" value="' + curSize + '">' +
          '</div>';

        sec.querySelector("#dsMac").addEventListener("click", () => {
          const nowMac = !isMacSkin();
          setSkin(nowMac ? "macos" : "default");
          const t = sec.querySelector("#dsMac");
          t.classList.toggle("on", nowMac);
          t.lastChild.textContent = nowMac ? "켜짐" : "꺼짐";
        });
        sec.querySelector("#dsColor").addEventListener("change", e => setColor(e.target.value));
        sec.querySelector("#dsFont").addEventListener("change", e => setFont(e.target.value));
        const sizeInput = sec.querySelector("#dsSize");
        const sizeVal = sec.querySelector("#dsSizeVal");
        sizeInput.addEventListener("input", () => { sizeVal.textContent = setFontSize(sizeInput.value) + "%"; });

        return sec;
      }

      // 전체 데이터 삭제 버튼 영역 (맨 아래)
      function resetRowEl() {
        const resetRow = document.createElement("div");
        resetRow.style.cssText = "display:flex;justify-content:flex-end;margin-top:28px";
        const resetBtn = mkBtn("danger-solid small", '<i class="fa-solid fa-triangle-exclamation"></i> 전체 데이터 삭제');
        resetBtn.addEventListener("click", () => confirmResetAll(() => { close(); goHome(); }));
        resetRow.appendChild(resetBtn);
        return resetRow;
      }

      // 데이터 없음
      if (studyDays === 0) {
        const empty = document.createElement("div");
        empty.className = "empty";
        empty.innerHTML = '<div class="icon"><i class="fa-solid fa-chart-column"></i></div><p>아직 학습 기록이 없습니다.</p><small>퀴즈를 풀면 날짜별 학습량과 정답률이 여기에 쌓여요.</small>';
        inner.appendChild(empty);
        inner.appendChild(displaySettingsEl());
        inner.appendChild(resetRowEl());
        overlay.appendChild(inner);
        window.scrollTo(0, 0);
        return;
      }

      // 정답률 숨김 토글
      const tgWrap = document.createElement("div");
      tgWrap.className = "toggles";
      tgWrap.style.margin = "0 0 18px";
      tgWrap.innerHTML =
        '<label class="toggle ' + (hideAcc ? "on" : "") + '" id="accToggle">' +
        '<span class="switch"></span>' +
        '<i class="fa-solid ' + (hideAcc ? "fa-eye-slash" : "fa-eye") + '"></i> 정답률 숨기기</label>' +
        '<label class="toggle ' + (hideTodaySubj ? "on" : "") + '" id="subjToggle">' +
        '<span class="switch"></span>' +
        '<i class="fa-solid ' + (hideTodaySubj ? "fa-eye-slash" : "fa-eye") + '"></i> 오늘 과목 숨기기</label>';
      tgWrap.querySelector("#accToggle").addEventListener("click", () => {
        setPref("hideAccuracy", !hideAcc);
        draw();
      });
      tgWrap.querySelector("#subjToggle").addEventListener("click", () => {
        setPref("hideTodaySubjects", !hideTodaySubj);
        draw();
      });
      inner.appendChild(tgWrap);

      // 요약 카드
      const grid = document.createElement("div");
      grid.className = "summary-grid";
      let gridHtml =
        '<div class="summary-box"><div class="num">' + studyDays + '</div><div class="lbl">학습한 날</div></div>' +
        '<div class="summary-box"><div class="num">' + totalSolved + '</div><div class="lbl">푼 문제 수</div></div>';
      if (!hideAcc) {
        gridHtml += '<div class="summary-box"><div class="num">' + overallAcc + '%</div><div class="lbl">전체 정답률</div></div>';
      } else {
        gridHtml += '<div class="summary-box"><div class="num"><i class="fa-solid fa-lock lock-num"></i></div><div class="lbl">전체 정답률</div></div>';
      }
      grid.innerHTML = gridHtml;
      inner.appendChild(grid);

      // 오늘의 학습
      const todayKey = dayKey(Date.now());
      const td = daily[todayKey] || { total: 0, correct: 0, subjects: {} };
      const todayAcc = td.total ? Math.round((td.correct / td.total) * 100) : 0;
      const todayCard = document.createElement("div");
      todayCard.className = "chart-card today-card";
      let todayHtml =
        '<div class="chart-card-head"><h3><i class="fa-solid fa-calendar-day"></i> 오늘의 학습</h3>' +
        '<span class="today-date">' + todayKey.replace(/-/g, ".") + '</span></div>';
      if (td.total === 0) {
        todayHtml += '<p class="today-empty">아직 오늘 푼 문제가 없어요. 한 문제라도 풀어볼까요?</p>';
      } else {
        todayHtml += '<div class="today-stats">' +
          '<div class="today-stat"><div class="t-num">' + td.total + '</div><div class="t-lbl">푼 문제</div></div>';
        if (!hideAcc) {
          todayHtml += '<div class="today-stat"><div class="t-num">' + td.correct + '</div><div class="t-lbl">맞힌 문제</div></div>' +
            '<div class="today-stat"><div class="t-num ' + (todayAcc >= 80 ? "good" : (todayAcc < 60 ? "warn" : "")) + '">' + todayAcc + '%</div><div class="t-lbl">정답률</div></div>';
        } else {
          todayHtml += '<div class="today-stat"><div class="t-num"><i class="fa-solid fa-lock lock-num"></i></div><div class="t-lbl">정답률</div></div>';
        }
        todayHtml += '</div>';

        // 오늘 푼 과목
        todayHtml += '<div class="today-subjects">';
        if (hideTodaySubj) {
          todayHtml += '<div class="today-subjects-title"><i class="fa-solid fa-folder"></i> 오늘 푼 과목</div>' +
            '<span class="subject-tag locked"><i class="fa-solid fa-lock"></i> 숨김</span>';
        } else {
          const subjEntries = Object.keys(td.subjects || {}).sort((a, b) => td.subjects[b] - td.subjects[a]);
          todayHtml += '<div class="today-subjects-title"><i class="fa-solid fa-folder"></i> 오늘 푼 과목 (' + subjEntries.length + ')</div>';
          if (subjEntries.length === 0) {
            todayHtml += '<span class="today-empty">기록된 과목이 없습니다.</span>';
          } else {
            todayHtml += '<div class="subject-tags">' +
              subjEntries.map(s => '<span class="subject-tag"><i class="fa-solid fa-folder"></i> ' + escapeHtml(s) + ' <b>' + td.subjects[s] + '</b></span>').join("") +
              '</div>';
          }
        }
        todayHtml += '</div>';
      }
      todayCard.innerHTML = todayHtml;
      inner.appendChild(todayCard);

      // 최근 30일 막대그래프
      const N = 30;
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const days = [];
      for (let i = N - 1; i >= 0; i--) {
        const d = new Date(today); d.setDate(d.getDate() - i);
        const k = dayKey(d.getTime());
        days.push({ key: k, label: (d.getMonth() + 1) + "/" + d.getDate(), data: daily[k] || { total: 0, correct: 0 } });
      }
      const maxT = Math.max(1, ...days.map(x => x.data.total));

      const chartCard = document.createElement("div");
      chartCard.className = "chart-card";
      chartCard.innerHTML = '<div class="chart-card-head"><h3>최근 30일 학습량</h3></div>';
      const chart = document.createElement("div");
      chart.className = "bar-chart";
      days.forEach(x => {
        const col = document.createElement("div");
        col.className = "bar-col";
        const h = Math.round((x.data.total / maxT) * 100);
        const acc = x.data.total ? Math.round((x.data.correct / x.data.total) * 100) : 0;
        col.title = x.key + " · " + x.data.total + "문제" + (hideAcc || !x.data.total ? "" : " · 정답률 " + acc + "%");
        col.innerHTML =
          '<span class="bar-val">' + (x.data.total || "") + '</span>' +
          '<div class="bar-wrap"><div class="bar ' + (x.data.total ? "" : "empty") + '" style="height:' + (x.data.total ? h : 0) + '%"></div></div>' +
          '<span class="bar-day">' + x.label + '</span>';
        chart.appendChild(col);
      });
      chartCard.appendChild(chart);
      inner.appendChild(chartCard);

      // 일별 상세 목록 (최근 날짜부터)
      const listCard = document.createElement("div");
      listCard.className = "chart-card";
      listCard.innerHTML = '<div class="chart-card-head"><h3>날짜별 상세</h3></div>';
      const activeDays = allKeys.slice().reverse();
      const maxActive = Math.max(1, ...activeDays.map(k => daily[k].total));
      activeDays.forEach(k => {
        const dd = daily[k];
        const acc = dd.total ? Math.round((dd.correct / dd.total) * 100) : 0;
        const fill = Math.round((dd.total / maxActive) * 100);
        const row = document.createElement("div");
        row.className = "day-row";
        let rowHtml =
          '<span class="d-date">' + k.slice(5).replace("-", ".") + '</span>' +
          '<div class="d-bar"><div class="d-fill" style="width:' + fill + '%"></div></div>' +
          '<span class="d-count">' + dd.total + '문제</span>';
        if (!hideAcc) {
          const cls = acc >= 80 ? "good" : (acc < 60 ? "warn" : "");
          rowHtml += '<span class="d-acc ' + cls + '">' + acc + '%</span>';
        }
        row.innerHTML = rowHtml;
        listCard.appendChild(row);
      });
      inner.appendChild(listCard);
      inner.appendChild(displaySettingsEl());
      inner.appendChild(resetRowEl());

      overlay.appendChild(inner);
      window.scrollTo(0, 0);
    }

    draw();
  }
  document.getElementById("statsToggle").addEventListener("click", openStatsScreen);

  // 메인(과목별 풀기) 화면으로 이동
  function goHome() {
    setTabsHidden(false);
    tabBtns.forEach(b => b.classList.toggle("active", b.dataset.tab === "subjects"));
    document.querySelectorAll(".tab-panel").forEach(p => p.classList.toggle("active", p.id === "tab-subjects"));
    if (currentKeydown) { document.removeEventListener("keydown", currentKeydown); currentKeydown = null; }
    renderSubjectsTab();
    window.scrollTo(0, 0);
  }
  // 제목 클릭 시 메인으로 이동
  document.getElementById("homeTitle").addEventListener("click", goHome);

  // ==========================================================
  //  탭 전환
  // ==========================================================
  const tabBtns = document.querySelectorAll(".tab-btn");
  tabBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      tabBtns.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      document.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active"));
      document.getElementById("tab-" + btn.dataset.tab).classList.add("active");
      if (currentKeydown) { document.removeEventListener("keydown", currentKeydown); currentKeydown = null; }
      if (btn.dataset.tab === "all") renderAllTab();
      else if (btn.dataset.tab === "subjects") renderSubjectsTab();
      else if (btn.dataset.tab === "bookmark") renderBookmarkTab(true);
      else if (btn.dataset.tab === "wrong") renderWrongTab(true);
    });
  });

  // ---------- 테마 (다크/라이트) ----------
  const THEME_KEY = "quiz_theme_v1";
  function applyTheme(t) {
    document.documentElement.setAttribute("data-theme", t);
    const btn = document.getElementById("themeToggle");
    if (btn) btn.innerHTML = (t === "light") ? '<i class="fa-solid fa-moon"></i>' : '<i class="fa-solid fa-sun"></i>';
  }
  let theme = lsGet(THEME_KEY, "dark");
  applyTheme(theme);
  document.getElementById("themeToggle").addEventListener("click", () => {
    theme = (theme === "light") ? "dark" : "light";
    lsSet(THEME_KEY, theme);
    applyTheme(theme);
  });

  // ---------- 디자인 스킨 (Mac OS 클래식) ----------
  const SKIN_KEY = "quiz_skin_v1";
  function isMacSkin() { return document.documentElement.getAttribute("data-skin") === "macos"; }
  function applySkin(s) { document.documentElement.setAttribute("data-skin", s === "macos" ? "macos" : "default"); }
  function setSkin(s) { lsSet(SKIN_KEY, s); applySkin(s); }
  applySkin(lsGet(SKIN_KEY, "default"));

  // ---------- 컬러 테마 (기본/Mac OS 공통 적용) ----------
  const COLOR_KEY = "quiz_color_v1";
  const COLOR_THEMES = [
    { id: "default", label: "기본 색상" },
    { id: "pink", label: "핑크" },
    { id: "sky", label: "하늘" },
    { id: "mint", label: "민트" },
    { id: "mono", label: "흑백" }
  ];
  function applyColor(c) {
    if (c && c !== "default") document.documentElement.setAttribute("data-color", c);
    else document.documentElement.removeAttribute("data-color");
  }
  function setColor(c) { lsSet(COLOR_KEY, c); applyColor(c); }
  applyColor(lsGet(COLOR_KEY, "default"));
  function colorOptionsHtml(cur) {
    return COLOR_THEMES.map(t =>
      '<option value="' + t.id + '"' + (t.id === cur ? " selected" : "") + '>' + t.label + '</option>'
    ).join("");
  }

  // ---------- 폰트 (기본/Mac OS 공통 적용) ----------
  const FONT_KEY = "quiz_font_v1";
  const FONTSIZE_KEY = "quiz_fontsize_v1";
  const FONT_FALLBACK = ", 'Malgun Gothic', sans-serif";
  // 폰트 종류(카테고리)별로 정렬해서 표시
  const FONT_CATS = ["산세리프", "명조", "픽셀"];
  const FONTS = [
    { id: "default", label: "기본", cat: "" },
    { id: "Pretendard", label: "프리텐다드", cat: "산세리프" },
    { id: "Suit", label: "수트(SUIT)", cat: "산세리프" },
    { id: "NanumSquareNeo", label: "나눔스퀘어 네오", cat: "산세리프" },
    { id: "Escoredream", label: "에스코어 드림", cat: "산세리프" },
    { id: "OneStoreMobileGothicBody", label: "원스토어 모바일고딕", cat: "산세리프" },
    { id: "ChosunIlboMyungjo", label: "조선일보 명조", cat: "명조" },
    { id: "Ridibatang", label: "리디바탕", cat: "명조" },
    { id: "Galmuri11", label: "갈무리11", cat: "픽셀" },
    { id: "RoundedFixedsys", label: "둥근모꼴", cat: "픽셀" }
  ];
  function applyFont(id) {
    if (id && id !== "default") document.documentElement.style.setProperty("--app-font", "'" + id + "'" + FONT_FALLBACK);
    else document.documentElement.style.removeProperty("--app-font");
  }
  function setFont(id) { lsSet(FONT_KEY, id); applyFont(id); }
  applyFont(lsGet(FONT_KEY, "default"));
  function fontOptionsHtml(cur) {
    let html = FONTS.filter(f => f.cat === "").map(f =>
      '<option value="' + f.id + '"' + (f.id === cur ? " selected" : "") + '>' + f.label + '</option>'
    ).join("");
    FONT_CATS.forEach(cat => {
      const items = FONTS.filter(f => f.cat === cat);
      if (!items.length) return;
      html += '<optgroup label="' + cat + '">' +
        items.map(f => '<option value="' + f.id + '" style="font-family:\'' + f.id + '\'' + FONT_FALLBACK + '"' + (f.id === cur ? " selected" : "") + '>' + f.label + '</option>').join("") +
        '</optgroup>';
    });
    return html;
  }
  function clampFontSize(v) { let p = parseInt(v, 10); if (isNaN(p)) p = 100; if (p < 80) p = 80; if (p > 140) p = 140; return p; }
  function applyFontSize(pct) {
    const p = clampFontSize(pct);
    document.documentElement.style.zoom = String(p / 100);
    return p;
  }
  function setFontSize(pct) { const p = applyFontSize(pct); lsSet(FONTSIZE_KEY, p); return p; }
  applyFontSize(lsGet(FONTSIZE_KEY, 100));

  // ==========================================================
  //  기본 제공 문제 (quizzes/manifest.json) 자동 로딩·동기화
  //  - 페이지가 기본으로 제공하는 퀴즈를 방문자 브라우저에서 자동으로 불러옴
  //  - manifest / 각 파일을 커밋(push)하면 다음 방문 시 자동 반영(매일 업데이트)
  //  - builtin:true 로 표시하여 사용자가 직접 올린 퀴즈와 구분
  // ==========================================================
  const MANIFEST_URL = "quizzes/manifest.json";

  function encodePath(p) { return p.split("/").map(encodeURIComponent).join("/"); }
  function bust(url) { return url + (url.indexOf("?") === -1 ? "?" : "&") + "t=" + Date.now(); }

  async function fetchJson(url) {
    const res = await fetch(bust(url), { cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    return res.json();
  }

  // 더 이상 목록에 없는 기본 제공 퀴즈 제거 (사용자가 올린 퀴즈는 보존)
  function pruneBuiltins(keepIds) {
    const lib = getLibrary();
    let changed = false;
    Object.keys(lib).forEach(id => {
      if (lib[id] && lib[id].builtin && !keepIds[id]) { delete lib[id]; changed = true; }
    });
    if (changed) lsSet(LIB_KEY, lib);
    return changed;
  }

  async function syncBuiltinQuizzes() {
    let manifest;
    try {
      manifest = await fetchJson(MANIFEST_URL);
    } catch (e) {
      // manifest 없음 / file:// 로 직접 열람 / 오프라인 → 조용히 건너뜀 (사용자 업로드 기능은 그대로 동작)
      return false;
    }
    let files = Array.isArray(manifest) ? manifest : (manifest && (manifest.quizzes || manifest.files));
    if (!Array.isArray(files)) files = [];

    const loaded = await Promise.all(files.map(async entry => {
      const file = (typeof entry === "string") ? entry : (entry && (entry.file || entry.path));
      if (!file) return null;
      const subjectOverride = (typeof entry === "object" && entry.subject) ? String(entry.subject).trim() : "";
      const url = file.indexOf("/") === -1 ? "quizzes/" + file : file;
      try {
        const data = await fetchJson(encodePath(url));
        const questions = Array.isArray(data) ? data : (data && data.questions);
        if (validate(questions)) return null;
        return {
          title: (data && data.title) ? data.title : file.replace(/\.json$/i, ""),
          subtitle: (data && data.subtitle) ? String(data.subtitle).trim() : "",
          subject: subjectOverride || (data && data.subject ? String(data.subject).trim() : DEFAULT_SUBJECT),
          description: (data && data.description) || "",
          questions: questions
        };
      } catch (e) { return null; }
    }));

    const valid = loaded.filter(Boolean);
    const keepIds = {};
    valid.forEach(p => {
      const id = hashId(p.title);
      keepIds[id] = true;
      const existing = getLibrary()[id];
      saveQuiz({
        id: id,
        title: p.title,
        subtitle: p.subtitle,
        subject: p.subject,
        description: p.description,
        questions: p.questions,
        builtin: true,
        addedAt: existing ? existing.addedAt : Date.now(),
        updatedAt: Date.now()
      });
    });
    const pruned = pruneBuiltins(keepIds);
    return valid.length > 0 || pruned;
  }

  // 초기 렌더
  refreshCounts();
  renderSubjectsTab();

  // 기본 제공 문제 동기화 후, 메인 화면이면 다시 그려서 즉시 반영
  syncBuiltinQuizzes().then(syncChanged => {
    // 동기화로 라이브러리가 갱신된 뒤, 삭제된 문제가 북마크·오답 노트에 남아 있으면 정리
    const reviewChanged = reconcileReview();
    if (!syncChanged && !reviewChanged) return;
    refreshCounts();
    const active = document.querySelector(".tab-btn.active");
    const activeTab = active && active.dataset.tab;
    if (activeTab === "subjects") renderSubjectsTab();
    else if (activeTab === "bookmark") renderBookmarkTab(true);
    else if (activeTab === "wrong") renderWrongTab(true);
  });
})();