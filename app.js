const STORAGE_KEY = "SCHOOL_DDAY_TASKS";
const LEGACY_STORAGE_KEY = "school-dday-dashboard.tasks.v1";
const CATEGORIES = ["공문/보고", "품의/정산", "학급/학생", "행사/수업", "연수/기타"];
const PRIORITIES = ["긴급", "보통", "여유"];
let memoryTasks = null;

const state = { tasks: [], filter: "all", query: "", loading: true, saving: false };

const elements = {
  userStatusText: document.querySelector("#user-status-text"),
  taskList: document.querySelector("#task-list"),
  loading: document.querySelector("#loading-state"),
  empty: document.querySelector("#empty-state"),
  resultCount: document.querySelector("#result-count"),
  search: document.querySelector("#task-search"),
  filterAllCount: document.querySelector("#filter-all-count"),
  filters: document.querySelector("#filters"),
  modal: document.querySelector("#task-modal"),
  openModal: document.querySelector("#open-modal"),
  closeModal: document.querySelector("#close-modal"),
  cancelModal: document.querySelector("#cancel-modal"),
  form: document.querySelector("#task-form"),
  titleInput: document.querySelector("#task-title"),
  dueDateInput: document.querySelector("#task-due-date"),
  submitTask: document.querySelector("#submit-task"),
  formError: document.querySelector("#form-error"),
  toast: document.querySelector("#toast"),
  statUrgent: document.querySelector("#stat-urgent"),
  statSoon: document.querySelector("#stat-soon"),
  statProgress: document.querySelector("#stat-progress"),
  statRate: document.querySelector("#stat-rate"),
  statCompleted: document.querySelector("#stat-completed"),
  statProgressBar: document.querySelector("#stat-progress-bar")
};

function isGasEnvironment() {
  return typeof google !== "undefined" && google.script && google.script.run;
}

function startOfToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function formatLocalDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dateFromOffset(offset) {
  const date = startOfToday();
  date.setDate(date.getDate() + offset);
  return formatLocalDate(date);
}

function createMockTasks() {
  return [
    { id: "T-01", category: "공문/보고", title: "2학기 특수교육 대상학생 맞춤형 지원 실태조사 공문", dueDate: dateFromOffset(0), priority: "긴급", memo: "K-에듀파인 정보공시 제출", completed: false, owner: "김철수 선생님", createdAt: new Date().toISOString() },
    { id: "T-02", category: "품의/정산", title: "하반기 과학실 실험용 화학 약품 및 안전용구 품의", dueDate: dateFromOffset(1), priority: "보통", memo: "MSDS 자료 점검", completed: false, owner: "박민호 선생님", createdAt: new Date().toISOString() },
    { id: "T-03", category: "학급/학생", title: "1차 학교생활기록부 교과학습발달상황 세특 입력", dueDate: dateFromOffset(3), priority: "긴급", memo: "나이스(NEIS) 글자수 마감 확인", completed: false, owner: "이영희 선생님", createdAt: new Date().toISOString() },
    { id: "T-04", category: "행사/수업", title: "가을 현장체험학습 안전관리 계획 및 사전답사 보고서", dueDate: dateFromOffset(7), priority: "보통", memo: "학운위 심의 통과분", completed: false, owner: "이영희 선생님", createdAt: new Date().toISOString() },
    { id: "T-05", category: "행사/수업", title: "운동회 기본 운영계획서 내부 기안", dueDate: dateFromOffset(-5), priority: "보통", memo: "", completed: true, owner: "김철수 선생님", createdAt: new Date().toISOString() },
    { id: "T-06", category: "연수/기타", title: "초청 강사 명단 확정 및 위촉 공문 발송", dueDate: dateFromOffset(-2), priority: "여유", memo: "", completed: true, owner: "정다은 선생님", createdAt: new Date().toISOString() }
  ];
}

function parseLocalDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value));
  if (!match) return new Date(NaN);
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function getDaysUntil(dueDate) {
  return Math.round((parseLocalDate(dueDate) - startOfToday()) / 86400000);
}

