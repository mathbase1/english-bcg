const CONFIG = window.ENGLISH_MARKER_CONFIG || {};
const BACKEND_BASE_URL = String(CONFIG.backendBaseUrl || "").replace(/\/+$/, "");
const AUTH_TOKEN_KEY = "englishBcg:accessToken";
const SELECTED_PAPER_KEY = "englishBcg:selectedPaper";
const ACTIVE_PACK_PREFIX = "englishBcg:activePack:";
const ANSWERS_PREFIX = "englishBcg:answers:";
const RESULTS_PREFIX = "englishBcg:results:";
const TARGETS_PREFIX = "englishBcg:targets:";
const APP_VERSION = "3.0.0";

const PAPER_CONFIG = {
  "Paper 1": {
    id: "Paper 1",
    title: "Explorations in Creative Reading and Writing",
    time: "1 hour 25 minutes",
    sourceQuestionNumbers: ["Question 1", "Question 2", "Question 4", "Question 5"]
  },
  "Paper 2": {
    id: "Paper 2",
    title: "Writers' Viewpoints and Perspectives",
    time: "1 hour 25 minutes",
    sourceQuestionNumbers: ["Question 1", "Question 2", "Question 4", "Question 5"],
    overrides: {
      "Question 4": {
        markCategory: 20,
        assessmentObjective: "AO3",
        rubricName: "AO3 comparison",
        rubricNotes: "Mark out of 20. Reward an integrated comparison of viewpoints and how methods present them, supported by both sources."
      }
    }
  }
};

const state = {
  bank: null,
  selectedPaper: localStorage.getItem(SELECTED_PAPER_KEY) || "Paper 1",
  currentPack: null,
  answers: {},
  results: [],
  targets: null,
  token: sessionStorage.getItem(AUTH_TOKEN_KEY) || "",
  started: false,
  busy: null,
  saveTimer: null,
  notice: { message: "Marked work will appear here.", kind: "info" }
};

const dom = {
  authGate: document.getElementById("auth-gate"),
  accessForm: document.getElementById("access-form"),
  accessPassword: document.getElementById("access-password"),
  accessSubmit: document.getElementById("access-submit"),
  accessStatus: document.getElementById("access-status"),
  app: document.getElementById("app"),
  paperMode: document.getElementById("paper-mode"),
  generatePaperBtn: document.getElementById("generate-paper-btn"),
  clearAnswersBtn: document.getElementById("clear-answers-btn"),
  currentPaperMeta: document.getElementById("current-paper-meta"),
  paperView: document.getElementById("paper-view"),
  markPaperBtn: document.getElementById("mark-paper-btn"),
  generateTargetsBtn: document.getElementById("generate-targets-btn"),
  copyFeedbackBtn: document.getElementById("copy-feedback-btn"),
  resultWindow: document.getElementById("result-window"),
  targetsPanel: document.getElementById("targets-panel"),
  targetsWindow: document.getElementById("targets-window"),
  saveStatus: document.getElementById("save-status"),
  toast: document.getElementById("toast")
};

bindAccessEvents();
if (state.token) {
  unlockApp();
}

function bindAccessEvents() {
  dom.accessForm.addEventListener("submit", authenticate);
}

async function authenticate(event) {
  event.preventDefault();
  const password = dom.accessPassword.value;
  if (!password) return;

  if (!isBackendConfigured()) {
    dom.accessStatus.textContent = "The website has not yet been connected to its Vercel backend.";
    return;
  }

  dom.accessSubmit.disabled = true;
  dom.accessSubmit.classList.add("loading-inline");
  dom.accessStatus.textContent = "Checking access…";

  try {
    const data = await requestJson("/api/auth", {
      method: "POST",
      body: { password },
      auth: false
    });
    state.token = data.token;
    sessionStorage.setItem(AUTH_TOKEN_KEY, state.token);
    dom.accessPassword.value = "";
    dom.accessStatus.textContent = "";
    unlockApp();
  } catch (error) {
    dom.accessStatus.textContent = error.message || "Access could not be verified.";
  } finally {
    dom.accessSubmit.disabled = false;
    dom.accessSubmit.classList.remove("loading-inline");
  }
}

function unlockApp() {
  dom.authGate.hidden = true;
  dom.app.hidden = false;
  if (!state.started) startApp();
}

function lockApp(message = "Your secure session has expired. Ask your teacher to enter the password again.") {
  state.token = "";
  sessionStorage.removeItem(AUTH_TOKEN_KEY);
  dom.app.hidden = true;
  dom.authGate.hidden = false;
  dom.accessStatus.textContent = message;
  dom.accessPassword.focus();
}

async function startApp() {
  state.started = true;
  bindAppEvents();
  if (!PAPER_CONFIG[state.selectedPaper]) state.selectedPaper = "Paper 1";
  dom.paperMode.value = state.selectedPaper;
  syncButtons();
  renderResults();
  await loadBank();
}

function bindAppEvents() {
  dom.paperMode.addEventListener("change", () => {
    state.selectedPaper = dom.paperMode.value;
    localStorage.setItem(SELECTED_PAPER_KEY, state.selectedPaper);
    loadSavedOrRandomPack(state.selectedPaper);
  });

  dom.generatePaperBtn.addEventListener("click", () => {
    if (!state.bank || state.busy) return;
    generateNewPaper(state.selectedPaper);
  });

  dom.clearAnswersBtn.addEventListener("click", clearCurrentPaper);
  dom.markPaperBtn.addEventListener("click", markCurrentPaper);
  dom.generateTargetsBtn.addEventListener("click", generateTargets);
  dom.copyFeedbackBtn.addEventListener("click", copyFeedback);
  dom.paperView.addEventListener("input", handleAnswerInput);
  dom.paperView.addEventListener("change", handleAnswerInput);
  dom.resultWindow.addEventListener("click", handleResultAction);
}

