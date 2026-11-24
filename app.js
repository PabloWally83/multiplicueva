(() => {
  'use strict';

  const STORAGE_KEY = 'multiplicaAventura.v1';
  const PASS_SCORE = 80;
  const TABLES = 10;
  const PRACTICE_LENGTH = 10;
  const CHALLENGE_LENGTH = 12;
  const REVIEW_LENGTH = 10;
  const DAY_MS = 86400000;
  const DIFFICULTIES = {
    calm: { label: 'Tranquilo', pass: 70, practice: 8, challenge: 10, review: 8 },
    normal: { label: 'Normal', pass: 80, practice: 10, challenge: 12, review: 10 },
    expert: { label: 'Experto', pass: 90, practice: 12, challenge: 15, review: 12 }
  };

  const defaultState = () => ({
    version: 1,
    playerName: '',
    xp: 0,
    stars: 0,
    dailyStreak: 1,
    bestAnswerStreak: 0,
    lastVisit: '',
    sessionsToday: 0,
    sessionDate: localDateKey(),
    sound: true,
    animations: true,
    answerMode: 'choice',
    difficulty: 'normal',
    progressMode: 'guided',
    planConfigured: false,
    planDays: 3,
    unlocked: 1,
    levels: Object.fromEntries(Array.from({ length: TABLES }, (_, i) => [i + 1, {
      learned: false,
      lessonStep: 0,
      practiceBest: 0,
      challengeBest: 0,
      completed: false
    }])),
    factStats: {},
    badges: [],
    totalCorrect: 0,
    totalAnswers: 0
  });

  let state = loadState();
  let view = 'home';
  let lesson = null;
  let quiz = null;
  let audioContext = null;
  let planDraft = null;
  let selectedReviewTables = Array.from({ length: TABLES }, (_, i) => i + 1);

  const main = document.getElementById('main');
  const modalRoot = document.getElementById('modal-root');

  function localDateKey(date = new Date()) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (!saved || saved.version !== 1) return defaultState();
      const base = defaultState();
      return {
        ...base,
        ...saved,
        levels: Object.fromEntries(Array.from({ length: TABLES }, (_, i) => {
          const n = i + 1;
          return [n, { ...base.levels[n], ...(saved.levels?.[n] || {}) }];
        })),
        factStats: saved.factStats || {}
      };
    } catch (_) {
      return defaultState();
    }
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    updateTopbar();
  }

  function updateVisitStreak() {
    const today = localDateKey();
    if (state.sessionDate !== today) {
      state.sessionsToday = 0;
      state.sessionDate = today;
    }
    if (!state.lastVisit) {
      state.lastVisit = today;
    } else if (state.lastVisit !== today) {
      const previous = new Date(`${state.lastVisit}T12:00:00`);
      const current = new Date(`${today}T12:00:00`);
      const days = Math.round((current - previous) / DAY_MS);
      state.dailyStreak = days === 1 ? state.dailyStreak + 1 : 1;
      state.lastVisit = today;
    }
    saveState();
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
  }

  function levelState(n) {
    return state.levels[n];
  }

  function updateTopbar() {
    document.getElementById('daily-streak').textContent = state.dailyStreak;
    document.getElementById('stars').textContent = state.stars;
    document.getElementById('xp').textContent = state.xp;
    const due = getReviewFacts().length;
    document.getElementById('review-dot').hidden = due === 0;
  }

  function setActiveNav(name) {
    document.querySelectorAll('.nav-item').forEach(button => button.classList.toggle('active', button.dataset.action === name));
  }

  function completedCount() {
    return Object.values(state.levels).filter(l => l.completed).length;
  }

  function difficultyConfig() {
    return DIFFICULTIES[state.difficulty] || DIFFICULTIES.normal;
  }

  function currentPassScore() {
    return difficultyConfig().pass;
  }

  function quizLength(mode) {
    const config = difficultyConfig();
    if (mode === 'practice') return config.practice;
    if (mode === 'challenge') return config.challenge;
    return config.review;
  }

  function buildPlan(days = state.planDays) {
    const safeDays = Math.max(1, Math.min(TABLES, Number(days) || 1));
    const base = Math.floor(TABLES / safeDays);
    let extra = TABLES % safeDays;
    let table = 1;
    return Array.from({ length: safeDays }, () => {
      const size = base + (extra-- > 0 ? 1 : 0);
      return Array.from({ length: size }, () => table++);
    });
  }

  function todayTarget() {
    const plan = buildPlan();
    const index = Math.max(0, plan.findIndex(tables => tables.some(n => !levelState(n).completed)));
    const tables = plan[index] || plan[plan.length - 1];
    return { day: index + 1, totalDays: plan.length, tables, target: tables[tables.length - 1] };
  }

  function renderHome() {
    view = 'home';
    setActiveNav('home');
    const done = completedCount();
    const goal = Math.min(3, state.sessionsToday);
    const target = todayTarget();
    const freeMode = state.progressMode === 'free';
    const nextLevel = Math.min(TABLES, state.unlocked);
    const levels = Array.from({ length: TABLES }, (_, i) => {
      const n = i + 1;
      const l = levelState(n);
      const isLocked = !freeMode && n > state.unlocked;
      const statusClass = l.completed ? 'done' : isLocked ? 'locked' : n === nextLevel ? 'current' : '';
      const icon = l.completed ? '✓' : isLocked ? '🔒' : n;
      const subtitle = l.completed ? `Dominada · Mejor ${l.challengeBest}%` : isLocked ? 'Completá el nivel anterior' : stageSubtitle(n);
      const meta = l.completed ? '<strong>⭐⭐⭐</strong><small>completo</small>' : isLocked ? '<strong>—</strong><small>bloqueado</small>' : `<strong>${levelProgress(n)}%</strong><small>progreso</small>`;
      return `<button class="level-card ${statusClass}" data-action="open-level" data-level="${n}" ${isLocked ? 'disabled' : ''} aria-label="Tabla del ${n}: ${subtitle}">
        <span class="level-orb">${icon}</span>
        <span class="level-info"><h3>Nivel ${n} · Tabla del ${n}</h3><p>${subtitle}</p></span>
        <span class="level-meta">${meta}</span>
      </button>`;
    }).join('');

    main.innerHTML = `
      <section class="hero">
        <div class="hero-row">
          <div><p class="eyebrow">${freeMode ? 'MODO LIBRE' : target.totalDays === 1 ? 'MISIÓN COMPLETA' : `ETAPA ${target.day} DE ${target.totalDays}`}</p><h1>¡Hola, ${escapeHtml(state.playerName || 'campeón')}!</h1><p>${done === TABLES ? '¡Dominaste todos los mundos! Seguí repasando para que no se escape ninguna tabla.' : freeMode ? 'Elegí cualquier nivel y avanzá en el orden que prefieras.' : `Tu misión: conquistar ${formatTables(target.tables)}.`}</p></div>
          <div class="goal-ring" style="--progress:${goal * 120}deg"><div class="goal-ring-inner"><strong>${goal}/3</strong><small>SESIONES</small></div></div>
        </div>
      </section>
      <section class="daily-card">
        <span class="daily-icon" aria-hidden="true">🎯</span>
        <div><h3>Meta diaria: 3 sesiones cortas</h3><p>${goal < 3 ? `Faltan ${3 - goal}. Descansá entre cada una.` : '¡Meta cumplida! Tu cerebro hizo un gran trabajo.'}</p></div>
        <div class="mini-progress" aria-label="${goal} de 3 sesiones"><span style="width:${goal / 3 * 100}%"></span></div>
      </section>
      <div class="section-head"><div><h2>Tu mapa de aventura</h2><p>${freeMode ? 'Modo Libre · todos los niveles están disponibles' : 'Aprendé → practicá → superá el desafío'}</p></div><button class="link-btn" data-action="plan">Ver plan</button></div>
      <section class="level-map" aria-label="Niveles de las tablas">${levels}</section>`;
    main.focus({ preventScroll: true });
  }

  function stageSubtitle(n) {
    const l = levelState(n);
    if (!l.learned) return 'Primero descubrimos cómo funciona';
    if (l.practiceBest < currentPassScore()) return 'Práctica solo esta tabla';
    return 'Desafío mezclado con tablas anteriores';
  }

  function formatTables(tables) {
    const labels = tables.map(String);
    if (labels.length === 1) return `la tabla ${labels[0]}`;
    if (labels.length === 2) return `las tablas ${labels.join(' y ')}`;
    return `las tablas ${labels.slice(0, -1).join(', ')} y ${labels.at(-1)}`;
  }

  function levelProgress(n) {
    const l = levelState(n);
    if (l.completed) return 100;
    return Math.round((l.learned ? 25 : (l.lessonStep / 10) * 25) + Math.min(35, l.practiceBest * .35) + Math.min(40, l.challengeBest * .4));
  }

  function openLevel(n) {
    const l = levelState(n);
    modalRoot.innerHTML = `<div class="modal-backdrop">
      <section class="modal-card" role="dialog" aria-modal="true" aria-labelledby="level-title">
        <div class="mascot"><span>${n}</span></div>
        <p class="eyebrow">NIVEL ${n}</p><h2 id="level-title">Tabla del ${n}</h2>
        <p>${state.progressMode === 'free' ? 'Elegiste este nivel libremente. Para dominarlo, completá sus tres etapas.' : 'Para dominarla, completá las tres etapas en orden.'}</p>
        <div class="stage-list">
          ${stageItem('👀', '1. Descubrir', 'Mirá patrones y entendé cada cuenta.', l.learned, !l.learned, 'start-learn', n)}
           ${stageItem('🎯', '2. Practicar', `${quizLength('practice')} ejercicios solo de esta tabla · mínimo ${currentPassScore()}%.`, l.practiceBest >= currentPassScore(), l.learned && l.practiceBest < currentPassScore(), 'start-practice', n, l.practiceBest)}
           ${stageItem('🧠', '3. Desafío mixto', `${quizLength('challenge')} ejercicios con tablas del 1 al ${n} · mínimo ${currentPassScore()}%.`, l.completed, l.practiceBest >= currentPassScore() && !l.completed, 'start-challenge', n, l.challengeBest)}
        </div>
        ${l.completed ? `<button class="primary-btn full" data-action="start-challenge" data-level="${n}">Volver a jugar</button>` : ''}
        <button class="link-btn" data-action="close-modal" style="margin-top:16px">Cerrar</button>
      </section></div>`;
  }

  function stageItem(icon, title, description, complete, active, action, n, best = null) {
    const right = complete ? '<span class="check">✓</span>' : active ? '<span aria-hidden="true">›</span>' : '<span aria-hidden="true">🔒</span>';
    return `<button class="stage-item" data-action="${action}" data-level="${n}" ${!active && !complete ? 'disabled' : ''}>
      <span class="stage-icon">${icon}</span><span><h3>${title}</h3><p>${description}${best ? ` · Récord ${best}%` : ''}</p></span>${right}
    </button>`;
  }

  function startLesson(n) {
    modalRoot.innerHTML = '';
    const savedStep = Math.min(levelState(n).lessonStep || 0, 9);
    lesson = { table: n, step: savedStep };
    renderLesson();
  }

  function renderLesson() {
    const { table, step } = lesson;
    const factor = step + 1;
    const result = table * factor;
    view = 'lesson';
    setActiveNav('');
    main.innerHTML = `
      <div class="screen-head"><button class="icon-btn" data-action="exit-lesson" aria-label="Salir">✕</button><div><h1>Descubrí la tabla del ${table}</h1><p>Paso ${step + 1} de 10</p></div></div>
      <section class="lesson-card">
        <div class="mascot"><span>${table}</span></div>
        <p class="eyebrow">TABLA DEL ${table} · REPETIR ${factor} ${factor === 1 ? 'VEZ' : 'VECES'}</p>
        <div class="fact-big factor-equation"><span class="factor-block factor-table"><span>${table}</span><small>NÚMERO QUE REPETIMOS</small></span><b>×</b><span class="factor-block factor-times"><span>${factor}</span><small>CANTIDAD DE VECES</small></span><b>=</b><span class="fact-result">${result}</span></div>
        <div class="number-groups">${Array.from({ length: factor }, () => `<span class="number-group">${table}</span>`).join('<span aria-hidden="true">+</span>')}</div>
        <h2>${lessonTip(table, factor)}</h2><p class="factor-sentence">Multiplicamos <strong class="table-color">${table}</strong> por <strong class="times-color">${factor}</strong>:<br>repetimos el <strong class="table-color">${table}</strong>, <strong class="times-color">${factor} ${factor === 1 ? 'vez' : 'veces'}</strong>.</p>
        <div class="lesson-actions">
          <button class="secondary-btn" data-action="lesson-back" ${step === 0 ? 'disabled' : ''}>← Anterior</button>
          <button class="primary-btn" data-action="lesson-next">${step === 9 ? '¡Listo para practicar!' : 'Entendido →'}</button>
        </div>
      </section>`;
    main.focus({ preventScroll: true });
  }

  function lessonTip(table, factor) {
    if (table === 1) return '¡Todo número queda igual!';
    if (factor === 1) return `Una sola vez ${table} es ${table}`;
    if (factor === 2) return `Es el doble de ${table}`;
    if (factor === 5) return 'El resultado termina en 0 o 5';
    if (factor === 10) return 'Solo agregá un cero';
    if (table === 2) return 'Contá de 2 en 2';
    if (table === 5) return 'Contá de 5 en 5';
    if (table === 9) return 'Los dígitos del resultado suman 9';
    return `¡Llegaste a ${resultWord(table * factor)}!`;
  }

  function resultWord(n) {
    const words = { 6:'seis', 8:'ocho', 12:'doce', 15:'quince', 16:'dieciséis', 18:'dieciocho', 20:'veinte', 21:'veintiuno', 24:'veinticuatro', 25:'veinticinco', 27:'veintisiete', 30:'treinta', 32:'treinta y dos', 35:'treinta y cinco', 36:'treinta y seis', 40:'cuarenta', 42:'cuarenta y dos', 45:'cuarenta y cinco', 48:'cuarenta y ocho', 49:'cuarenta y nueve', 50:'cincuenta', 54:'cincuenta y cuatro', 56:'cincuenta y seis', 60:'sesenta', 63:'sesenta y tres', 64:'sesenta y cuatro', 70:'setenta', 72:'setenta y dos', 80:'ochenta', 81:'ochenta y uno', 90:'noventa', 100:'cien' };
    return words[n] || n;
  }

  function completeLessonStep(direction) {
    if (direction === 'back') {
      lesson.step = Math.max(0, lesson.step - 1);
      renderLesson();
      return;
    }
    const l = levelState(lesson.table);
    l.lessonStep = Math.max(l.lessonStep, lesson.step + 1);
    if (lesson.step < 9) {
      lesson.step++;
      saveState();
      renderLesson();
    } else {
      l.learned = true;
      state.xp += 10;
      saveState();
      showToast('📖 ¡Lección completa! +10 XP');
      startQuiz('practice', lesson.table);
    }
  }

  function startQuiz(mode, table) {
    modalRoot.innerHTML = '';
    const count = quizLength(mode);
    quiz = { mode, table, questions: buildQuestionSet(mode, table, count), index: 0, correct: 0, answerStreak: 0, bestStreak: 0, answered: false, mistakes: [], responses: [] };
    view = 'quiz';
    setActiveNav(mode === 'review' ? 'review' : '');
    renderQuiz();
  }

  function buildQuestionSet(mode, table, count, random = Math.random) {
    const questions = [];
    if (mode === 'practice') {
      const factors = shuffle(Array.from({ length: 10 }, (_, i) => i + 1), random);
      for (let i = 0; i < count; i++) questions.push(makeQuestion(table, factors[i % 10], random));
    } else if (mode === 'challenge') {
      const currentCount = Math.ceil(count * .58);
      const currentFactors = shuffle(Array.from({ length: 10 }, (_, i) => i + 1), random);
      for (let i = 0; i < currentCount; i++) questions.push(makeQuestion(table, currentFactors[i % 10], random));
      for (let i = currentCount; i < count; i++) {
        const weak = pickWeakFact(table, random, table - 1);
        const t = weak ? weak[0] : 1 + Math.floor(random() * Math.max(1, table - 1));
        const f = weak ? weak[1] : 1 + Math.floor(random() * 10);
        questions.push(makeQuestion(t, f, random));
      }
      return shuffle(questions, random);
    } else {
      const selectedTables = Array.isArray(table) ? table : null;
      let pool;
      if (selectedTables) {
        const available = allFactsForTables(selectedTables);
        const due = getReviewFacts().filter(([a]) => selectedTables.includes(a));
        const seen = new Set();
        pool = [...due, ...shuffle(available, random)].filter(([a, b]) => {
          const key = factKey(a, b);
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      } else {
        const facts = getReviewFacts();
        pool = facts.length ? facts : allUnlockedFacts();
      }
      for (let i = 0; i < count; i++) {
        const fact = pool[i % pool.length] || [1, i % 10 + 1];
        questions.push(makeQuestion(fact[0], fact[1], random));
      }
      return shuffle(questions, random);
    }
    return questions;
  }

  function shuffle(array, random = Math.random) {
    const result = [...array];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  function makeQuestion(a, b, random = Math.random) {
    const correct = a * b;
    const choices = new Set([correct]);
    const candidates = [correct + a, correct - a, correct + b, correct - b, correct + 1, correct - 1, correct + 10, correct - 10, a * Math.max(1, b - 2), a * Math.min(10, b + 2)];
    shuffle(candidates, random).forEach(value => { if (value > 0 && value <= 100 && choices.size < 4) choices.add(value); });
    while (choices.size < 4) choices.add(1 + Math.floor(random() * 100));
    return { a, b, correct, choices: shuffle([...choices], random) };
  }

  function renderQuiz() {
    const q = quiz.questions[quiz.index];
    const total = quiz.questions.length;
    const progress = (quiz.index / total) * 100;
    main.innerHTML = `<section class="quiz-shell">
      <div class="quiz-top">
        <button class="icon-btn" data-action="exit-quiz" aria-label="Salir del ejercicio">✕</button>
        <div class="stage-progress" aria-label="Progreso ${quiz.index} de ${total}"><span style="width:${progress}%"></span></div>
        <div class="quiz-status"><span title="Racha de respuestas">🔥 ${quiz.answerStreak}</span><span title="Aciertos">✅ ${quiz.correct}</span></div>
      </div>
      <div class="quiz-body">
        <p class="prompt-label">${quiz.mode === 'practice' ? `Practicá la tabla del ${quiz.table}` : quiz.mode === 'challenge' ? 'Desafío: ¡ahora están mezcladas!' : 'Repaso inteligente'}</p>
        <div class="question-card"><div class="question">${q.a} × ${q.b} = <span class="question-mark">?</span></div></div>
        ${state.answerMode === 'input'
          ? `<form class="manual-answer" data-quiz-form><label for="manual-value">Escribí el resultado</label><div><input id="manual-value" inputmode="numeric" pattern="[0-9]*" min="1" max="100" maxlength="3" autocomplete="off" aria-label="Resultado de ${q.a} por ${q.b}"><button type="submit" class="primary-btn">Comprobar</button></div></form>`
          : `<div class="answers">${q.choices.map((answer, i) => `<button class="answer-btn" data-action="answer" data-value="${answer}" aria-label="Respuesta ${answer}"><small>${i + 1}</small>&nbsp; ${answer}</button>`).join('')}</div>`}
        <div id="feedback-slot"></div>
      </div>
    </section>`;
    main.focus({ preventScroll: true });
    document.getElementById('manual-value')?.focus();
  }

  function answerQuestion(value) {
    if (quiz.answered) return;
    const numericValue = Number(value);
    if (!Number.isInteger(numericValue) || numericValue < 1 || numericValue > 100) {
      const input = document.getElementById('manual-value');
      input?.setAttribute('aria-invalid', 'true');
      input?.focus();
      showToast('Escribí un número entre 1 y 100');
      return;
    }
    quiz.answered = true;
    const q = quiz.questions[quiz.index];
    const correct = numericValue === q.correct;
    quiz.responses.push({ a: q.a, b: q.b, answer: numericValue, correctAnswer: q.correct, correct });
    const buttons = [...document.querySelectorAll('.answer-btn')];
    buttons.forEach(button => {
      button.disabled = true;
      const v = Number(button.dataset.value);
      if (v === q.correct) button.classList.add('correct');
       else if (v === numericValue) button.classList.add('wrong');
    });
    const manual = document.getElementById('manual-value');
    if (manual) {
      manual.disabled = true;
      manual.classList.add(correct ? 'correct' : 'wrong');
      manual.closest('form')?.querySelector('button')?.setAttribute('disabled', '');
    }
    state.totalAnswers++;
    if (correct) {
      quiz.correct++;
      quiz.answerStreak++;
      quiz.bestStreak = Math.max(quiz.bestStreak, quiz.answerStreak);
      state.bestAnswerStreak = Math.max(state.bestAnswerStreak, quiz.answerStreak);
      state.totalCorrect++;
      state.xp += 2 + Math.min(3, Math.floor(quiz.answerStreak / 3));
      updateFact(q.a, q.b, true);
      playTone('good');
      launchFireworks('mini');
    } else {
      quiz.answerStreak = 0;
      quiz.mistakes.push(q);
      updateFact(q.a, q.b, false);
      playTone('bad');
    }
    animateAnswer(correct);
    saveState();
    const feedback = document.getElementById('feedback-slot');
    feedback.innerHTML = `<div class="feedback ${correct ? 'good' : 'bad'}"><span class="feedback-face" aria-hidden="true">${correct ? '🌟' : '💪'}</span><div><h3>${correct ? praise() : 'Casi, ¡seguimos!'}</h3><p>${correct ? `${q.a} × ${q.b} = ${q.correct}` : `Tu respuesta: ${numericValue}. La correcta es ${q.correct}. Pensá: ${Array.from({length:q.b},()=>q.a).join(' + ')}.`}</p></div><button class="primary-btn" data-action="next-question">Continuar</button></div>`;
    feedback.querySelector('button').focus();
  }

  function praise() {
    const words = ['¡Excelente!', '¡Genial!', '¡Imparable!', '¡Muy bien!', '¡Súper!', '¡Lo tenés!'];
    return words[Math.floor(Math.random() * words.length)];
  }

  function nextQuestion() {
    if (quiz.index < quiz.questions.length - 1) {
      quiz.index++;
      quiz.answered = false;
      renderQuiz();
    } else {
      finishQuiz();
    }
  }

  function finishQuiz() {
    const score = Math.round(quiz.correct / quiz.questions.length * 100);
    const passScore = currentPassScore();
    const passed = quiz.mode === 'review' || score >= passScore;
    const earnedStars = quiz.mode === 'review' ? (score >= 80 ? 1 : 0) : passed ? (score === 100 ? 3 : score >= 90 ? 2 : 1) : 0;
    const table = quiz.table;
    if (quiz.mode === 'practice') {
      state.levels[table].practiceBest = Math.max(state.levels[table].practiceBest, score);
    } else if (quiz.mode === 'challenge') {
      state.levels[table].challengeBest = Math.max(state.levels[table].challengeBest, score);
      if (passed) {
        state.levels[table].completed = true;
        syncGuidedUnlock();
      }
    }
    state.stars += earnedStars;
    state.sessionsToday = Math.min(3, state.sessionsToday + 1);
    unlockBadges();
    saveState();
    if (passed && quiz.mode !== 'review') launchFireworks('grand');
    playTone(passed ? 'win' : 'bad');
    renderResults(score, passed, earnedStars);
  }

  function renderResults(score, passed, earnedStars) {
    view = 'result';
    setActiveNav(quiz.mode === 'review' ? 'review' : '');
    const mode = quiz.mode;
    let title;
    if (mode === 'review') title = score >= 80 ? '¡Repaso completado!' : '¡Tu memoria se está entrenando!';
    else title = passed ? (mode === 'challenge' ? '¡Nivel superado!' : '¡Práctica aprobada!') : '¡Una vuelta más!';
    const message = mode === 'review'
      ? 'Cada repaso hace que las respuestas aparezcan más rápido.'
      : passed
        ? (mode === 'practice' ? 'Ahora podés probar el desafío con tablas mezcladas.' : completedCount() === TABLES ? '¡Dominaste las 10 tablas! Sos una leyenda de la multiplicación.' : state.progressMode === 'free' ? `Completaste la tabla del ${quiz.table}. En modo Libre podés elegir cualquier otro nivel.` : `Desbloqueaste la tabla del ${quiz.table + 1}.`)
         : `Necesitás ${currentPassScore()}%. Repasaremos tus errores para que el próximo intento sea mejor.`;
    main.innerHTML = `<section class="result-card">
      <div class="result-emoji" aria-hidden="true">${passed ? (score === 100 ? '👑' : '🎉') : '💪'}</div>
      <p class="eyebrow">${mode === 'review' ? 'REPASO' : `TABLA DEL ${quiz.table}`}</p><h1>${title}</h1><p>${message}</p>
      <div class="score-circle" style="--score:${score * 3.6}deg"><div class="score-inner"><div><strong>${score}%</strong><small>${quiz.correct} DE ${quiz.questions.length}</small></div></div></div>
      <div class="result-stats">
        <div class="result-stat"><strong>+${earnedStars} ⭐</strong><small>estrellas</small></div>
        <div class="result-stat"><strong>${quiz.bestStreak} 🔥</strong><small>mejor racha</small></div>
        <div class="result-stat"><strong>${quiz.mistakes.length}</strong><small>para repasar</small></div>
      </div>
      ${quiz.mode === 'challenge' ? renderAnswerReview() : ''}
      ${resultActions(score, passed)}
    </section>`;
  }

  function renderAnswerReview() {
    return `<section class="answer-review" aria-labelledby="answer-review-title"><div class="answer-review-head"><div><h2 id="answer-review-title">Así te fue, operación por operación</h2><p>Revisá qué salió bien y qué conviene practicar.</p></div><span>${quiz.correct}/${quiz.responses.length}</span></div><div class="answer-review-list">${quiz.responses.map((item, index) => `<div class="answer-review-row ${item.correct ? 'is-correct' : 'is-wrong'}"><span class="review-index">${index + 1}</span><strong>${item.a} × ${item.b} = ${item.correctAnswer}</strong><span>Tu respuesta: <b>${item.answer}</b></span><i aria-label="${item.correct ? 'Correcta' : 'Incorrecta'}">${item.correct ? '✓' : '✕'}</i></div>`).join('')}</div></section>`;
  }

  function resultActions(score, passed) {
    if (quiz.mode === 'review') return '<button class="primary-btn full" data-action="home">Volver al mapa</button>';
    if (!passed) return `<button class="primary-btn full" data-action="retry-quiz">Practicar errores</button><button class="link-btn" data-action="home" style="margin-top:18px">Volver al mapa</button>`;
    if (quiz.mode === 'practice') return `<button class="primary-btn full" data-action="start-challenge" data-level="${quiz.table}">Ir al desafío mixto</button><button class="link-btn" data-action="home" style="margin-top:18px">Hacer una pausa</button>`;
    return `<button class="primary-btn full" data-action="home">${completedCount() === TABLES ? 'Ver mi mapa completo' : state.progressMode === 'free' ? 'Elegir otro nivel' : 'Descubrir el próximo nivel'}</button>`;
  }

  function retryQuiz() {
    const errors = quiz.mistakes.length ? quiz.mistakes : quiz.questions;
    const mode = quiz.mode;
    const table = quiz.table;
    quiz = { mode, table, questions: shuffle([...errors, ...errors]).slice(0, Math.max(6, errors.length)), index: 0, correct: 0, answerStreak: 0, bestStreak: 0, answered: false, mistakes: [], responses: [] };
    renderQuiz();
  }

  function factKey(a, b) { return `${a}x${b}`; }

  function updateFact(a, b, correct) {
    const key = factKey(a, b);
    const old = state.factStats[key] || { correct: 0, wrong: 0, streak: 0, interval: 0, due: 0 };
    if (correct) {
      old.correct++;
      old.streak++;
      const intervals = [5 * 60000, 4 * 3600000, 12 * 3600000, DAY_MS, 3 * DAY_MS, 7 * DAY_MS];
      old.interval = Math.min(intervals.length - 1, old.streak - 1);
      old.due = Date.now() + intervals[old.interval];
    } else {
      old.wrong++;
      old.streak = 0;
      old.interval = 0;
      old.due = Date.now();
    }
    state.factStats[key] = old;
  }

  function parseFactKey(key) { return key.split('x').map(Number); }

  function getReviewFacts(now = Date.now()) {
    const due = Object.entries(state.factStats)
      .filter(([, s]) => s.due <= now || s.wrong > s.correct)
      .sort((a, b) => (b[1].wrong - b[1].correct) - (a[1].wrong - a[1].correct) || a[1].due - b[1].due)
      .map(([key]) => parseFactKey(key));
    return due;
  }

  function allUnlockedFacts() {
    const max = state.progressMode === 'free' ? TABLES : Math.max(1, state.unlocked - (state.levels[state.unlocked]?.completed ? 0 : 1));
    return Array.from({ length: max }, (_, a) => Array.from({ length: 10 }, (_, b) => [a + 1, b + 1])).flat();
  }

  function allFactsForTables(tables) {
    return tables.flatMap(a => Array.from({ length: 10 }, (_, b) => [a, b + 1]));
  }

  function syncGuidedUnlock() {
    let next = 1;
    while (next <= TABLES && levelState(next).completed) next++;
    state.unlocked = Math.min(TABLES, next);
  }

  function pickWeakFact(maxTable, random = Math.random, restrictMax = maxTable) {
    const weak = Object.entries(state.factStats)
      .map(([key, stats]) => ({ fact: parseFactKey(key), weight: stats.wrong * 2 - stats.correct + (stats.due <= Date.now() ? 2 : 0) }))
      .filter(item => item.fact[0] <= restrictMax && item.weight > 0)
      .sort((a, b) => b.weight - a.weight);
    if (!weak.length) return null;
    return weak[Math.floor(random() * Math.min(4, weak.length))].fact;
  }

  function renderReview() {
    view = 'review';
    setActiveNav('review');
    if (state.progressMode === 'free') {
      renderFreeReview();
      return;
    }
    const facts = getReviewFacts();
    const fallback = allUnlockedFacts().slice(0, 5);
    const list = (facts.length ? facts : fallback).slice(0, 8);
    const masteredTables = completedCount();
    main.innerHTML = `<div class="screen-head"><div><h1>🧠 Gimnasio de memoria</h1><p>Repasos cortos justo cuando tu cerebro los necesita.</p></div></div>
      <section class="panel">
        ${masteredTables === 0 ? `<div class="empty-state"><div>🌱</div><h2>Primero, aprendé la tabla del 1</h2><p>Después de practicarla aparecerán acá las cuentas para reforzar.</p><button class="primary-btn" data-action="home">Ir al mapa</button></div>` : `
          <h2>${facts.length ? `${facts.length} ${facts.length === 1 ? 'cuenta lista' : 'cuentas listas'} para repasar` : '¡Tu memoria está al día!'}</h2>
          <p class="subtle">Priorizamos las cuentas que costaron y las que están por olvidarse.</p>
          <div class="review-list">${list.map(([a,b]) => { const s=state.factStats[factKey(a,b)]||{}; const accuracy=(s.correct||s.wrong)?Math.round((s.correct||0)/((s.correct||0)+(s.wrong||0))*100):0; return `<div class="review-fact"><span>${a} × ${b}</span><span class="mastery">${accuracy ? `${accuracy}% de aciertos` : 'Nueva'}</span></div>`; }).join('')}</div>
          <button class="primary-btn full" data-action="start-review">Entrenar 10 cuentas</button>`}
      </section>
      <section class="panel"><h3>¿Por qué funciona?</h3><p class="subtle">Una cuenta correcta vuelve más adelante. Si cuesta, regresa pronto. Así practicás más lo difícil sin repetir de más lo que ya sabés.</p></section>`;
  }

  function renderFreeReview() {
    const selected = selectedReviewTables.slice().sort((a, b) => a - b);
    const selectedFacts = allFactsForTables(selected);
    const dueCount = getReviewFacts().filter(([a]) => selected.includes(a)).length;
    main.innerHTML = `<div class="screen-head"><div><h1>🧠 Repaso libre</h1><p>Elegí una o varias tablas. No hace falta completar niveles anteriores.</p></div></div>
      <section class="panel">
        <div class="review-picker-head"><div><h2>¿Qué querés repasar?</h2><p class="subtle">Podés combinar las tablas que quieras.</p></div><div><button class="link-btn" data-action="review-select-all">Todas</button><button class="link-btn" data-action="review-clear">Limpiar</button></div></div>
        <div class="review-table-grid" role="group" aria-label="Tablas para repasar">
          ${Array.from({ length: TABLES }, (_, i) => i + 1).map(n => `<button class="review-table-choice ${selected.includes(n) ? 'selected' : ''}" data-action="toggle-review-table" data-level="${n}" aria-pressed="${selected.includes(n)}"><span>×${n}</span><small>Tabla del ${n}</small></button>`).join('')}
        </div>
        <div class="review-selection-summary">${selected.length ? `<strong>${formatTables(selected)}</strong><span>${selectedFacts.length} cuentas disponibles${dueCount ? ` · ${dueCount} listas para reforzar` : ''}</span>` : '<strong>Elegí al menos una tabla</strong><span>Después vas a poder iniciar el repaso.</span>'}</div>
        <button class="primary-btn full" data-action="start-review" ${selected.length ? '' : 'disabled'}>Repasar ${quizLength('review')} cuentas</button>
      </section>
      <section class="panel"><h3>Modo Libre</h3><p class="subtle">La selección no depende del mapa ni del orden de los niveles. Las cuentas que más cuestan tienen prioridad dentro de las tablas elegidas.</p></section>`;
  }

  function startReview() {
    if (state.progressMode === 'free') {
      if (!selectedReviewTables.length) {
        showToast('Elegí al menos una tabla');
        return;
      }
      startQuiz('review', [...selectedReviewTables]);
      return;
    }
    startQuiz('review', Math.max(1, state.unlocked - 1));
  }

  function renderPlan() {
    view = 'plan';
    setActiveNav('plan');
    const plan = buildPlan();
    main.innerHTML = `<div class="screen-head plan-heading"><div><h1>📅 ${state.progressMode === 'free' ? 'Modo Libre' : plan.length === 1 ? 'Todo en una misión' : `Misión de ${plan.length} días`}</h1><p>${state.progressMode === 'free' ? 'Todos los niveles están disponibles. Este plan funciona como una guía opcional.' : plan.length === 1 ? 'Las 10 tablas están disponibles como un recorrido continuo.' : 'Las tablas se reparten de forma equilibrada, siempre en orden.'}</p></div><button class="secondary-btn compact" data-action="change-plan">Cambiar plan</button></div>
      <div class="plan-grid">
        ${plan.map((tables, index) => dayCard(index + 1, planTitle(index, plan.length), planText(index, plan.length), tables)).join('')}
      </div>
      <section class="panel" style="margin-top:16px"><h2>Ritmo recomendado por día</h2><div class="schedule">
        <span class="schedule-time">Mañana</span><p><strong>15–20 min · Aprender</strong><br><small>Nuevas tablas, sin apuro. Pausa de 5 min al terminar.</small></p>
        <span class="schedule-time">Tarde</span><p><strong>15–20 min · Practicar</strong><br><small>Desafíos individuales y mezclados.</small></p>
        <span class="schedule-time">Noche</span><p><strong>10 min · Recordar</strong><br><small>Repaso inteligente, idealmente sin ayuda.</small></p>
      </div></section>
      <section class="panel"><h3>Consejos para el adulto</h3><p class="subtle">Celebrá el esfuerzo, no solo el resultado. Si aparecen frustración o muchos errores seguidos, conviene una pausa. En tres días se puede lograr mucha práctica; para retener de verdad, continuá con repasos breves durante las semanas siguientes.</p></section>`;
  }

  function planTitle(index, total) {
    if (total === 1) return 'La aventura completa';
    if (index === 0) return 'Bases y confianza';
    if (index === total - 1) return 'El gran desafío';
    return 'Construir conexiones';
  }

  function planText(index, total) {
    if (total === 1) return 'Avanzá a tu ritmo y hacé pausas cuando las necesites.';
    if (index === 0) return 'Empezamos con patrones claros y ganamos velocidad.';
    if (index === total - 1) return 'Mezcla total y consolidación de lo aprendido.';
    return 'Sumamos nuevas tablas y reforzamos las anteriores.';
  }

  function dayCard(day, title, text, tables) {
    const done = tables.filter(n => levelState(n).completed).length;
    return `<section class="day-card"><p class="eyebrow">${state.planDays === 1 ? 'UNA SESIÓN' : `DÍA ${day}`} · ${done}/${tables.length} COMPLETADAS</p><h2>${title}</h2><p>${text}</p><div class="day-tables">${tables.map(n => `<span>${levelState(n).completed ? '✓ ' : ''}Tabla ${n}</span>`).join('')}</div></section>`;
  }

  const badgeDefs = [
    { id:'first', icon:'🌟', title:'Primera estrella', text:'Superá tu primer nivel.', test:() => completedCount() >= 1 },
    { id:'streak5', icon:'🔥', title:'En llamas', text:'Lográ 5 aciertos seguidos.', test:() => state.bestAnswerStreak >= 5 },
    { id:'perfect', icon:'💯', title:'Sin errores', text:'Conseguí 100% en un desafío.', test:() => Object.values(state.levels).some(l => l.challengeBest === 100) },
    { id:'half', icon:'🚀', title:'Mitad del viaje', text:'Dominá 5 tablas.', test:() => completedCount() >= 5 },
    { id:'hundred', icon:'⚡', title:'Cerebro veloz', text:'Respondé 100 cuentas.', test:() => state.totalAnswers >= 100 },
    { id:'master', icon:'👑', title:'Maestro ×10', text:'Dominá todas las tablas.', test:() => completedCount() === 10 }
  ];

  function unlockBadges() {
    for (const badge of badgeDefs) {
      if (badge.test() && !state.badges.includes(badge.id)) {
        state.badges.push(badge.id);
        showToast(`${badge.icon} ¡Nueva insignia: ${badge.title}!`);
      }
    }
  }

  function renderRewards() {
    view = 'rewards';
    setActiveNav('rewards');
    const accuracy = state.totalAnswers ? Math.round(state.totalCorrect / state.totalAnswers * 100) : 0;
    main.innerHTML = `<div class="screen-head"><div><h1>🏆 Sala de premios</h1><p>Todo lo que lograste con práctica y constancia.</p></div></div>
      <section class="panel reward-summary"><div class="big">👑</div><div><p class="eyebrow">AVENTURERO NIVEL ${completedCount() + 1}</p><h2>${escapeHtml(state.playerName || 'Jugador')}</h2><p class="subtle">${state.xp} XP · ${state.stars} estrellas · ${accuracy}% de aciertos</p></div></section>
      <div class="section-head"><div><h2>Insignias</h2><p>${state.badges.length} de ${badgeDefs.length} desbloqueadas</p></div></div>
      <section class="badge-grid">${badgeDefs.map(b => `<article class="badge ${state.badges.includes(b.id) ? '' : 'locked-badge'}"><div class="badge-icon">${b.icon}</div><h3>${b.title}</h3><p>${b.text}</p></article>`).join('')}</section>`;
  }

  function renderSettings() {
    view = 'settings';
    setActiveNav('settings');
    const config = difficultyConfig();
    main.innerHTML = `<div class="screen-head"><div><h1>⚙️ Ajustes</h1><p>Elegí cómo quiere jugar y aprender.</p></div></div>
      <section class="panel"><h2>Forma de responder</h2><p class="subtle">Se puede cambiar en cualquier momento.</p><div class="setting-choice-grid">
        ${settingChoice('choice', '🔢', 'Opciones', 'Elegir una de cuatro respuestas.', state.answerMode, 'set-answer-mode')}
        ${settingChoice('input', '✏️', 'Escribir', 'Completar el resultado a mano.', state.answerMode, 'set-answer-mode')}
      </div></section>
      <section class="panel"><h2>Nivel de dificultad</h2><p class="subtle">Cambia la cantidad de cuentas y el puntaje mínimo.</p><div class="setting-choice-grid three">
        ${settingChoice('calm', '🌱', 'Tranquilo', '8–10 cuentas · 70%', state.difficulty, 'set-difficulty')}
        ${settingChoice('normal', '🚀', 'Normal', '10–12 cuentas · 80%', state.difficulty, 'set-difficulty')}
        ${settingChoice('expert', '⚡', 'Experto', '12–15 cuentas · 90%', state.difficulty, 'set-difficulty')}
      </div><p class="setting-summary">Ahora: <strong>${config.label}</strong> · mínimo ${config.pass}% para avanzar.</p></section>
      <section class="panel"><h2>Modo de recorrido</h2><p class="subtle">Define si los niveles se desbloquean en orden o se pueden elegir libremente.</p><div class="setting-choice-grid">
        ${settingChoice('guided', '🗺️', 'Guiado', 'Completá un nivel para desbloquear el siguiente.', state.progressMode, 'set-progress-mode')}
        ${settingChoice('free', '🕊️', 'Libre', 'Elegí cualquier nivel y cualquier tabla para repasar.', state.progressMode, 'set-progress-mode')}
      </div></section>
      <section class="panel"><div class="settings-row"><span><strong>Sonidos</strong><br><small class="subtle">Melodías y efectos al responder</small></span><button class="toggle ${state.sound ? 'on' : ''}" data-action="toggle-sound" role="switch" aria-checked="${state.sound}"><span></span></button></div>
        <div class="settings-row"><span><strong>Animaciones</strong><br><small class="subtle">Fuegos artificiales y movimientos</small></span><button class="toggle ${state.animations ? 'on' : ''}" data-action="toggle-animations" role="switch" aria-checked="${state.animations}"><span></span></button></div>
        <div class="settings-row"><span><strong>Plan de aprendizaje</strong><br><small class="subtle">${state.planDays === 1 ? 'Todo de una vez' : `Distribuido en ${state.planDays} días`}</small></span><button class="secondary-btn compact" data-action="change-plan">Cambiar</button></div>
        <div class="settings-row"><span><strong>Reiniciar aventura</strong><br><small class="subtle">Borra el progreso de este dispositivo</small></span><button class="danger-btn" data-action="confirm-reset">Reiniciar</button></div>
      </section>`;
  }

  function settingChoice(value, icon, title, text, selected, action) {
    return `<button class="setting-choice ${selected === value ? 'selected' : ''}" data-action="${action}" data-value="${value}" aria-pressed="${selected === value}"><span>${icon}</span><strong>${title}</strong><small>${text}</small></button>`;
  }

  function confirmReset() {
    modalRoot.innerHTML = `<div class="modal-backdrop"><section class="modal-card" role="dialog" aria-modal="true"><div style="font-size:3rem">🧹</div><h2>¿Reiniciar todo?</h2><p>Se borrarán niveles, puntos, premios y progreso. Esta acción no se puede deshacer.</p><button class="danger-btn full" data-action="reset-game">Sí, empezar de cero</button><button class="link-btn" data-action="close-modal" style="margin-top:16px">Cancelar</button></section></div>`;
  }

  function showWelcome() {
    const template = document.getElementById('welcome-template');
    modalRoot.appendChild(template.content.cloneNode(true));
    setTimeout(() => document.getElementById('player-name')?.focus(), 50);
  }

  function showPlanSetup(onboarding = false) {
    planDraft = { days: state.planDays >= 1 ? state.planDays : 3, mode: state.progressMode || 'guided', onboarding };
    renderPlanSetup();
  }

  function renderPlanSetup() {
    const days = planDraft.days;
    const distribution = buildPlan(days);
    modalRoot.innerHTML = `<div class="modal-backdrop"><section class="modal-card plan-modal" role="dialog" aria-modal="true" aria-labelledby="plan-modal-title">
      <div class="plan-modal-icon" aria-hidden="true">📅</div><p class="eyebrow">ANTES DE EMPEZAR</p><h2 id="plan-modal-title">¿Cómo quieren organizar la aventura?</h2><p>El contenido es el mismo; pueden avanzar en orden o elegir libremente.</p>
      <h3 class="plan-section-title">Modo de recorrido</h3>
      <div class="plan-options">
        <button class="plan-option ${planDraft.mode === 'guided' ? 'selected' : ''}" data-action="choose-progression-mode" data-value="guided" aria-pressed="${planDraft.mode === 'guided'}"><span>🗺️</span><strong>Guiado</strong><small>Los niveles se desbloquean en orden.</small></button>
        <button class="plan-option ${planDraft.mode === 'free' ? 'selected' : ''}" data-action="choose-progression-mode" data-value="free" aria-pressed="${planDraft.mode === 'free'}"><span>🕊️</span><strong>Libre</strong><small>Cualquier nivel y repaso, sin bloqueos.</small></button>
      </div>
      <h3 class="plan-section-title">Ritmo sugerido</h3>
      <div class="plan-options">
        <button class="plan-option ${days === 1 ? 'selected' : ''}" data-action="choose-plan" data-value="1" aria-pressed="${days === 1}"><span>⚡</span><strong>Todo de una vez</strong><small>Una misión con las 10 tablas.</small></button>
        <button class="plan-option ${days > 1 ? 'selected' : ''}" data-action="choose-plan" data-value="3" aria-pressed="${days > 1}"><span>🌈</span><strong>En varios días</strong><small>Un poco cada día.</small></button>
      </div>
      ${days > 1 ? `<label class="days-label" for="plan-days">Cantidad de días</label><select id="plan-days" class="days-select" data-action="select-plan-days">${Array.from({ length: 9 }, (_, i) => i + 2).map(n => `<option value="${n}" ${n === days ? 'selected' : ''}>${n} días</option>`).join('')}</select>` : ''}
      <div class="plan-preview"><strong>Así queda:</strong> ${distribution.map((tables, i) => `<span>${days === 1 ? 'Misión' : `Día ${i + 1}`}: ${tables.join(', ')}</span>`).join('')}</div>
      <button class="primary-btn full" data-action="save-plan">${planDraft.onboarding ? '¡Empezar aventura!' : 'Guardar plan'}</button>
      ${planDraft.onboarding ? '' : '<button class="link-btn" data-action="close-modal" style="margin-top:16px">Cancelar</button>'}
    </section></div>`;
  }

  function savePlan() {
    const select = document.getElementById('plan-days');
    state.planDays = select ? Number(select.value) : planDraft.days;
    state.progressMode = planDraft.mode;
    if (state.progressMode === 'guided') syncGuidedUnlock();
    state.planConfigured = true;
    saveState();
    const onboarding = planDraft.onboarding;
    planDraft = null;
    modalRoot.innerHTML = '';
    if (onboarding) {
      launchFireworks('grand');
      playTone('win');
    }
    renderHome();
    showToast(state.progressMode === 'free' ? '🕊️ Modo Libre activado' : state.planDays === 1 ? '⚡ Plan: todo de una vez' : `📅 Plan guiado: ${state.planDays} días`);
  }

  function startGame() {
    const input = document.getElementById('player-name');
    const name = input.value.trim();
    if (!name) {
      input.setAttribute('aria-invalid', 'true');
      input.focus();
      showToast('Escribí el nombre del jugador');
      return;
    }
    state.playerName = name.slice(0, 16);
    saveState();
    showPlanSetup(true);
  }

  function exitActivity() {
    modalRoot.innerHTML = `<div class="modal-backdrop"><section class="modal-card" role="dialog" aria-modal="true"><div style="font-size:3rem">🤔</div><h2>¿Salir por ahora?</h2><p>El progreso de una práctica se guarda al terminarla.</p><button class="primary-btn full" data-action="home">Salir al mapa</button><button class="link-btn" data-action="close-modal" style="margin-top:16px">Seguir jugando</button></section></div>`;
  }

  function showToast(message) {
    const root = document.getElementById('toast-root');
    root.innerHTML = `<div class="toast">${message}</div>`;
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => { root.innerHTML = ''; }, 2800);
  }

  function animationsEnabled() {
    return state.animations && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function animateAnswer(correct) {
    if (!animationsEnabled()) return;
    const card = document.querySelector('.question-card');
    const body = document.querySelector('.quiz-body');
    card?.classList.add(correct ? 'answer-pop' : 'answer-shake');
    body?.insertAdjacentHTML('beforeend', `<span class="reaction-bubble ${correct ? 'happy' : 'try-again'}" aria-hidden="true">${correct ? '✨ ¡Sí! ✨' : '💜 ¡Podés!'}</span>`);
    setTimeout(() => {
      card?.classList.remove('answer-pop', 'answer-shake');
      document.querySelector('.reaction-bubble')?.remove();
    }, 900);
  }

  function launchFireworks(size = 'mini') {
    if (!animationsEnabled()) return;
    const root = document.getElementById('confetti');
    const colors = ['#6c4cff','#30c97b','#ffc83d','#ff5e71','#37a9ff'];
    const bursts = size === 'grand' ? [[22,28],[50,18],[78,30],[35,48],[67,49]] : [[50,38]];
    const sparks = bursts.map(([x, y], burst) => Array.from({ length: size === 'grand' ? 18 : 14 }, (_, i) => {
      const angle = (Math.PI * 2 * i) / (size === 'grand' ? 18 : 14);
      const distance = (size === 'grand' ? 90 : 58) + Math.random() * (size === 'grand' ? 65 : 25);
      return `<i class="firework-spark" style="left:${x}%;top:${y}%;background:${colors[(i + burst) % colors.length]};--dx:${Math.cos(angle) * distance}px;--dy:${Math.sin(angle) * distance}px;animation-delay:${burst * .12}s"></i>`;
    }).join('')).join('');
    const confetti = size === 'grand' ? Array.from({ length: 70 }, (_, i) => `<i class="confetti-piece" style="left:${Math.random()*100}%;background:${colors[i%colors.length]};--drift:${(Math.random()-.5)*180}px;animation-delay:${Math.random()*.45}s"></i>`).join('') : '';
    root.innerHTML = sparks + confetti;
    clearTimeout(launchFireworks.timer);
    launchFireworks.timer = setTimeout(() => { root.innerHTML = ''; }, size === 'grand' ? 2600 : 1050);
  }

  function playTone(type) {
    if (!state.sound) return;
    try {
      audioContext = audioContext || new (window.AudioContext || window.webkitAudioContext)();
      audioContext.resume?.();
      const sequences = {
        good: [[659, 0, .10], [784, .08, .11], [988, .17, .18]],
        bad: [[294, 0, .14], [247, .13, .20]],
        win: [[523, 0, .16], [659, .12, .16], [784, .24, .18], [1047, .40, .34]]
      };
      (sequences[type] || sequences.good).forEach(([frequency, delay, duration], i) => {
        const oscillator = audioContext.createOscillator();
        const gain = audioContext.createGain();
        oscillator.connect(gain); gain.connect(audioContext.destination);
        oscillator.type = type === 'bad' ? 'sine' : (i % 2 ? 'triangle' : 'sine');
        oscillator.frequency.value = frequency;
        const start = audioContext.currentTime + delay;
        const volume = type === 'bad' ? .045 : type === 'win' ? .09 : .075;
        gain.gain.setValueAtTime(.001, start);
        gain.gain.exponentialRampToValueAtTime(volume, start + .018);
        gain.gain.exponentialRampToValueAtTime(.001, start + duration);
        oscillator.start(start); oscillator.stop(start + duration + .02);
      });
    } catch (_) { /* Audio is optional. */ }
  }

  document.addEventListener('click', event => {
    const button = event.target.closest('[data-action]');
    if (!button || button.disabled) return;
    const action = button.dataset.action;
    const n = Number(button.dataset.level);
    const actions = {
      home: () => { modalRoot.innerHTML = ''; planDraft = null; renderHome(); },
      review: renderReview,
      plan: renderPlan,
      rewards: renderRewards,
      settings: renderSettings,
      'open-level': () => openLevel(n),
      'close-modal': () => { modalRoot.innerHTML = ''; planDraft = null; },
      'start-game': startGame,
      'start-learn': () => startLesson(n),
      'start-practice': () => startQuiz('practice', n),
      'start-challenge': () => startQuiz('challenge', n),
      'start-review': startReview,
      'toggle-review-table': () => {
        selectedReviewTables = selectedReviewTables.includes(n) ? selectedReviewTables.filter(table => table !== n) : [...selectedReviewTables, n];
        renderReview();
      },
      'review-select-all': () => { selectedReviewTables = Array.from({ length: TABLES }, (_, i) => i + 1); renderReview(); },
      'review-clear': () => { selectedReviewTables = []; renderReview(); },
      'lesson-next': () => completeLessonStep('next'),
      'lesson-back': () => completeLessonStep('back'),
      'exit-lesson': exitActivity,
      'exit-quiz': exitActivity,
      answer: () => answerQuestion(button.dataset.value),
      'next-question': nextQuestion,
      'retry-quiz': retryQuiz,
      'change-plan': () => showPlanSetup(false),
      'choose-plan': () => { planDraft.days = Number(button.dataset.value) === 1 ? 1 : (planDraft.days > 1 ? planDraft.days : 3); renderPlanSetup(); },
      'choose-progression-mode': () => { planDraft.mode = button.dataset.value; renderPlanSetup(); },
      'save-plan': savePlan,
      'set-answer-mode': () => { state.answerMode = button.dataset.value; saveState(); renderSettings(); showToast(state.answerMode === 'choice' ? '🔢 Respuestas con opciones' : '✏️ Respuestas escritas'); },
      'set-difficulty': () => { state.difficulty = button.dataset.value; saveState(); renderSettings(); showToast(`Nivel ${difficultyConfig().label}`); },
      'set-progress-mode': () => {
        state.progressMode = button.dataset.value === 'free' ? 'free' : 'guided';
        if (state.progressMode === 'guided') syncGuidedUnlock();
        saveState();
        renderSettings();
        showToast(state.progressMode === 'free' ? '🕊️ Modo Libre activado' : '🗺️ Modo Guiado activado');
      },
      'toggle-sound': () => { state.sound = !state.sound; saveState(); renderSettings(); if (state.sound) playTone('good'); },
      'toggle-animations': () => { state.animations = !state.animations; saveState(); renderSettings(); },
      'confirm-reset': confirmReset,
      'reset-game': () => { state = defaultState(); planDraft = null; localStorage.removeItem(STORAGE_KEY); modalRoot.innerHTML = ''; renderHome(); showWelcome(); }
    };
    actions[action]?.();
  });

  document.addEventListener('submit', event => {
    if (!event.target.matches('[data-quiz-form]')) return;
    event.preventDefault();
    answerQuestion(document.getElementById('manual-value')?.value);
  });

  document.addEventListener('change', event => {
    if (event.target.id !== 'plan-days' || !planDraft) return;
    planDraft.days = Number(event.target.value);
    renderPlanSetup();
  });

  modalRoot.addEventListener('click', event => {
    if (event.target.classList.contains('modal-backdrop') && !planDraft?.onboarding) {
      modalRoot.innerHTML = '';
      planDraft = null;
    }
  });

  document.addEventListener('keydown', event => {
    if (view === 'quiz' && state.answerMode === 'choice' && !quiz?.answered && ['1','2','3','4'].includes(event.key)) {
      const button = document.querySelectorAll('.answer-btn')[Number(event.key) - 1];
      button?.click();
    } else if (view === 'quiz' && quiz?.answered && event.key === 'Enter') {
      document.querySelector('[data-action="next-question"]')?.click();
    } else if (event.key === 'Escape' && modalRoot.innerHTML && !planDraft?.onboarding) {
      modalRoot.innerHTML = '';
      planDraft = null;
    } else if (event.key === 'Enter' && document.activeElement?.id === 'player-name') {
      startGame();
    }
  });

  // Small public surface used by automated tests; gameplay stays dependency-free.
  window.MultiplyEngine = { defaultState, makeQuestion, buildQuestionSet, buildPlan, shuffle, factKey, PASS_SCORE, DIFFICULTIES };

  updateVisitStreak();
  updateTopbar();
  renderHome();
  if (!state.playerName) showWelcome();
  else if (!state.planConfigured) showPlanSetup(true);
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
  }
})();