function getDday(task) {
  const days = getDaysUntil(task.dueDate);
  if (days < 0) return { label: `D+${Math.abs(days)}`, tone: "overdue", days };
  if (days === 0) return { label: "오늘 마감", tone: "today", days };
  if (days <= 3) return { label: `D-${days}`, tone: "soon", days };
  return { label: `D-${days}`, tone: "normal", days };
}

function normalizeTask(task) {
  return {
    id: String(task.id || ""),
    title: String(task.title || task.taskName || ""),
    dueDate: String(task.dueDate || ""),
    category: CATEGORIES.includes(task.category) ? task.category : CATEGORIES[0],
    priority: PRIORITIES.includes(task.priority) ? task.priority : "보통",
    memo: String(task.memo || ""),
    completed: task.completed === true || task.isCompleted === true || String(task.completed).toLowerCase() === "true" || String(task.isCompleted).toLowerCase() === "true",
    owner: String(task.owner || task.authorEmail || task.email || "담당 교직원"),
    createdAt: String(task.createdAt || "")
  };
}

function loadLocalTasks() {
  if (Array.isArray(memoryTasks)) return memoryTasks.map(normalizeTask);
  try {
    const current = localStorage.getItem(STORAGE_KEY);
    const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
    const stored = JSON.parse(current || legacy || "null");
    if (Array.isArray(stored)) {
      const normalized = stored.map(normalizeTask);
      if (!current && legacy) saveLocalTasks(normalized);
      return normalized;
    }
  } catch (error) {
    console.warn("저장된 로컬 데이터를 읽지 못했습니다.", error);
  }
  const initialTasks = createMockTasks();
  saveLocalTasks(initialTasks);
  return initialTasks;
}

function saveLocalTasks(tasks) {
  memoryTasks = tasks.map(normalizeTask);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(memoryTasks));
  } catch (error) {
    console.warn("LocalStorage를 사용할 수 없어 현재 세션에만 저장합니다.", error);
  }
}

function gasCall(method, ...args) {
  return new Promise((resolve, reject) => {
    const runner = google.script.run
      .withSuccessHandler(resolve)
      .withFailureHandler((error) => reject(new Error(error && error.message ? error.message : String(error))));
    runner[method](...args);
  });
}

const taskService = {
  async getTasks() {
    return isGasEnvironment() ? gasCall("getTasks") : loadLocalTasks();
  },
  async createTask(task) {
    if (isGasEnvironment()) return gasCall("createTask", task);
    const created = normalizeTask({ ...task, id: `local-${Date.now()}-${Math.random().toString(16).slice(2)}`, completed: false, createdAt: new Date().toISOString() });
    saveLocalTasks([...loadLocalTasks(), created]);
    return created;
  },
  async toggleTaskStatus(id, completed) {
    if (isGasEnvironment()) return gasCall("toggleTaskStatus", id, completed);
    const tasks = loadLocalTasks();
    const target = tasks.find((task) => task.id === id);
    if (!target) throw new Error("업무를 찾을 수 없습니다.");
    target.completed = Boolean(completed);
    saveLocalTasks(tasks);
    return target;
  },
  async deleteTask(id) {
    if (isGasEnvironment()) return gasCall("deleteTask", id);
    const tasks = loadLocalTasks();
    if (!tasks.some((task) => task.id === id)) throw new Error("삭제할 업무를 찾을 수 없습니다.");
    saveLocalTasks(tasks.filter((task) => task.id !== id));
    return { id };
  },
  async getCurrentUserEmail() {
    return isGasEnvironment() ? gasCall("getCurrentUserEmail") : "로컬 개발 모드 (LocalStorage)";
  }
};

function escapeHtml(value = "") {
  return String(value).replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#039;", '"': "&quot;"
  })[character]);
}

function formatDisplayDate(value) {
  const date = parseLocalDate(value);
  if (Number.isNaN(date.getTime())) return "날짜 미정";
  return new Intl.DateTimeFormat("ko-KR", { month: "long", day: "numeric", weekday: "short" }).format(date);
}

