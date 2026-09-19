const SHEET_NAME = "개인업무목록";
const HEADERS = ["업무ID", "작성자이메일", "구분", "업무명", "마감일", "우선순위", "메모", "완료여부"];
const ALLOWED_CATEGORIES = ["공문/보고", "품의/정산", "학급/학생", "행사/수업", "연수/기타"];
const ALLOWED_PRIORITIES = ["긴급", "보통", "여유"];
const FALLBACK_USER = "교직원 계정";

/** Apps Script 웹 앱 진입점 */
function doGet() {
  return HtmlService.createHtmlOutputFromFile("index")
    .setTitle("선생님 업무 D-Day 플래너")
    .addMetaTag("viewport", "width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function getCurrentUserEmail() {
  return Session.getActiveUser().getEmail() || FALLBACK_USER;
}

function getSheet() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  if (!spreadsheet) throw new Error("스프레드시트에 Apps Script 프로젝트를 연결해 주세요.");

  let sheet = spreadsheet.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(SHEET_NAME);
    sheet.appendRow(HEADERS);
    sheet.getRange(1, 1, 1, HEADERS.length)
      .setFontWeight("bold")
      .setBackground("#e0e7ff");
    sheet.setFrozenRows(1);
    sheet.getRange("E:E").setNumberFormat("yyyy-mm-dd");
  }
  return sheet;
}

function getMyTasks() {
  const email = getCurrentUserEmail();
  const sheet = getSheet();
  const data = sheet.getDataRange().getValues();
  const tasks = [];

  for (let index = 1; index < data.length; index += 1) {
    const row = data[index];
    if (!row[0] || !canAccessRow_(row, email)) continue;
    tasks.push(rowToLegacyTask_(row));
  }

  return tasks.sort(function (a, b) {
    if (a.isCompleted !== b.isCompleted) return a.isCompleted ? 1 : -1;
    return a.dueDate.localeCompare(b.dueDate);
  });
}

/** 현재 프론트엔드 모델과의 호환용 조회 함수 */
function getTasks() {
  return getMyTasks().map(function (task) {
    return {
      id: task.id,
      category: task.category,
      title: task.taskName,
      dueDate: task.dueDate,
      priority: task.priority,
      memo: task.memo,
      completed: task.isCompleted,
      owner: task.owner
    };
  });
}

function toggleTaskStatus(taskId, isCompleted) {
  if (!taskId) throw new Error("업무 ID가 필요합니다.");
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const sheet = getSheet();
    const rowNumber = findAccessibleRow_(sheet, String(taskId), getCurrentUserEmail());
    if (!rowNumber) throw new Error("변경할 업무를 찾을 수 없습니다.");
    sheet.getRange(rowNumber, 8).setValue(Boolean(isCompleted));
    SpreadsheetApp.flush();
    return rowToCurrentTask_(sheet.getRange(rowNumber, 1, 1, HEADERS.length).getValues()[0]);
  } finally {
    lock.releaseLock();
  }
}

function addNewPersonalTask(input) {
  const task = validateTask_(input);
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const sheet = getSheet();
    const id = String(input.id || Utilities.getUuid());
    const email = getCurrentUserEmail();
    sheet.appendRow([
      id,
      email,
      task.category,
      task.taskName,
      task.dueDate,
      task.priority,
      task.memo,
      false
    ]);
    const lastRow = sheet.getLastRow();
    sheet.getRange(lastRow, 8).insertCheckboxes().setValue(false);
    return rowToLegacyTask_(sheet.getRange(lastRow, 1, 1, HEADERS.length).getValues()[0]);
  } finally {
    lock.releaseLock();
  }
}

/** 현재 프론트엔드 모델과의 호환용 등록 함수 */
function createTask(input) {
  const created = addNewPersonalTask({
    id: input && input.id,
    category: input && input.category,
    taskName: input && (input.title || input.taskName),
    dueDate: input && input.dueDate,
    priority: input && input.priority,
    memo: input && input.memo
  });
  return {
    id: created.id,
    category: created.category,
    title: created.taskName,
    dueDate: created.dueDate,
    priority: created.priority,
    memo: created.memo,
    completed: created.isCompleted,
    owner: created.owner
  };
}

function deleteTask(taskId) {
  if (!taskId) throw new Error("삭제할 업무 ID가 필요합니다.");
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const sheet = getSheet();
    const rowNumber = findAccessibleRow_(sheet, String(taskId), getCurrentUserEmail());
    if (!rowNumber) throw new Error("삭제할 업무를 찾을 수 없습니다.");
    sheet.deleteRow(rowNumber);
    return { id: String(taskId) };
  } finally {
    lock.releaseLock();
  }
}

function validateTask_(input) {
  const taskName = String(input && (input.taskName || input.title) || "").trim();
  const dueDate = String(input && input.dueDate || "");
  const category = String(input && input.category || "");
  const priority = String(input && input.priority || "");

  if (!taskName) throw new Error("업무명을 입력해 주세요.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate) || !isValidDateString_(dueDate)) {
    throw new Error("올바른 마감일자를 입력해 주세요.");
  }
  if (ALLOWED_CATEGORIES.indexOf(category) === -1) throw new Error("올바른 업무 구분을 선택해 주세요.");
  if (ALLOWED_PRIORITIES.indexOf(priority) === -1) throw new Error("올바른 우선순위를 선택해 주세요.");

  return {
    category: category,
    taskName: taskName.slice(0, 100),
    dueDate: dueDate,
    priority: priority,
    memo: String(input.memo || "").trim().slice(0, 500)
  };
}

function findAccessibleRow_(sheet, taskId, email) {
  if (sheet.getLastRow() < 2) return 0;
  const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, HEADERS.length).getValues();
  for (let index = 0; index < data.length; index += 1) {
    if (String(data[index][0]) === taskId && canAccessRow_(data[index], email)) return index + 2;
  }
  return 0;
}

function canAccessRow_(row, email) {
  return email === FALLBACK_USER || String(row[1]) === email;
}

function rowToLegacyTask_(row) {
  return {
    id: String(row[0]),
    category: String(row[2] || ""),
    taskName: String(row[3] || ""),
    dueDate: formatDueDate_(row[4]),
    priority: String(row[5] || "보통"),
    memo: String(row[6] || ""),
    isCompleted: row[7] === true || String(row[7]).toLowerCase() === "true",
    owner: String(row[1] || FALLBACK_USER)
  };
}

function rowToCurrentTask_(row) {
  const task = rowToLegacyTask_(row);
  return {
    id: task.id,
    category: task.category,
    title: task.taskName,
    dueDate: task.dueDate,
    priority: task.priority,
    memo: task.memo,
    completed: task.isCompleted,
    owner: task.owner
  };
}

function formatDueDate_(value) {
  if (Object.prototype.toString.call(value) === "[object Date]" && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, "Asia/Seoul", "yyyy-MM-dd");
  }
  const text = String(value || "");
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const date = new Date(value);
  if (isNaN(date.getTime())) return "";
  return Utilities.formatDate(date, "Asia/Seoul", "yyyy-MM-dd");
}

function isValidDateString_(value) {
  const parts = value.split("-").map(Number);
  const date = new Date(parts[0], parts[1] - 1, parts[2]);
  return date.getFullYear() === parts[0]
    && date.getMonth() === parts[1] - 1
    && date.getDate() === parts[2];
}
