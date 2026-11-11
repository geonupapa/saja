(() => {
  "use strict";

  const STORE_KEY = "saja-progress-v1";
  const $app = document.getElementById("app");
  const $modal = document.getElementById("modal");
  const $modalBody = document.getElementById("modalBody");
  const canSpeak = "speechSynthesis" in window;

  // ---------- 저장 ----------
  const fresh = () => ({ unlocked: 1, completed: {}, seen: {}, known: {}, weak: {}, stars: 0, pos: 0 });
  let state = load();

  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(STORE_KEY));
      if (s && typeof s.unlocked === "number") return Object.assign(fresh(), s);
    } catch (e) { /* 저장소를 쓸 수 없으면 새로 시작 */ }
    return fresh();
  }
  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* 무시 */ }
  }

  // ---------- 날짜 ----------
  function todayStr() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  // 전날까지 끝낸 공부가 있으면 오늘 새 카드 5장을 연다
  function refreshUnlock() {
    const last = state.unlocked - 1;
    const done = state.completed[last];
    if (done && done.date < todayStr() && state.unlocked < TOTAL_DAYS) {
      state.unlocked += 1;
      state.pos = 0;
      save();
    }
  }

  // ---------- 도우미 ----------
  const dayIdx = () => state.unlocked - 1;
  const itemsOfDay = (d) => IDIOMS.slice(d * PER_DAY, d * PER_DAY + PER_DAY);
  const learnedItems = () => IDIOMS.slice(0, state.unlocked * PER_DAY);
  const shuffle = (arr) => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  const pick = (arr, n) => shuffle(arr).slice(0, n);

  function speak(text) {
    if (!canSpeak) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "ko-KR";
    u.rate = 0.85;
    const ko = window.speechSynthesis.getVoices().find((v) => v.lang && v.lang.startsWith("ko"));
    if (ko) u.voice = ko;
    window.speechSynthesis.speak(u);
  }

  function confetti() {
    const box = document.getElementById("confetti");
    const bits = ["⭐", "🎉", "🌟", "💛", "🎈", "✨"];
    for (let i = 0; i < 36; i++) {
      const el = document.createElement("i");
      el.textContent = bits[i % bits.length];
      el.style.left = Math.random() * 100 + "vw";
      el.style.animationDuration = 1.8 + Math.random() * 1.6 + "s";
      el.style.animationDelay = Math.random() * 0.5 + "s";
      box.appendChild(el);
      setTimeout(() => el.remove(), 4200);
    }
  }

  // ---------- 화면 상태 ----------
  let view = "today";
  let mode = "cards"; // cards | quiz | done
  let flipped = false;
  let quiz = null;
  let reviewFilter = "all";
  let modalItem = null;
  let modalFlipped = false;

  // ---------- 카드 ----------
  function cardHTML(it, { num, isFlipped }) {
    const syl = [...it.w].map((c) => `<span class="syl">${c}</span>`).join("");
    const hj = [...it.h].map((c, i) => `<div class="hj"><b>${c}</b><span>${it.hun[i]}</span></div>`).join("");
    const ex = it.ex.split(it.w).join(`<mark>${it.w}</mark>`);
    const spk = canSpeak ? `<button class="speak" data-act="say" data-id="${it.id}" aria-label="읽어 주기">🔊</button>` : "";
    return `
      <div class="card-wrap">
        <div class="card ${isFlipped ? "flipped" : ""}" data-act="flip" role="button" aria-label="카드 뒤집기">
          <div class="face front">
            ${num ? `<span class="card-num">${num}</span>` : ""}
            ${spk}
            <div class="big-emoji">${it.e}</div>
            <div class="syllables">${syl}</div>
            <div class="hanja-line">${it.h}</div>
            <div class="tap-hint">👆 카드를 누르면 뜻이 나와요</div>
          </div>
          <div class="face back">
            <div class="back-head">
              <div class="back-title"><small>${it.e}</small>${it.w}</div>
              ${canSpeak ? `<button class="speak" data-act="sayall" data-id="${it.id}" aria-label="뜻 읽어 주기">🔊</button>` : ""}
            </div>
            <div class="hanja-grid">${hj}</div>
            <div class="box lit"><h4>🔍 글자 그대로 풀면</h4><p>${it.lit}</p></div>
            <div class="box mean"><h4>💡 이런 뜻이에요</h4><p>${it.m}</p></div>
            <div class="box ex"><h4>✏️ 이렇게 써요</h4><p>${ex}</p></div>
          </div>
        </div>
      </div>`;
  }

  // ---------- 오늘 공부 ----------
  function renderToday() {
    const d = dayIdx();
    const items = itemsOfDay(d);
    const allDone = state.completed[TOTAL_DAYS - 1];

    if (mode === "quiz") return renderQuiz();

    if (state.completed[d] && mode !== "cards-again") {
      if (allDone) {
        $app.innerHTML = `
          <div class="panel">
            <div class="huge">🏆</div>
            <h2>사자성어 박사 탄생!</h2>
            <p>사자성어 ${IDIOMS.length}개를 모두 공부했어요.<br>정말 대단해요!</p>
            <p class="muted">복습 탭에서 다시 보며 잊지 않게 해요.</p>
          </div>
          <button class="btn primary block" data-act="go-review">🔁 복습하러 가기</button>`;
        return;
      }
      const sc = state.completed[d].score;
      $app.innerHTML = `
        <div class="panel">
          <div class="huge">🎉</div>
          <h2>오늘 공부 끝!</h2>
          <p>오늘 퀴즈에서 <b>${sc}개</b> 맞혔어요.</p>
          <p>내일 새로운 카드 <b>5장</b>이 기다려요.<br>내일 또 만나요! 👋</p>
        </div>
        <div class="row">
          <button class="btn" data-act="again-cards">📖 오늘 카드 다시 보기</button>
          <button class="btn primary" data-act="go-review">🔁 복습하기</button>
        </div>`;
      return;
    }

    const pos = Math.min(state.pos, items.length - 1);
    const it = items[pos];
    const allSeen = items.every((x) => state.seen[x.id]);
    const dots = items.map((x, i) => {
      const cls = state.known[x.id] ? "known" : state.seen[x.id] ? "seen" : "";
      return `<button class="dot ${cls} ${i === pos ? "current" : ""}" data-act="goto" data-i="${i}" aria-label="${i + 1}번째 카드">${state.known[x.id] ? "✓" : i + 1}</button>`;
    }).join("");

    const firstTime = d === 0 && !Object.keys(state.seen).length;

    $app.innerHTML = `
      ${firstTime ? `<div class="panel"><p>👋 안녕! 사자성어는 <b>네 글자로 된 지혜로운 말</b>이에요.<br>카드를 눌러 뜻을 보고, 다 외우면 퀴즈를 풀어요!</p></div>` : ""}
      <div class="progress">${dots}</div>
      ${cardHTML(it, { num: `${pos + 1} / ${items.length}`, isFlipped: flipped })}
      ${flipped ? `
        <div class="row">
          <button class="btn again" data-act="weak">🔁 한 번 더 볼래요</button>
          <button class="btn good" data-act="know">😊 외웠어요!</button>
        </div>` : `
        <div class="row">
          <button class="btn nav-arrow" data-act="prev" ${pos === 0 ? "disabled" : ""} aria-label="이전 카드">◀</button>
          <button class="btn primary" data-act="flip">🙌 뜻 보기</button>
          <button class="btn nav-arrow" data-act="next" ${pos === items.length - 1 ? "disabled" : ""} aria-label="다음 카드">▶</button>
        </div>`}
      <div class="row">
        <button class="btn block ${allSeen ? "primary" : ""}" data-act="start-quiz" ${allSeen ? "" : "disabled"}>
          ${allSeen ? "🎯 오늘의 퀴즈 풀기!" : `🔒 카드 5장의 뜻을 모두 보면 퀴즈가 열려요`}
        </button>
      </div>`;
  }

  function moveCard(delta) {
    const n = itemsOfDay(dayIdx()).length;
    state.pos = Math.max(0, Math.min(n - 1, state.pos + delta));
    flipped = false;
    save();
    render();
  }

  // ---------- 퀴즈 ----------
  function makeQuestion(it, pool) {
    const others = pool.filter((x) => x.id !== it.id);
    const fill = others.length >= 2 ? others : IDIOMS.filter((x) => x.id !== it.id);
    const type = pick(["meaning", "blank", "picture"], 1)[0];

    if (type === "blank") {
      const front = Math.random() < 0.5; // 앞 두 글자 or 뒤 두 글자 가리기
      const part = (w) => (front ? w.slice(0, 2) : w.slice(2));
      const answer = part(it.w);
      const wrongs = [...new Set(shuffle(fill).map((x) => part(x.w)).filter((p) => p !== answer))].slice(0, 2);
      const shown = [...it.w].map((c, i) =>
        (front ? i < 2 : i >= 2) ? `<span class="syl q">?</span>` : `<span class="syl">${c}</span>`).join("");
      return {
        it, answer, choices: shuffle([answer, ...wrongs]),
        prompt: `<p>빈칸에 들어갈 글자는?</p><div class="blank">${shown}</div><p class="muted">힌트: ${it.m}</p>`,
      };
    }
    const wrongs = pick(fill, 2).map((x) => x.w);
    const choices = shuffle([it.w, ...wrongs]);
    if (type === "picture") {
      return { it, answer: it.w, choices,
        prompt: `<div class="big-emoji" style="font-size:56px">${it.e}</div><p>“${it.lit}”<br>이런 사자성어는 무엇일까요?</p>` };
    }
    return { it, answer: it.w, choices,
      prompt: `<p>💡 <b>${it.m}</b></p><p class="muted">이런 뜻을 가진 사자성어는 무엇일까요?</p>` };
  }

  function startQuiz(kind) {
    const pool = kind === "today" ? itemsOfDay(dayIdx()) : learnedItems();
    const targets = kind === "today" ? shuffle(pool) : pick(pool, 5);
    const distractPool = learnedItems();
    quiz = { kind, list: targets.map((it) => makeQuestion(it, distractPool)), i: 0, score: 0, answered: null };
    view = "today";
    mode = "quiz";
    render();
  }

  function renderQuiz() {
    const q = quiz.list[quiz.i];
    if (!q) return renderQuizEnd();
    const pct = (quiz.i / quiz.list.length) * 100;
    const ans = quiz.answered;
    const choiceBtns = q.choices.map((c) => {
      let cls = "";
      if (ans) {
        if (c === q.answer) cls = "right";
        else if (c === ans) cls = "wrong";
      }
      return `<button class="choice ${cls}" data-act="answer" data-v="${c}" ${ans ? "disabled" : ""}>${c}</button>`;
    }).join("");
    const correct = ans && ans === q.answer;
    $app.innerHTML = `
      <div class="quiz-top">
        <span>${quiz.kind === "today" ? "🎯 오늘의 퀴즈" : "🔁 복습 퀴즈"}</span>
        <span>${quiz.i + 1} / ${quiz.list.length}</span>
      </div>
      <div class="quiz-bar"><i style="width:${pct}%"></i></div>
      <div class="panel question">${q.prompt}</div>
      <div class="choices">${choiceBtns}</div>
      <div class="feedback ${ans ? (correct ? "ok" : "no") : ""}">
        ${ans ? (correct ? "⭕ 딩동댕! 정답이에요! ⭐+1" : `❌ 아쉬워요! 정답은 <b>${q.it.w}</b>예요.`) : ""}
      </div>
      ${ans && !correct ? `<button class="btn primary block" data-act="quiz-next">다음 문제 ▶</button>` : ""}
      <div class="row"><button class="btn small" data-act="quit-quiz">✕ 그만하기</button></div>`;
  }

  function answer(v) {
    if (!quiz || quiz.answered) return;
    const q = quiz.list[quiz.i];
    quiz.answered = v;
    if (v === q.answer) {
      quiz.score += 1;
      state.stars += 1;
      state.known[q.it.id] = true;
      delete state.weak[q.it.id];
      save();
      updateHeader();
      speak("딩동댕");
      renderQuiz();
      setTimeout(nextQuestion, 1100);
    } else {
      state.weak[q.it.id] = true;
      save();
      renderQuiz();
    }
  }
  function nextQuestion() {
    if (!quiz || !quiz.answered) return;
    quiz.i += 1;
    quiz.answered = null;
    renderQuiz();
  }

  function renderQuizEnd() {
    const { score, list, kind } = quiz;
    const pass = score >= Math.ceil(list.length * 0.6);
    if (kind === "today" && pass && !quiz.ended) {
      state.completed[dayIdx()] = { date: todayStr(), score };
      save();
      confetti();
      speak("참 잘했어요! 도장 쾅!");
    }
    updateHeader();
    const face = score === list.length ? "🥳" : pass ? "😄" : "💪";
    let msg;
    if (kind === "today") {
      msg = pass
        ? `<p>오늘 공부를 마쳤어요! 도장판에 <b>도장 쾅!</b> 🏅</p>`
        : `<p>조금만 더 하면 돼요!<br>카드를 한 번 더 보고 다시 도전해요.</p><p class="muted">5문제 중 3개 이상 맞히면 도장을 받아요.</p>`;
    } else {
      msg = `<p>복습 최고! 별을 모았어요.</p>`;
    }
    $app.innerHTML = `
      <div class="panel">
        <div class="huge">${face}</div>
        <h2>${list.length}문제 중 ${score}개 정답!</h2>
        <p>${"⭐".repeat(score)}${"☆".repeat(list.length - score)}</p>
        ${msg}
      </div>
      ${kind === "today" && !pass
        ? `<div class="row"><button class="btn" data-act="back-cards">📖 카드 다시 보기</button><button class="btn primary" data-act="retry-quiz">🎯 다시 도전</button></div>`
        : `<button class="btn primary block" data-act="${kind === "today" ? "finish" : "go-review"}">좋아요! 👍</button>`}`;
    quiz.ended = true;
  }

  // ---------- 복습 ----------
  function renderReview() {
    const learned = learnedItems();
    const list = reviewFilter === "weak" ? learned.filter((x) => state.weak[x.id]) : learned;
    const groups = {};
    list.forEach((x) => { (groups[Math.floor(x.id / PER_DAY)] ||= []).push(x); });
    const weakCount = learned.filter((x) => state.weak[x.id]).length;

    const groupHTML = Object.keys(groups).sort((a, b) => b - a).map((d) => `
      <div class="day-group">
        <h3>${+d + 1}일째 ${state.completed[d] ? "🏅" : "📖"}</h3>
        <div class="mini-grid">
          ${groups[d].map((x) => `
            <button class="mini ${state.weak[x.id] ? "weak" : ""}" data-act="open" data-id="${x.id}">
              <div class="e">${x.e}</div>
              <div class="w">${x.w}</div>
              <div class="h">${x.h}</div>
            </button>`).join("")}
        </div>
      </div>`).join("");

    $app.innerHTML = `
      <button class="btn primary block" data-act="review-quiz">🎲 섞어서 복습 퀴즈 풀기</button>
      <div class="filter" style="margin-top:16px">
        <button class="chip ${reviewFilter === "all" ? "on" : ""}" data-act="filter" data-v="all">전체 ${learned.length}</button>
        <button class="chip ${reviewFilter === "weak" ? "on" : ""}" data-act="filter" data-v="weak">🤔 헷갈려요 ${weakCount}</button>
      </div>
      ${list.length ? groupHTML : `<div class="panel"><div class="huge">🙌</div><p>헷갈리는 사자성어가 없어요!</p></div>`}`;
  }

  // ---------- 도장판 ----------
  function renderStamps() {
    const doneDays = Object.keys(state.completed).length;
    const knownCount = Object.keys(state.known).length;
    const stamps = Array.from({ length: TOTAL_DAYS }, (_, d) => {
      const c = state.completed[d];
      if (c) return `<div class="stamp done"><span><b>참!</b>${d + 1}일</span></div>`;
      return `<div class="stamp ${d === dayIdx() ? "now" : ""}">${d + 1}</div>`;
    }).join("");
    const canOpenNext = state.completed[dayIdx()] && state.unlocked < TOTAL_DAYS;

    $app.innerHTML = `
      <div class="panel">
        <h2>🏅 나의 도장판</h2>
        <p class="muted">하루 공부를 마치면 도장을 하나 받아요.</p>
        <div class="stamp-grid">${stamps}</div>
        <div class="stat-row">
          <div class="stat"><b>${doneDays}</b><span>받은 도장</span></div>
          <div class="stat"><b>${knownCount}</b><span>외운 사자성어</span></div>
          <div class="stat"><b>${state.stars}</b><span>모은 별</span></div>
        </div>
        <details class="parent">
          <summary>👨‍👩‍👧 보호자 메뉴</summary>
          <p class="muted">오늘 공부를 마친 뒤, 다음 날 카드를 미리 열 수 있어요. 기록은 이 기기의 브라우저에만 저장돼요.</p>
          <div class="row">
            <button class="btn small" data-act="open-next" ${canOpenNext ? "" : "disabled"}>⏩ 다음 카드 미리 열기</button>
            <button class="btn small again" data-act="reset">🗑 기록 지우기</button>
          </div>
        </details>
      </div>`;
  }

  // ---------- 모달 ----------
  function openModal(id) {
    modalItem = IDIOMS[id];
    modalFlipped = true;
    renderModal();
    $modal.hidden = false;
  }
  function renderModal() {
    $modalBody.innerHTML = cardHTML(modalItem, { isFlipped: modalFlipped });
  }
  function closeModal() {
    $modal.hidden = true;
    modalItem = null;
    if (canSpeak) window.speechSynthesis.cancel();
  }

  // ---------- 공통 ----------
  function updateHeader() {
    document.getElementById("starCount").textContent = state.stars;
    const d = dayIdx();
    document.getElementById("dayLabel").textContent = `${d + 1}일째 공부 · 전체 ${TOTAL_DAYS}일`;
  }

  function render() {
    updateHeader();
    document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.dataset.view === view));
    if (view === "today") renderToday();
    else if (view === "review") renderReview();
    else renderStamps();
  }

  function sayItem(id, full) {
    const it = IDIOMS[id];
    speak(full ? `${it.w}. ${it.m} 예를 들면, ${it.ex}` : it.w);
  }

  // ---------- 이벤트 ----------
  $app.addEventListener("click", (e) => {
    const el = e.target.closest("[data-act]");
    if (!el || el.disabled) return;
    const act = el.dataset.act;
    const items = itemsOfDay(dayIdx());
    const cur = items[Math.min(state.pos, items.length - 1)];

    switch (act) {
      case "say": e.stopPropagation(); sayItem(+el.dataset.id, false); break;
      case "sayall": e.stopPropagation(); sayItem(+el.dataset.id, true); break;
      case "flip":
        flipped = !flipped;
        if (flipped) {
          state.seen[cur.id] = true;
          save();
        }
        renderToday();
        break;
      case "prev": moveCard(-1); break;
      case "next": moveCard(1); break;
      case "goto": state.pos = +el.dataset.i; flipped = false; save(); render(); break;
      case "know":
        state.known[cur.id] = true;
        delete state.weak[cur.id];
        save();
        if (state.pos < items.length - 1) moveCard(1);
        else { flipped = false; render(); }
        break;
      case "weak":
        state.weak[cur.id] = true;
        delete state.known[cur.id];
        save();
        if (state.pos < items.length - 1) moveCard(1);
        else { flipped = false; render(); }
        break;
      case "start-quiz": startQuiz("today"); break;
      case "retry-quiz": startQuiz("today"); break;
      case "review-quiz": startQuiz("review"); break;
      case "answer": answer(el.dataset.v); break;
      case "quiz-next": nextQuestion(); break;
      case "quit-quiz":
        if (quiz.kind === "review") view = "review";
        mode = "cards"; quiz = null; flipped = false; render(); break;
      case "back-cards": mode = "cards"; quiz = null; state.pos = 0; flipped = false; render(); break;
      case "finish": mode = "cards"; quiz = null; render(); break;
      case "again-cards": mode = "cards-again"; state.pos = 0; flipped = false; render(); break;
      case "go-review": mode = "cards"; quiz = null; view = "review"; render(); break;
      case "filter": reviewFilter = el.dataset.v; render(); break;
      case "open": openModal(+el.dataset.id); break;
      case "open-next":
        if (confirm("다음 날 카드 5장을 지금 열까요?")) {
          state.completed[dayIdx()].date = "0000-00-00";
          refreshUnlock();
          mode = "cards"; view = "today"; flipped = false; render();
        }
        break;
      case "reset":
        if (confirm("모든 공부 기록(도장, 별)을 지울까요? 되돌릴 수 없어요.")) {
          state = fresh(); save();
          mode = "cards"; view = "today"; flipped = false; render();
        }
        break;
    }
  });

  $modal.addEventListener("click", (e) => {
    const el = e.target.closest("[data-act]");
    if (e.target === $modal || e.target.closest(".modal-close")) return closeModal();
    if (!el) return;
    if (el.dataset.act === "say") { e.stopPropagation(); sayItem(+el.dataset.id, false); }
    else if (el.dataset.act === "sayall") { e.stopPropagation(); sayItem(+el.dataset.id, true); }
    else if (el.dataset.act === "flip") { modalFlipped = !modalFlipped; renderModal(); }
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$modal.hidden) closeModal(); });

  document.querySelectorAll(".tab").forEach((t) => t.addEventListener("click", () => {
    if (mode === "quiz" && quiz && !quiz.ended && !confirm("퀴즈를 그만할까요?")) return;
    if (mode === "quiz") { mode = "cards"; quiz = null; }
    if (mode === "cards-again") mode = "cards";
    view = t.dataset.view;
    flipped = false;
    render();
    window.scrollTo(0, 0);
  }));

  // 날짜가 바뀐 채로 앱을 켜 두었을 때도 새 카드가 열리도록
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      const before = state.unlocked;
      refreshUnlock();
      if (state.unlocked !== before) { mode = "cards"; render(); }
    }
  });
  if (canSpeak) window.speechSynthesis.getVoices(); // 목소리 목록 미리 불러오기

  refreshUnlock();
  render();
})();