function filteredTasks() {
  return state.tasks
    .filter((task) => {
      const days = getDaysUntil(task.dueDate);
      const keyword = state.query.trim().toLocaleLowerCase("ko");
      const matchesQuery = !keyword || `${task.title} ${task.memo} ${task.category} ${task.owner}`.toLocaleLowerCase("ko").includes(keyword);
      if (!matchesQuery) return false;
      if (state.filter === "pending") return !task.completed;
      if (state.filter === "urgent") return !task.completed && days <= 0;
      if (state.filter === "soon") return !task.completed && days >= 1 && days <= 3;
      if (state.filter === "done") return task.completed;
      if (CATEGORIES.includes(state.filter)) return task.category === state.filter;
      return true;
    })
    .sort((a, b) => {
      if (a.completed !== b.completed) return Number(a.completed) - Number(b.completed);
      return parseLocalDate(a.dueDate) - parseLocalDate(b.dueDate);
    });
}

function ddayClasses(tone) {
  return {
    overdue: "bg-red-100 text-red-700 ring-red-200",
    today: "deadline-pulse bg-red-600 text-white ring-red-300",
    soon: "bg-orange-100 text-orange-700 ring-orange-200",
    normal: "bg-slate-100 text-slate-600 ring-slate-200"
  }[tone];
}

function priorityClasses(priority) {
  return {
    긴급: "bg-red-50 text-red-700",
    보통: "bg-blue-50 text-blue-700",
    여유: "bg-emerald-50 text-emerald-700"
  }[priority] || "bg-slate-100 text-slate-600";
}

function categoryClasses(category) {
  return {
    "공문/보고": "border-blue-200 bg-blue-50 text-blue-700",
    "품의/정산": "border-emerald-200 bg-emerald-50 text-emerald-700",
    "학급/학생": "border-purple-200 bg-purple-50 text-purple-700",
    "행사/수업": "border-amber-200 bg-amber-50 text-amber-700",
    "연수/기타": "border-slate-200 bg-slate-50 text-slate-700"
  }[category] || "border-slate-200 bg-slate-50 text-slate-700";
}

function cardBorderClasses(task, tone) {
  if (task.completed) return "border-slate-200";
  if (tone === "overdue" || tone === "today") return "border-rose-300";
  if (tone === "soon") return "border-amber-300";
  return "border-slate-200";
}

function taskTemplate(task) {
  const dday = getDday(task);
  const badgeText = task.completed ? "완료" : dday.label;
  const badgeStyle = task.completed ? "bg-slate-100 text-slate-500 ring-slate-200" : ddayClasses(dday.tone);
  return `
    <article class="task-row rounded-2xl border bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${cardBorderClasses(task, dday.tone)} ${task.completed ? "task-complete" : ""}" data-task-id="${escapeHtml(task.id)}">
      <div class="flex items-center justify-between gap-3">
        <span class="rounded-lg border px-2.5 py-1 text-[11px] font-bold ${categoryClasses(task.category)}">📌 ${escapeHtml(task.category)}</span>
        <span class="shrink-0 rounded-full px-3 py-1 text-[11px] font-black ring-1 ring-inset ${badgeStyle}">${escapeHtml(badgeText)}</span>
      </div>
      <div class="mt-4 flex items-start gap-3">
        <label class="relative mt-0.5 grid shrink-0 cursor-pointer place-items-center" aria-label="${escapeHtml(task.title)} 완료 상태">
          <input type="checkbox" class="task-checkbox peer h-6 w-6 cursor-pointer appearance-none rounded-lg border border-slate-300 bg-white transition checked:border-blue-500 checked:bg-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-100" ${task.completed ? "checked" : ""} />
          <svg class="pointer-events-none absolute hidden h-4 w-4 text-white peer-checked:block" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="m4 10 4 4 8-8" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </label>
        <div class="min-w-0 flex-1">
          <div class="flex flex-wrap items-center gap-2"><h3 class="task-title break-words text-[15px] font-extrabold leading-snug text-slate-900">${escapeHtml(task.title)}</h3>${task.priority === "긴급" && !task.completed ? `<span class="rounded bg-rose-50 px-1.5 py-0.5 text-[10px] font-bold text-rose-600">긴급</span>` : ""}</div>
          ${task.memo ? `<p class="mt-2 text-xs leading-5 text-slate-500">${escapeHtml(task.memo)}</p>` : ""}
        </div>
      </div>
      <div class="mt-4 flex items-center justify-between gap-3 border-t border-slate-100 pt-3 text-xs font-medium text-slate-500">
        <span><i class="fa-regular fa-calendar mr-1.5 text-slate-400" aria-hidden="true"></i>마감: <strong class="font-semibold text-slate-600">${escapeHtml(task.dueDate)}</strong></span>
        <span class="flex min-w-0 items-center gap-2"><span class="truncate"><i class="fa-regular fa-user mr-1.5 text-slate-400" aria-hidden="true"></i>${escapeHtml(task.owner)}</span><button type="button" class="delete-task rounded-lg p-1.5 text-slate-300 transition hover:bg-rose-50 hover:text-rose-500" aria-label="${escapeHtml(task.title)} 삭제"><i class="fa-regular fa-trash-can" aria-hidden="true"></i></button></span>
      </div>
    </article>`;
}