async function loadBank() {
  let bank = window.ENGLISH_QUESTION_BANK;
  if (!isValidBank(bank)) {
    try {
      const response = await fetch("data/question-bank.json", { cache: "no-store" });
      if (response.ok) bank = await response.json();
    } catch {
      bank = null;
    }
  }

  if (!isValidBank(bank)) {
    dom.paperView.innerHTML = '<div class="notice error">The question bank could not be loaded.</div>';
    setNotice("The question bank could not be loaded.", "error");
    renderResults();
    return;
  }

  state.bank = bank;
  loadSavedOrRandomPack(state.selectedPaper);
}

function isValidBank(bank) {
  return Boolean(bank && Array.isArray(bank.packs) && bank.packs.length);
}

function loadSavedOrRandomPack(paperId) {
  const candidates = getPacksForPaper(paperId);
  if (!candidates.length) return;
  const savedId = localStorage.getItem(ACTIVE_PACK_PREFIX + paperId);
  const savedPack = candidates.find((pack) => pack.id === savedId);
  activatePack(savedPack || sampleOne(candidates));
}

function generateNewPaper(paperId) {
  const candidates = getPacksForPaper(paperId);
  if (!candidates.length) return;
  const alternatives = candidates.filter((pack) => pack.id !== state.currentPack?.basePackId);
  activatePack(sampleOne(alternatives.length ? alternatives : candidates));
  showToast("A new scenario has been generated.");
}

function getPacksForPaper(paperId) {
  return (state.bank?.packs || []).filter((pack) => pack.paper === paperId);
}

function activatePack(basePack) {
  const paperConfig = PAPER_CONFIG[basePack.paper];
  const questions = paperConfig.sourceQuestionNumbers
    .map((number) => basePack.questions.find((question) => question.questionNumber === number))
    .filter(Boolean)
    .map((question, index) => prepareQuestion(question, paperConfig, index));

  state.currentPack = {
    ...basePack,
    basePackId: basePack.id,
    id: `${basePack.id}__complete`,
    paperTitle: paperConfig.title,
    displayTime: paperConfig.time,
    questions
  };

  localStorage.setItem(ACTIVE_PACK_PREFIX + basePack.paper, basePack.id);
  state.answers = readJson(ANSWERS_PREFIX + state.currentPack.id, {});
  state.results = restoreValidResults(readJson(RESULTS_PREFIX + state.currentPack.id, []));
  state.targets = readJson(TARGETS_PREFIX + state.currentPack.id, null);
  if (state.results.length !== questions.length || hasFailedResults()) {
    state.targets = null;
  }

  setNotice(
    state.results.length
      ? "Saved marking has been restored. Edit an answer to replace its saved result."
      : "Your paper is ready. Answers are saved automatically in this browser.",
    "info"
  );
  renderPaper();
  renderResults();
  renderTargets();
  syncButtons();
}

function prepareQuestion(sourceQuestion, paperConfig, index) {
  const question = structuredCloneSafe(sourceQuestion);
  const originalQuestionNumber = question.questionNumber;
  const override = paperConfig.overrides?.[originalQuestionNumber];

  question.originalQuestionNumber = originalQuestionNumber;
  question.displayQuestionNumber = `Question ${index + 1}`;
  question.questionNumber = question.displayQuestionNumber;

  if (override) {
    question.markCategory = override.markCategory;
    question.assessmentObjective = override.assessmentObjective;
    question.rubric = {
      ...(question.rubric || {}),
      name: override.rubricName,
      maxScore: override.markCategory,
      notes: override.rubricNotes
    };
  }

  question.instructionsTop = displayInstruction(question);
  question.wordLimit = getWordLimit(question);
  return question;
}

function displayInstruction(question) {
  switch (question.questionType) {
    case "select-true-statements":
      return "Read the opening section of the source carefully.";
    case "language-analysis":
      return "Read the relevant section of Source A carefully.";
    case "summary-compare":
      return "Refer to both Source A and Source B.";
    case "evaluation":
      return "Focus on the second half of Source A.";
    case "compare-perspectives":
      return "Compare Source A and Source B throughout your response.";
    case "creative-writing":
    case "viewpoint-writing":
      return "Plan briefly, then write a complete response to the task.";
    default:
      return question.instructionsTop || "Answer the question.";
  }
}

function getWordLimit(question) {
  if (question.questionType === "select-true-statements") return 0;
  if (question.questionType === "summary-compare") return 240;
  if (question.markCategory === 8) return 220;
  if (question.markCategory === 20) return 520;
  if (question.markCategory === 40) return 900;
  return 300;
}