function renderStats() {
  const incomplete = state.tasks.filter((task) => !task.completed);
  const completedCount = state.tasks.length - incomplete.length;
  const completionRate = state.tasks.length ? Math.round((completedCount / state.tasks.length) * 100) : 0;
  elements.statUrgent.textContent = incomplete.filter((task) => getDaysUntil(task.dueDate) <= 0).length;
  elements.statSoon.textContent = incomplete.filter((task) => {
    const days = getDaysUntil(task.dueDate);
    return days >= 1 && days <= 3;
  }).length;
  elements.statProgress.textContent = incomplete.length;
  elements.statRate.textContent = `${completionRate}%`;
  elements.statCompleted.textContent = `${completedCount}/${state.tasks.length} 완료`;
  elements.statProgressBar.style.width = `${completionRate}%`;
  elements.filterAllCount.textContent = `(${state.tasks.length})`;
}

function renderFilters() {
  document.querySelectorAll(".filter-button").forEach((button) => {
    const active = button.dataset.filter === state.filter;
    button.className = `filter-button whitespace-nowrap rounded-xl px-3.5 py-1.5 transition ${active ? "bg-slate-900 text-white" : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-100"}`;
    button.setAttribute("aria-pressed", String(active));
  });
}

function render() {
  renderStats();
  renderFilters();
  elements.loading.hidden = !state.loading;
  if (state.loading) {
    elements.taskList.innerHTML = "";
    elements.empty.hidden = true;
    return;
  }

  const tasks = filteredTasks();
  elements.resultCount.textContent = `검색 결과 ${tasks.length}건`;
  elements.taskList.innerHTML = tasks.map(taskTemplate).join("");
  elements.empty.hidden = tasks.length !== 0;
}

let toastTimer;
function showToast(message, isError = false) {
  clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.className = `fixed bottom-5 left-1/2 z-[60] -translate-x-1/2 rounded-xl px-4 py-3 text-sm font-bold text-white shadow-xl ${isError ? "bg-red-700" : "bg-slate-900"}`;
  elements.toast.hidden = false;
  toastTimer = setTimeout(() => { elements.toast.hidden = true; }, 2600);
}

function openModal() {
  elements.form.reset();
  elements.formError.hidden = true;
  elements.dueDateInput.value = formatLocalDate(startOfToday());
  elements.modal.hidden = false;
  document.body.classList.add("modal-open");
  requestAnimationFrame(() => elements.titleInput.focus());
}

function closeModal() {
  elements.modal.hidden = true;
  document.body.classList.remove("modal-open");
  elements.openModal.focus();
}

async function handleToggle(checkbox) {
  const row = checkbox.closest("[data-task-id]");
  const task = state.tasks.find((item) => item.id === row.dataset.taskId);
  if (!task) return;

  const previous = task.completed;
  task.completed = checkbox.checked;
  render();
  try {
    const saved = await taskService.toggleTaskStatus(task.id, task.completed);
    task.completed = normalizeTask(saved).completed;
    render();
  } catch (error) {
    task.completed = previous;
    render();
    showToast(`상태 변경 실패: ${error.message}`, true);
  }
}

async function handleDelete(button) {
  const row = button.closest("[data-task-id]");
  const task = state.tasks.find((item) => item.id === row.dataset.taskId);
  if (!task || !window.confirm("이 업무를 삭제하시겠습니까?")) return;

  const previousTasks = [...state.tasks];
  state.tasks = state.tasks.filter((item) => item.id !== task.id);
  render();
  try {
    await taskService.deleteTask(task.id);
    showToast("업무를 삭제했습니다.");
  } catch (error) {
    state.tasks = previousTasks;
    render();
    showToast(`삭제 실패: ${error.message}`, true);
  }
}

async function handleSubmit(event) {
  event.preventDefault();
  if (state.saving || !elements.form.reportValidity()) return;
  state.saving = true;
  elements.submitTask.disabled = true;
  elements.submitTask.textContent = "등록 중...";
  elements.formError.hidden = true;

  const task = Object.fromEntries(new FormData(elements.form).entries());
  try {
    const created = normalizeTask(await taskService.createTask(task));
    state.tasks.push(created);
    closeModal();
    render();
    showToast("새 업무를 등록했습니다.");
  } catch (error) {
    elements.formError.textContent = error.message || "업무 등록 중 오류가 발생했습니다.";
    elements.formError.hidden = false;
  } finally {
    state.saving = false;
    elements.submitTask.disabled = false;
    elements.submitTask.textContent = "등록 완료";
  }
}

function bindEvents() {
  elements.filters.addEventListener("click", (event) => {
    const button = event.target.closest("[data-filter]");
    if (!button) return;
    state.filter = button.dataset.filter;
    render();
  });
  elements.search.addEventListener("input", (event) => {
    state.query = event.target.value;
    render();
  });
  document.querySelectorAll("[data-summary-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      state.filter = button.dataset.summaryFilter;
      render();
    });
  });
  elements.taskList.addEventListener("change", (event) => {
    if (event.target.matches(".task-checkbox")) handleToggle(event.target);
  });
  elements.taskList.addEventListener("click", (event) => {
    const button = event.target.closest(".delete-task");
    if (button) handleDelete(button);
  });
  elements.openModal.addEventListener("click", openModal);
  elements.closeModal.addEventListener("click", closeModal);
  elements.cancelModal.addEventListener("click", closeModal);
  elements.modal.addEventListener("click", (event) => {
    if (event.target === elements.modal) closeModal();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !elements.modal.hidden) closeModal();
  });
  elements.form.addEventListener("submit", handleSubmit);
}

async function init() {
  elements.userStatusText.textContent = isGasEnvironment() ? "Google Workspace 연결 중..." : "로컬 개발 모드 (LocalStorage)";
  elements.dueDateInput.min = formatLocalDate(startOfToday());
  bindEvents();
  render();
  try {
    const [tasks, userLabel] = await Promise.all([taskService.getTasks(), taskService.getCurrentUserEmail()]);
    state.tasks = Array.isArray(tasks) ? tasks.map(normalizeTask) : [];
    elements.userStatusText.textContent = userLabel || (isGasEnvironment() ? "Google Workspace 연결됨" : "로컬 개발 모드 (LocalStorage)");
  } catch (error) {
    state.tasks = isGasEnvironment() ? [] : loadLocalTasks();
    elements.userStatusText.textContent = "데이터 연결을 확인해 주세요";
    showToast(`업무를 불러오지 못했습니다: ${error.message}`, true);
  } finally {
    state.loading = false;
    render();
  }

  let renderedDate = formatLocalDate(startOfToday());
  window.setInterval(() => {
    const currentDate = formatLocalDate(startOfToday());
    if (currentDate !== renderedDate) {
      renderedDate = currentDate;
      render();
    }
  }, 60000);
}

init();