function renderPaper() {
  const pack = state.currentPack;
  if (!pack) return;
  const totalMarks = pack.questions.reduce((sum, question) => sum + Number(question.markCategory || 0), 0);
  const reading = pack.questions.filter((question) => String(question.section).includes("Section A"));
  const writing = pack.questions.filter((question) => String(question.section).includes("Section B"));

  dom.currentPaperMeta.innerHTML = `
    <div class="meta-card"><strong>${escapeHtml(pack.paper)}</strong><br>${escapeHtml(pack.paperTitle)}</div>
    <div class="meta-card"><strong>Time allowed</strong><br>${escapeHtml(pack.displayTime)}</div>
    <div class="meta-card"><strong>Total marks</strong><br>${totalMarks}</div>
    <div class="meta-card"><strong>Scenario</strong><br>${escapeHtml(pack.title)}</div>
  `;

  dom.paperView.innerHTML = `
    <div class="exam-front">
      <div class="exam-title-row">
        <div>
          <p class="paper-brand">GCSE English Language</p>
          <h1>${escapeHtml(pack.paper)}</h1>
          <p class="paper-subtitle">${escapeHtml(pack.paperTitle)}</p>
        </div>
        <div class="total-badge">${totalMarks} marks</div>
      </div>
      <div class="front-boxes">
        <div class="front-box"><strong>Instructions</strong><br>Answer all four questions. The paper contains Reading and Writing sections.</div>
        <div class="front-box"><strong>Time allowed</strong><br>${escapeHtml(pack.displayTime)}</div>
      </div>
    </div>
    <section class="paper-section">
      <div class="section-title">Section A: Reading</div>
      ${renderSource(pack.sourceA)}
      ${pack.sourceB ? renderSource(pack.sourceB) : ""}
      <div class="questions-area">${reading.map(renderQuestion).join("")}</div>
    </section>
    <section class="paper-section">
      <div class="section-title">Section B: Writing</div>
      <div class="questions-area">${writing.map(renderQuestion).join("")}</div>
    </section>
  `;

  updateAllWordCounters();
}

function renderSource(source) {
  if (!source) return "";
  const paragraphs = groupIntoParagraphs(Array.isArray(source.lines) ? source.lines : [], 3);
  return `
    <article class="source-block">
      <header class="source-header">
        <h2>${escapeHtml(source.label)}: ${escapeHtml(source.title)}</h2>
        <div class="source-meta">${escapeHtml(source.genre || "Original practice extract")} · ${escapeHtml(source.period || "")}</div>
      </header>
      <div class="source-prose">
        ${paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("")}
      </div>
    </article>
  `;
}

function groupIntoParagraphs(lines, size) {
  const groups = [];
  for (let index = 0; index < lines.length; index += size) {
    groups.push(lines.slice(index, index + size).join(" "));
  }
  return groups;
}

function renderQuestion(question) {
  const stored = state.answers[question.id];
  const answerArea = question.questionType === "select-true-statements"
    ? renderMcq(question, Array.isArray(stored) ? stored : [])
    : renderTextarea(question, typeof stored === "string" ? stored : "");

  return `
    <article class="question-card" id="card-${escapeHtml(question.id)}">
      <header class="question-header">
        <div>
          <h3>${escapeHtml(question.displayQuestionNumber)}</h3>
          <div class="question-meta">${escapeHtml(question.assessmentObjective || "")} · ${escapeHtml(question.section || "")}</div>
        </div>
        <div class="mark-chip">${Number(question.markCategory)} marks</div>
      </header>
      <p class="question-instruction">${escapeHtml(question.instructionsTop || "")}</p>
      ${question.statement ? `<div class="statement-box"><strong>Statement:</strong> ${escapeHtml(question.statement)}</div>` : ""}
      <p class="question-text">${escapeHtml(question.questionText || "")}</p>
      ${renderTaskBullets(question.bulletPoints)}
      ${answerArea}
    </article>
  `;
}

function renderTaskBullets(items) {
  if (!Array.isArray(items) || !items.length) return "";
  return `<ul class="bullets">${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
}

function renderMcq(question, selected) {
  const selectedSet = new Set(selected.map((item) => String(item).toUpperCase()));
  return `
    <div class="answer-wrap">
      <div class="answer-topline">
        <span class="small-label">Select four answers</span>
        <span class="word-counter" id="counter-${escapeHtml(question.id)}">${selectedSet.size}/4 selected</span>
      </div>
      <p class="mcq-instruction">Tick exactly four statements. Each correct choice is worth one mark.</p>
      <div class="mcq-grid">
        ${(question.options || []).map((option, index) => {
          const letter = getOptionLetter(index);
          const text = String(option).replace(/^\s*[A-Z][.)]\s*/, "");
          return `
            <label class="mcq-option">
              <input type="checkbox" class="mcq-input" data-question-id="${escapeHtml(question.id)}" value="${letter}" ${selectedSet.has(letter) ? "checked" : ""}>
              <span class="mcq-letter">${letter}</span>
              <span>${escapeHtml(text)}</span>
            </label>
          `;
        }).join("")}
      </div>
    </div>
  `;
}

function renderTextarea(question, value) {
  const longClass = question.markCategory === 40 ? " long-answer" : "";
  return `
    <div class="answer-wrap">
      <div class="answer-topline">
        <label class="small-label" for="answer-${escapeHtml(question.id)}">Your answer</label>
        <span class="word-counter" id="counter-${escapeHtml(question.id)}">0/${question.wordLimit} words</span>
      </div>
      <textarea
        id="answer-${escapeHtml(question.id)}"
        class="answer-field${longClass}"
        data-question-id="${escapeHtml(question.id)}"
        data-word-limit="${question.wordLimit}"
        spellcheck="true"
        placeholder="Write your response here. Your work saves automatically in this browser."
      >${escapeHtml(value)}</textarea>
    </div>
  `;
}

function handleAnswerInput(event) {
  const target = event.target;
  if (!(target instanceof HTMLElement) || !state.currentPack) return;

  if (target.classList.contains("answer-field")) {
    const id = target.dataset.questionId;
    const limit = Number(target.dataset.wordLimit || 0);
    const limited = limitTextToWords(target.value, limit);
    if (limited !== target.value) {
      target.value = limited;
      showToast(`The ${limit}-word limit has been reached.`);
    }
    state.answers[id] = target.value;
    updateWordCounter(id, target.value, limit);
    invalidateQuestionResult(id);
    scheduleSave();
    return;
  }

  if (target.classList.contains("mcq-input")) {
    const id = target.dataset.questionId;
    const boxes = Array.from(dom.paperView.querySelectorAll(`.mcq-input[data-question-id="${cssEscape(id)}"]`));
    const checked = boxes.filter((box) => box.checked);
    if (checked.length > 4) {
      target.checked = false;
      showToast("Choose no more than four statements.");
    }
    const selected = boxes.filter((box) => box.checked).map((box) => box.value).slice(0, 4);
    state.answers[id] = selected;
    const counter = document.getElementById(`counter-${id}`);
    if (counter) counter.textContent = `${selected.length}/4 selected`;
    invalidateQuestionResult(id);
    scheduleSave();
  }
}

function updateAllWordCounters() {
  for (const question of state.currentPack?.questions || []) {
    if (question.wordLimit) {
      updateWordCounter(question.id, String(state.answers[question.id] || ""), question.wordLimit);
    }
  }
}

function updateWordCounter(questionId, text, limit) {
  const counter = document.getElementById(`counter-${questionId}`);
  if (!counter) return;
  const count = countWords(text);
  counter.textContent = `${count}/${limit} words`;
  counter.classList.toggle("near", count >= Math.floor(limit * 0.9) && count < limit);
  counter.classList.toggle("at-limit", count >= limit);
}

function scheduleSave() {
  dom.saveStatus.textContent = "Saving…";
  dom.saveStatus.classList.add("saving");
  clearTimeout(state.saveTimer);
  state.saveTimer = setTimeout(() => {
    persistCurrentState();
    dom.saveStatus.textContent = "Answers saved";
    dom.saveStatus.classList.remove("saving");
  }, 220);
}

function persistCurrentState() {
  if (!state.currentPack) return;
  writeJson(ANSWERS_PREFIX + state.currentPack.id, state.answers);
  writeJson(RESULTS_PREFIX + state.currentPack.id, state.results);
  if (state.targets) writeJson(TARGETS_PREFIX + state.currentPack.id, state.targets);
  else localStorage.removeItem(TARGETS_PREFIX + state.currentPack.id);
}

function invalidateQuestionResult(questionId) {
  const before = state.results.length;
  state.results = state.results.filter((entry) => entry.question.id !== questionId);
  if (state.results.length !== before || state.targets) {
    state.targets = null;
    setNotice("An answer changed. Mark the updated question, then generate targets again.", "info");
    renderResults();
    renderTargets();
    syncButtons();
  }
}

function clearCurrentPaper() {
  if (!state.currentPack || state.busy) return;
  const confirmed = window.confirm("Clear all saved answers, feedback and targets for this scenario?");
  if (!confirmed) return;

  state.answers = {};
  state.results = [];
  state.targets = null;
  localStorage.removeItem(ANSWERS_PREFIX + state.currentPack.id);
  localStorage.removeItem(RESULTS_PREFIX + state.currentPack.id);
  localStorage.removeItem(TARGETS_PREFIX + state.currentPack.id);
  setNotice("This paper has been cleared.", "info");
  renderPaper();
  renderResults();
  renderTargets();
  syncButtons();
}

async function markCurrentPaper() {
  if (!state.currentPack || state.busy) return;
  if (!isBackendConfigured()) {
    setNotice("The website has not yet been connected to its Vercel backend.", "error");
    renderResults();
    return;
  }

  state.busy = { type: "full" };
  state.targets = null;
  setNotice("Marking the paper one question at a time…", "info");
  renderTargets();
  syncButtons();
  renderResults();

  const existing = new Map(state.results.map((entry) => [entry.question.id, entry]));
  const nextResults = [];

  for (let index = 0; index < state.currentPack.questions.length; index += 1) {
    const question = state.currentPack.questions[index];
    const fingerprint = answerFingerprint(state.answers[question.id]);
    const saved = existing.get(question.id);

    if (saved && saved.answerFingerprint === fingerprint && ["ok", "local", "blank"].includes(saved.status)) {
      nextResults.push(saved);
    } else {
      const entry = await markSingleQuestion(question, saved);
      nextResults.push(entry);
    }

    state.results = nextResults.slice();
    persistCurrentState();
    renderResults();

    if (index < state.currentPack.questions.length - 1 && question.questionType !== "select-true-statements") {
      await wait(650);
    }
  }

  state.busy = null;
  const errors = countFailedResults();
  setNotice(
    errors
      ? `${errors} question${errors === 1 ? " needs" : "s need"} another attempt. Use Mark again on the affected card after waiting briefly.`
      : "The paper has been marked. Generate the four CENTURY Nugget targets next.",
    errors ? "error" : "success"
  );
  persistCurrentState();
  renderResults();
  syncButtons();
}

async function markSingleQuestion(question, previousEntry = null) {
  const rawAnswer = state.answers[question.id];
  const attemptCount = Number(previousEntry?.attemptCount || 0) + 1;
  const fingerprint = answerFingerprint(rawAnswer);

  if (question.questionType === "select-true-statements") {
    return {
      question: compactQuestion(question),
      result: markMultipleChoice(question, Array.isArray(rawAnswer) ? rawAnswer : []),
      status: "local",
      attemptCount,
      answerFingerprint: fingerprint
    };
  }

  const answer = String(rawAnswer || "").trim();
  if (!answer) {
    return {
      question: compactQuestion(question),
      result: buildBlankResult(question),
      status: "blank",
      attemptCount,
      answerFingerprint: fingerprint
    };
  }

  try {
    const payload = buildMarkPayload(question, answer);
    const result = await requestJson("/api/mark", {
      method: "POST",
      body: payload,
      auth: true
    });
    return {
      question: compactQuestion(question),
      result,
      status: "ok",
      attemptCount,
      answerFingerprint: fingerprint
    };
  } catch (error) {
    if (error.status === 401) {
      lockApp();
    }
    return {
      question: compactQuestion(question),
      result: buildFailedResult(question, error),
      status: "error",
      attemptCount,
      answerFingerprint: fingerprint
    };
  }
}

function buildMarkPayload(question, answer) {
  return {
    question: compactQuestion(question),
    answer,
    packMeta: buildPackMeta(question)
  };
}

function compactQuestion(question) {
  return {
    id: question.id,
    questionNumber: question.questionNumber,
    displayQuestionNumber: question.displayQuestionNumber,
    originalQuestionNumber: question.originalQuestionNumber,
    section: question.section,
    markCategory: question.markCategory,
    questionType: question.questionType,
    assessmentObjective: question.assessmentObjective,
    instructionsTop: question.instructionsTop,
    focusLines: question.focusLines,
    statement: question.statement || "",
    questionText: question.questionText,
    bulletPoints: Array.isArray(question.bulletPoints) ? question.bulletPoints : [],
    wordLimit: question.wordLimit,
    rubric: question.rubric || {}
  };
}

function buildPackMeta(question) {
  const pack = state.currentPack;
  const needsNoSource = ["creative-writing", "viewpoint-writing"].includes(question.questionType);
  const needsBoth = ["summary-compare", "compare-perspectives"].includes(question.questionType);

  return {
    paper: pack.paper,
    paperTitle: pack.paperTitle,
    title: pack.title,
    sourceA: needsNoSource ? null : relevantSource(pack.sourceA, question, needsBoth),
    sourceB: needsBoth ? relevantSource(pack.sourceB, question, true) : null
  };
}

function relevantSource(source, question, wholeSource) {
  if (!source) return null;
  if (wholeSource || /whole|both/i.test(String(question.focusLines || ""))) {
    return { ...source, lines: [...(source.lines || [])] };
  }

  const range = parseLineRange(String(question.focusLines || ""), (source.lines || []).length);
  const lines = range
    ? (source.lines || []).slice(range.start - 1, range.end)
    : [...(source.lines || [])];
  return { ...source, lines };
}

function parseLineRange(text, total) {
  const range = text.match(/lines?\s+(\d+)\s+(?:to|-)\s+(\d+)/i);
  if (range) return { start: Number(range[1]), end: Math.min(total, Number(range[2])) };
  const toEnd = text.match(/lines?\s+(\d+)\s+to\s+the\s+end/i);
  if (toEnd) return { start: Number(toEnd[1]), end: total };
  return null;
}

async function remarkQuestion(questionId) {
  if (!state.currentPack || state.busy) return;
  const question = state.currentPack.questions.find((item) => item.id === questionId);
  if (!question) return;
  const previous = state.results.find((entry) => entry.question.id === questionId);

  state.busy = { type: "retry", questionId };
  state.targets = null;
  setNotice(`Marking ${question.displayQuestionNumber} again with its original task and source context…`, "info");
  renderTargets();
  syncButtons();
  renderResults();

  const updated = await markSingleQuestion(question, previous);
  const index = state.results.findIndex((entry) => entry.question.id === questionId);
  if (index >= 0) state.results.splice(index, 1, updated);
  else state.results.push(updated);
  state.results.sort((a, b) => questionOrder(a.question.id) - questionOrder(b.question.id));

  state.busy = null;
  const failed = countFailedResults();
  setNotice(
    updated.status === "error"
      ? `${question.displayQuestionNumber} could not be marked. Wait briefly, then use Mark again for this question only.`
      : failed
        ? `${question.displayQuestionNumber} is complete. ${failed} question${failed === 1 ? " still needs" : "s still need"} another attempt.`
        : `${question.displayQuestionNumber} is complete. Generate targets after all feedback is ready.`,
    updated.status === "error" || failed ? "error" : "success"
  );
  persistCurrentState();
  renderResults();
  syncButtons();
}

function handleResultAction(event) {
  const button = event.target.closest("[data-action='remark-question']");
  if (!button) return;
  remarkQuestion(button.dataset.questionId);
}

async function generateTargets() {
  if (state.busy || !state.currentPack) return;
  if (state.results.length !== state.currentPack.questions.length) {
    setNotice("Mark the paper first, then click Generate targets.", "error");
    renderResults();
    showToast("Mark the paper first.");
    return;
  }
  if (hasFailedResults()) {
    setNotice("Use Mark again on every failed question before generating targets.", "error");
    renderResults();
    return;
  }

  state.busy = { type: "targets" };
  setNotice("Selecting four CENTURY Nugget targets from the examiner feedback…", "info");
  syncButtons();
  renderResults();

  try {
    state.targets = await requestJson("/api/targets", {
      method: "POST",
      auth: true,
      body: {
        paper: `${state.currentPack.paper} — ${state.currentPack.paperTitle}`,
        results: state.results.map((entry) => ({
          status: entry.status,
          question: entry.question,
          result: entry.result
        }))
      }
    });
    setNotice("Targets generated. Copy to clipboard now includes the marks, feedback and all four targets.", "success");
    persistCurrentState();
    renderTargets();
    requestAnimationFrame(() => dom.targetsPanel.scrollIntoView({ behavior: "smooth", block: "start" }));
  } catch (error) {
    if (error.status === 401) lockApp();
    setNotice(error.message || "Targets could not be generated.", "error");
  } finally {
    state.busy = null;
    renderResults();
    syncButtons();
  }
}

function renderResults() {
  const notice = renderNotice();
  if (!state.currentPack || !state.results.length) {
    dom.resultWindow.innerHTML = `${notice}<p class="muted">Marked work will appear here.</p>`;
    return;
  }

  const totals = calculateTotals();
  const failed = countFailedResults();
  const summary = state.busy?.type === "full"
    ? `Marked ${state.results.length} of ${state.currentPack.questions.length} questions so far.`
    : failed
      ? `${failed} question${failed === 1 ? " needs" : "s need"} another attempt.`
      : "All available questions have a marking result.";

  dom.resultWindow.innerHTML = `
    ${notice}
    <div class="result-summary">
      <div class="result-total">${totals.score}/${totals.max}</div>
      <div><strong>${escapeHtml(state.currentPack.paper)} — ${escapeHtml(state.currentPack.title)}</strong><br><span class="muted">${escapeHtml(summary)}</span></div>
    </div>
    <div class="result-list">${state.results.map(renderResultCard).join("")}</div>
  `;
}

function renderNotice() {
  return `<div class="notice ${state.notice.kind === "error" ? "error" : state.notice.kind === "success" ? "success" : ""}">${escapeHtml(state.notice.message)}</div>`;
}

function renderResultCard(entry) {
  const question = entry.question;
  const result = entry.result || {};
  const strengths = Array.isArray(result.strengths) ? result.strengths : [];
  const weaknesses = Array.isArray(result.weaknesses) ? result.weaknesses : [];
  const isRetrying = state.busy?.type === "retry" && state.busy.questionId === question.id;
  const showSubscores = Number(question.markCategory) === 40;

  return `
    <article class="result-card">
      <div class="result-card-head">
        <div>
          <strong>${escapeHtml(question.displayQuestionNumber || question.questionNumber)}</strong>
          <div class="muted">${escapeHtml(question.assessmentObjective || "")} · ${Number(question.markCategory)} marks</div>
        </div>
        <div class="question-score">${Number(result.score || 0)}/${Number(result.max_score || question.markCategory || 0)}</div>
      </div>
      <div class="badge-row">
        ${result.level ? `<span class="badge">${escapeHtml(result.level)}</span>` : ""}
        ${result.level_position && result.level_position !== "Not applicable" ? `<span class="badge">${escapeHtml(result.level_position)} of level</span>` : ""}
        ${statusPill(entry.status)}
      </div>
      ${showSubscores ? `
        <div class="subscore-box">
          <div><strong>AO5 content and organisation:</strong> ${Number(result.subscores?.content_and_organisation || 0)}/24</div>
          <div><strong>AO6 technical accuracy:</strong> ${Number(result.subscores?.technical_accuracy || 0)}/16</div>
        </div>
      ` : ""}
      <div class="feedback-columns">
        <div class="feedback-box">
          <h4>What you did well</h4>
          ${strengths.length ? `<ul class="breakdown-list">${strengths.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : '<p class="muted">No secure strength was identified.</p>'}
        </div>
        <div class="feedback-box">
          <h4>What is holding you back</h4>
          ${weaknesses.length ? `<ul class="breakdown-list">${weaknesses.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : '<p class="muted">No improvement point was returned.</p>'}
        </div>
      </div>
      <div class="explanation-block">
        <p><strong>Why this mark:</strong> ${escapeHtml(result.why_this_mark || "No explanation returned.")}</p>
        <p><strong>How to move up:</strong> ${escapeHtml(result.next_level || "Develop the answer further.")}</p>
        ${result.model_fragment ? `<div class="model-fragment"><strong>Model fragment:</strong> ${escapeHtml(result.model_fragment)}</div>` : ""}
        <p><strong>Next-paper target:</strong> ${Number(result.target_mark_min || 0)}–${Number(result.target_mark_max || 0)}/${Number(result.max_score || question.markCategory || 0)}</p>
      </div>
      <div class="result-card-actions button-row">
        <button type="button" class="ghost-btn retry-btn" data-action="remark-question" data-question-id="${escapeHtml(question.id)}" ${state.busy ? "disabled" : ""}>${isRetrying ? "Marking again…" : "Mark again"}</button>
        <span class="attempt-note muted">Attempts: ${Number(entry.attemptCount || 1)}</span>
      </div>
    </article>
  `;
}

function statusPill(status) {
  if (status === "error") return '<span class="status-pill error">Needs retry</span>';
  if (status === "blank") return '<span class="status-pill blank">Blank answer</span>';
  if (status === "local") return '<span class="status-pill ok">Marked locally</span>';
  return '<span class="status-pill ok">Marked</span>';
}

function renderTargets() {
  if (!state.targets || !Array.isArray(state.targets.targets) || state.targets.targets.length !== 4) {
    dom.targetsPanel.hidden = true;
    dom.targetsWindow.innerHTML = "";
    syncButtons();
    return;
  }

  dom.targetsPanel.hidden = false;
  dom.targetsWindow.innerHTML = state.targets.targets.map((target, index) => `
    <article class="target-card">
      <span class="target-code">Target ${index + 1} · ${escapeHtml(target.code)}</span>
      <h4>${escapeHtml(target.name)}</h4>
      <p><strong>Why:</strong> ${escapeHtml(target.reason)}</p>
      <p><strong>Action:</strong> ${escapeHtml(target.action)}</p>
    </article>
  `).join("");
  syncButtons();
}

async function copyFeedback() {
  if (!canCopy()) {
    showToast("Mark the paper and generate targets before copying.");
    return;
  }

  const text = buildCopyText();
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
    } else {
      fallbackCopy(text);
    }
    showToast("Marks, feedback and targets copied to the clipboard.");
  } catch {
    fallbackCopy(text);
    showToast("Feedback selected for copying. Press Ctrl+C if needed.");
  }
}

function buildCopyText() {
  const totals = calculateTotals();
  const lines = [
    "GCSE ENGLISH LANGUAGE PRACTICE FEEDBACK",
    `${state.currentPack.paper} — ${state.currentPack.paperTitle}`,
    `Scenario: ${state.currentPack.title}`,
    `Total score: ${totals.score}/${totals.max}`,
    ""
  ];

  state.results.forEach((entry) => {
    const q = entry.question;
    const r = entry.result;
    lines.push(`${q.displayQuestionNumber || q.questionNumber} — ${r.score}/${r.max_score} (${q.assessmentObjective})`);
    if (r.level) lines.push(`Level: ${r.level}${r.level_position && r.level_position !== "Not applicable" ? ` — ${r.level_position}` : ""}`);
    if (Number(q.markCategory) === 40) {
      lines.push(`AO5 content and organisation: ${r.subscores?.content_and_organisation || 0}/24`);
      lines.push(`AO6 technical accuracy: ${r.subscores?.technical_accuracy || 0}/16`);
    }
    lines.push("Strengths:");
    (r.strengths || []).forEach((item) => lines.push(`- ${item}`));
    lines.push("Improvements:");
    (r.weaknesses || []).forEach((item) => lines.push(`- ${item}`));
    lines.push(`Why this mark: ${r.why_this_mark}`);
    lines.push(`How to move up: ${r.next_level}`);
    if (r.model_fragment) lines.push(`Model fragment: ${r.model_fragment}`);
    lines.push(`Next-paper target: ${r.target_mark_min}–${r.target_mark_max}/${r.max_score}`);
    lines.push("");
  });

  lines.push("YOUR CENTURY NUGGET TARGETS");
  state.targets.targets.forEach((target, index) => {
    lines.push(`${index + 1}. ${target.name} [${target.code}]`);
    lines.push(`Why: ${target.reason}`);
    lines.push(`Action: ${target.action}`);
    lines.push("");
  });
  lines.push("Complete these four CENTURY Nuggets and apply the skills in your next practice paper.");
  return lines.join("\n");
}

function fallbackCopy(text) {
  const area = document.createElement("textarea");
  area.value = text;
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.appendChild(area);
  area.select();
  document.execCommand("copy");
  area.remove();
}

function syncButtons() {
  const busy = state.busy;
  dom.generatePaperBtn.disabled = Boolean(busy) || !state.bank;
  dom.clearAnswersBtn.disabled = Boolean(busy) || !state.currentPack;
  dom.markPaperBtn.disabled = Boolean(busy) || !state.currentPack;
  dom.generateTargetsBtn.disabled = Boolean(busy);
  dom.copyFeedbackBtn.disabled = !canCopy() || Boolean(busy);

  dom.markPaperBtn.textContent = busy?.type === "full" ? "Marking paper…" : "Mark this paper";
  dom.markPaperBtn.classList.toggle("loading-inline", busy?.type === "full");
  dom.generateTargetsBtn.textContent = busy?.type === "targets" ? "Generating targets…" : "Generate targets";
  dom.generateTargetsBtn.classList.toggle("loading-inline", busy?.type === "targets");
}

function canCopy() {
  return Boolean(
    state.currentPack &&
    state.results.length === state.currentPack.questions.length &&
    !hasFailedResults() &&
    state.targets &&
    Array.isArray(state.targets.targets) &&
    state.targets.targets.length === 4
  );
}

function markMultipleChoice(question, selected) {
  const correct = new Set((question.correctOptions || []).map((item) => String(item).toUpperCase()));
  const chosen = [...new Set(selected.map((item) => String(item).toUpperCase()))].slice(0, 4);
  const right = chosen.filter((item) => correct.has(item));
  const wrong = chosen.filter((item) => !correct.has(item));
  const score = Math.min(4, right.length);

  return {
    score,
    max_score: 4,
    level: "AO1 retrieval",
    level_position: "Not applicable",
    assessment_objective: "AO1",
    strengths: score ? [`${score} correct statement${score === 1 ? " was" : "s were"} selected from the source.`] : [],
    weaknesses: [
      chosen.length < 4 ? `Only ${chosen.length} statement${chosen.length === 1 ? " was" : "s were"} selected; four were required.` : "Check every chosen statement directly against the source.",
      wrong.length ? `The following selected option${wrong.length === 1 ? " was" : "s were"} not supported: ${wrong.join(", ")}.` : "Continue scanning for four distinct explicit details."
    ],
    why_this_mark: `One mark was awarded for each correct selection. Correct selections: ${right.join(", ") || "none"}.`,
    next_level: score === 4 ? "Maintain this accuracy by checking each option against an explicit detail." : "Re-read the opening carefully and select only statements directly stated in the source.",
    model_fragment: "For retrieval questions, match each option to a precise detail before ticking it.",
    target_mark_min: Math.min(4, score + 1),
    target_mark_max: 4,
    subscores: { content_and_organisation: 0, technical_accuracy: 0 }
  };
}

function buildBlankResult(question) {
  return {
    score: 0,
    max_score: Number(question.markCategory),
    level: "No response",
    level_position: "Not applicable",
    assessment_objective: question.assessmentObjective || "",
    strengths: [],
    weaknesses: ["No answer was provided.", "There is no evidence of the assessed skill to reward."],
    why_this_mark: "A blank response cannot receive credit.",
    next_level: "Write a complete response, then use Mark again on this question.",
    model_fragment: "Begin with one clear point that directly answers the task, then support it.",
    target_mark_min: Math.min(Number(question.markCategory), 1),
    target_mark_max: Math.min(Number(question.markCategory), Math.max(2, Math.ceil(Number(question.markCategory) * 0.25))),
    subscores: { content_and_organisation: 0, technical_accuracy: 0 }
  };
}

function buildFailedResult(question, error) {
  const waitSeconds = Number(error?.retryAfter || 0);
  const rateLimited = Number(error?.status) === 429 || /rate|quota|limit/i.test(String(error?.message || ""));
  const message = rateLimited
    ? `The marking service reached a temporary rate limit.${waitSeconds ? ` Wait about ${waitSeconds} seconds.` : " Wait briefly."}`
    : String(error?.message || "The marking service did not return a usable result.");

  return {
    score: 0,
    max_score: Number(question.markCategory),
    level: "Not marked",
    level_position: "Not applicable",
    assessment_objective: question.assessmentObjective || "",
    strengths: [],
    weaknesses: [message, "This is a technical failure, not a judgement on the student answer."],
    why_this_mark: message,
    next_level: "Wait briefly and click Mark again for this question only.",
    model_fragment: "",
    target_mark_min: 0,
    target_mark_max: Number(question.markCategory),
    subscores: { content_and_organisation: 0, technical_accuracy: 0 }
  };
}

function calculateTotals() {
  return state.results.reduce((total, entry) => {
    total.score += Number(entry.result?.score || 0);
    total.max += Number(entry.result?.max_score || entry.question.markCategory || 0);
    return total;
  }, { score: 0, max: 0 });
}

function countFailedResults() {
  return state.results.filter((entry) => entry.status === "error").length;
}

function hasFailedResults() {
  return countFailedResults() > 0;
}

function restoreValidResults(saved) {
  if (!Array.isArray(saved) || !state.currentPack) return [];
  return saved.filter((entry) => {
    const question = state.currentPack.questions.find((item) => item.id === entry?.question?.id);
    if (!question) return false;
    return entry.answerFingerprint === answerFingerprint(state.answers[question.id]);
  }).map((entry) => ({
    ...entry,
    question: compactQuestion(state.currentPack.questions.find((item) => item.id === entry.question.id))
  }));
}

function questionOrder(questionId) {
  return state.currentPack.questions.findIndex((question) => question.id === questionId);
}

async function requestJson(path, { method = "POST", body, auth = true } = {}) {
  if (!isBackendConfigured()) {
    const error = new Error("The Vercel backend URL has not been configured yet.");
    error.status = 0;
    throw error;
  }

  const headers = { "Content-Type": "application/json" };
  if (auth) headers.Authorization = `Bearer ${state.token}`;

  let response;
  try {
    response = await fetch(`${BACKEND_BASE_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body)
    });
  } catch {
    const error = new Error("Failed to reach the marking service. Check the Vercel URL and deployment.");
    error.status = 0;
    throw error;
  }

  let data = {};
  try {
    data = await response.json();
  } catch {
    data = {};
  }

  if (!response.ok) {
    const error = new Error(data?.error || `Request failed (${response.status}).`);
    error.status = response.status;
    error.retryAfter = data?.retry_after_seconds || Number(response.headers.get("retry-after") || 0) || null;
    throw error;
  }
  return data;
}

function isBackendConfigured() {
  return Boolean(BACKEND_BASE_URL && !BACKEND_BASE_URL.includes("REPLACE-WITH-YOUR-VERCEL-DOMAIN"));
}

function setNotice(message, kind = "info") {
  state.notice = { message, kind };
}

function showToast(message) {
  dom.toast.textContent = message;
  dom.toast.hidden = false;
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => {
    dom.toast.hidden = true;
  }, 3200);
}

function limitTextToWords(text, limit) {
  if (!limit) return text;
  const matches = [...String(text).matchAll(/\S+/g)];
  if (matches.length <= limit) return text;
  const finalMatch = matches[limit - 1];
  return text.slice(0, finalMatch.index + finalMatch[0].length);
}

function countWords(text) {
  return String(text || "").trim().split(/\s+/).filter(Boolean).length;
}

function answerFingerprint(value) {
  const text = Array.isArray(value) ? value.join("|") : String(value || "");
  let hash = 5381;
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash << 5) + hash) ^ text.charCodeAt(index);
  }
  return `${text.length}:${hash >>> 0}`;
}

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    showToast("This browser could not save more data. Copy your work before closing the page.");
  }
}

function structuredCloneSafe(value) {
  return typeof structuredClone === "function"
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}

function sampleOne(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function getOptionLetter(index) {
  return "ABCDEFGHIJKLMNOPQRSTUVWXYZ"[index] || String(index + 1);
}

function cssEscape(value) {
  return window.CSS?.escape ? window.CSS.escape(String(value)) : String(value).replace(/(["'\\.#:[\](),>+~*= ])/g, "\\$1");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
