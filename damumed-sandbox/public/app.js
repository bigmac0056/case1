const state = {
  profile: null,
  profiles: [],
  patient: null,
  record: {
    complaints: "",
    anamnesis: "",
    objectiveStatus: "",
    diagnosis: "",
    recommendations: "",
    diary: ""
  },
  activeField: "complaints",
  schedule: null,
  assignments: []
};

const fieldLabels = {
  complaints: "Жалобы при поступлении",
  anamnesis: "Анамнез заболевания",
  objectiveStatus: "Объективные данные",
  diagnosis: "Диагноз",
  recommendations: "Назначения",
  diary: "Дневник"
};

const navButtons = Array.from(document.querySelectorAll(".nav-btn"));
const screens = Array.from(document.querySelectorAll(".screen"));

const toastEl = document.getElementById("toast");
const currentPatientEl = document.getElementById("currentPatient");

const fieldTabs = Array.from(document.querySelectorAll(".field-tab"));
const fieldLabelEl = document.getElementById("fieldLabel");
const fieldInputEl = document.getElementById("fieldInput");
const profileSelectEl = document.getElementById("profileSelect");
const profileBadgeEl = document.getElementById("profileBadge");
const scheduleTitleEl = document.getElementById("scheduleTitle");

const fieldSelectorByKey = {
  complaints: "[data-testid='complaints-tab']",
  anamnesis: "[data-testid='anamnesis-tab']",
  objectiveStatus: "[data-testid='objective-tab']",
  diagnosis: "[data-testid='diagnosis-tab']",
  recommendations: "[data-testid='treatment-tab']",
  diary: "[data-testid='diary-tab']"
};

const inputTestIdByKey = {
  complaints: "complaints-field",
  anamnesis: "anamnesis-field",
  objectiveStatus: "objective-field",
  diagnosis: "diagnosis-field",
  recommendations: "treatment-field",
  diary: "diary-field"
};

function showToast(message) {
  toastEl.textContent = message;
  toastEl.classList.add("show");
  window.clearTimeout(showToast.timeoutId);
  showToast.timeoutId = window.setTimeout(() => {
    toastEl.classList.remove("show");
  }, 2600);
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || "Server error");
  }
  return payload;
}

function setScreen(name) {
  navButtons.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.screen === name);
  });
  screens.forEach((screen) => {
    const isActive = screen.id === `screen-${name}`;
    screen.classList.toggle("active", isActive);
  });

  if (name === "diary") {
    renderAssignments();
  }
  if (name === "schedule") {
    renderSchedule();
  }
  if (name === "audit") {
    refreshAudit();
  }
}

function renderProfileUi() {
  if (!state.profile) return;

  const roleEl = document.querySelector(".user-role");
  if (roleEl) {
    roleEl.textContent = state.profile.userRole;
  }

  if (profileBadgeEl) {
    profileBadgeEl.textContent = `${state.profile.label} | ${state.profile.defaultWorkingDays} рабочих дней`;
  }

  if (scheduleTitleEl) {
    scheduleTitleEl.textContent = `Расписание на ${state.profile.defaultWorkingDays} рабочих дней`;
  }

  const workingDaysEl = document.getElementById("workingDaysTarget");
  if (workingDaysEl && !workingDaysEl.dataset.userEdited) {
    workingDaysEl.value = String(state.profile.defaultWorkingDays);
  }

  const psyEl = document.getElementById("psyCount");
  if (psyEl && !psyEl.dataset.userEdited) {
    psyEl.value = state.profile.roleProfile === "psychologist"
      ? String(state.profile.defaultWorkingDays)
      : "3";
  }

  const childStatusEl = document.getElementById("childStatus");
  if (childStatusEl && !childStatusEl.dataset.userEdited) {
    childStatusEl.value = state.profile.roleProfile === "psychologist" ? "deviations" : childStatusEl.value;
  }
}

function renderProfileSelect() {
  if (!profileSelectEl) return;
  const currentKey = state.profile?.key || "";
  profileSelectEl.innerHTML = state.profiles
    .map((p) => `<option value="${p.key}" ${p.key === currentKey ? "selected" : ""}>${p.label}</option>`)
    .join("");
}

async function loadProfiles() {
  const data = await api("/api/profiles");
  state.profiles = Array.isArray(data.profiles) ? data.profiles : [];
  state.profile = state.profiles.find((p) => p.key === data.activeProfileKey) || state.profiles[0] || null;
  renderProfileSelect();
  renderProfileUi();
}

async function applyProfile() {
  if (!profileSelectEl) return;
  const profileKey = profileSelectEl.value;
  if (!profileKey) return;

  const data = await api("/api/profiles/active", {
    method: "POST",
    body: JSON.stringify({ profileKey })
  });

  state.profile = data.profile;
  renderProfileSelect();
  renderProfileUi();
  showToast(`Профиль переключен: ${data.profile.label}`);
}

function renderPatientInfo() {
  if (!state.patient) {
    currentPatientEl.innerHTML = "<em>Пациент не выбран</em>";
    return;
  }

  currentPatientEl.innerHTML = `
    <div><strong>${state.patient.fullName}</strong> (${state.patient.id})</div>
    <div class="inline-note">Дата рождения: ${state.patient.birthDate} | Диагноз: ${state.patient.diagnosis}</div>
  `;
}

function syncFieldEditor() {
  const field = state.activeField;
  fieldLabelEl.textContent = fieldLabels[field];
  fieldInputEl.value = state.record[field] || "";
  fieldInputEl.setAttribute("data-testid", inputTestIdByKey[field] || "record-field-input");

  fieldTabs.forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.field === field);
  });
}

fieldTabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    state.record[state.activeField] = fieldInputEl.value;
    state.activeField = tab.dataset.field;
    syncFieldEditor();
  });
});

fieldInputEl.addEventListener("input", () => {
  state.record[state.activeField] = fieldInputEl.value;
});

navButtons.forEach((btn) => {
  btn.addEventListener("click", () => setScreen(btn.dataset.screen));
});

async function openPatient(query) {
  try {
    const data = await api("/api/reception/open", {
      method: "POST",
      body: JSON.stringify({ query })
    });
    state.patient = data.patient;
    if (data.record) {
      state.record = {
        complaints: data.record.complaints || "",
        anamnesis: data.record.anamnesis || "",
        objectiveStatus: data.record.objectiveStatus || "",
        diagnosis: data.record.diagnosis || "",
        recommendations: data.record.recommendations || "",
        diary: data.record.diary || ""
      };
    }
    renderPatientInfo();
    syncFieldEditor();
    // Highlight the selected patient card
    document.querySelectorAll(".patient-card").forEach((card) => {
      card.classList.toggle("selected", card.dataset.id === data.patient.id);
    });
    showToast(`Приём открыт: ${data.patient.fullName}`);
  } catch (error) {
    showToast(error.message);
  }
}

async function renderPatientList() {
  const listEl = document.getElementById("patientList");
  if (!listEl) return;
  try {
    const data = await api("/api/patients");
    const ORDINALS = ["первого", "второго", "третьего"];
    listEl.innerHTML = data.data
      .map(
        (p, i) => `
        <button class="patient-card${state.patient?.id === p.id ? " selected" : ""}" data-id="${p.id}">
          <div class="patient-card-num">${i + 1}</div>
          <div class="patient-card-body">
            <div class="patient-card-name">${p.fullName}</div>
            <div class="patient-card-meta">${p.birthDate} &nbsp;|&nbsp; ${p.diagnosis}${p.diagnosisText ? " — " + p.diagnosisText : ""}</div>
            <div class="patient-card-hint">🎙 «открой ${ORDINALS[i] || (i+1)+"го"} пациента»</div>
          </div>
        </button>
      `
      )
      .join("");
    listEl.querySelectorAll(".patient-card").forEach((card) => {
      card.addEventListener("click", () => openPatient(card.dataset.id));
    });
  } catch (error) {
    listEl.innerHTML = `<span class="inline-note">Ошибка загрузки списка: ${error.message}</span>`;
  }
}

document.getElementById("openReceptionBtn").addEventListener("click", async () => {
  const query = document.getElementById("patientQuery").value.trim();
  if (!query) {
    showToast("Введите ФИО или ID пациента");
    return;
  }
  await openPatient(query);
});

document.getElementById("saveRecordBtn").addEventListener("click", async () => {
  if (!state.patient) {
    showToast("Сначала откройте пациента");
    return;
  }

  state.record[state.activeField] = fieldInputEl.value;

  try {
    const data = await api("/api/reception/record", {
      method: "POST",
      body: JSON.stringify(state.record)
    });
    state.record = {
      complaints: data.record.complaints,
      anamnesis: data.record.anamnesis,
      objectiveStatus: data.record.objectiveStatus,
      diagnosis: data.record.diagnosis,
      recommendations: data.record.recommendations,
      diary: data.record.diary
    };
    syncFieldEditor();
    showToast("Осмотр сохранен. Можно формировать расписание.");
  } catch (error) {
    showToast(error.message);
  }
});

document.getElementById("generateScheduleBtn").addEventListener("click", async () => {
  if (!state.patient) {
    showToast("Сначала откройте пациента");
    return;
  }

  const lfkCount = Number(document.getElementById("lfkCount").value) || 0;
  const massageCount = Number(document.getElementById("massageCount").value) || 0;
  const psyCount = Number(document.getElementById("psyCount").value) || 0;
  const startDate = document.getElementById("startDate").value || undefined;
  const workingDaysTarget = Number(document.getElementById("workingDaysTarget").value) || undefined;
  const childStatus = document.getElementById("childStatus").value || "deviations";
  const consultationTime = document.getElementById("consultationTime").value || undefined;
  const consultationEndTime = document.getElementById("consultationEndTime").value || undefined;
  const hospitalizationTime = document.getElementById("hospitalizationTime").value || undefined;

  const plan = [
    { type: "lfk", duration: 30, count: lfkCount },
    { type: "massage", duration: 30, count: massageCount },
    { type: "psychologist", duration: 40, count: psyCount }
  ].filter((p) => p.count > 0);

  try {
    const data = await api("/api/schedule/generate", {
      method: "POST",
      body: JSON.stringify({
        plan,
        startDate,
        workingDaysTarget,
        childStatus,
        consultationTime,
        consultationEndTime,
        hospitalizationTime
      })
    });

    state.schedule = data.schedule;
    state.assignments = data.assignments;
    renderSchedule();
    renderAssignments();
    if (data.schedule?.skipped) {
      showToast(`Расписание пропущено: ${data.schedule.reason}`);
    } else {
      const days = data.schedule?.workingDaysTarget || workingDaysTarget || state.profile?.defaultWorkingDays || 9;
      showToast(`Расписание сформировано на ${days} рабочих дней`);
    }
  } catch (error) {
    showToast(error.message);
  }
});

function renderSchedule() {
  const summaryEl = document.getElementById("scheduleSummary");
  const tableWrap = document.getElementById("scheduleTableWrap");

  if (!state.schedule || (!state.schedule.events?.length && !state.schedule.skipped)) {
    summaryEl.innerHTML = "<em>Расписание пока не сформировано</em>";
    tableWrap.innerHTML = "";
    return;
  }

  if (state.schedule?.skipped) {
    summaryEl.innerHTML = `
      <div><strong>Расписание пропущено</strong></div>
      <div class="inline-note">Причина: ${state.schedule.reason || "-"}</div>
      <div class="inline-note">Профиль: ${state.schedule.profile || state.profile?.key || "-"}</div>
    `;
    tableWrap.innerHTML = "";
    return;
  }

  const unresolved = state.schedule.unresolved || [];
  const skipped = Boolean(state.schedule.skipped);
  summaryEl.innerHTML = `
    <div><strong>Слотов запланировано:</strong> ${state.schedule.events.length}</div>
    <div class="inline-note">Профиль: ${state.schedule.profile || state.profile?.key || "-"}</div>
    <div class="inline-note">Рабочих дней: ${state.schedule.workingDaysTarget || state.profile?.defaultWorkingDays || "-"}</div>
    <div class="inline-note">Статус ребенка: ${state.schedule.reason === "child_status=norm" ? "норма" : "отклонения"}</div>
    <div class="inline-note">Неразмещено: ${unresolved.length}</div>
    ${skipped ? `<div class="inline-note" style="color:#a95f00;">Расписание пропущено: ${state.schedule.reason}</div>` : ""}
  `;

  const rows = state.schedule.events
    .map(
      (event) => `
      <tr data-date="${event.date}" data-time="${event.startTime}" data-type="${event.type}" class="schedule-slot">
        <td>${event.date}</td>
        <td>${event.startTime} - ${event.endTime}</td>
        <td>${event.specialist}</td>
        <td>${event.duration} мин</td>
      </tr>
    `
    )
    .join("");

  tableWrap.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Дата</th>
          <th>Время</th>
          <th>Специалист</th>
          <th>Длительность</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function assignmentStatusClass(status) {
  return status === "Выполнено" ? "status-done" : "status-planned";
}

function renderAssignments() {
  const wrap = document.getElementById("assignmentsWrap");

  if (!state.assignments.length) {
    wrap.innerHTML = "<em>Назначения отсутствуют. Сначала сформируйте расписание.</em>";
    return;
  }

  wrap.innerHTML = state.assignments
    .map(
      (a) => `
      <article class="assignment-card" data-assignment-id="${a.id}">
        <div class="assignment-meta">
          <div>
            <div class="assignment-title">${a.specialist}</div>
            <div class="assignment-time">${a.date} ${a.startTime} - ${a.endTime}</div>
          </div>
          <div class="status ${assignmentStatusClass(a.status)}">${a.status}</div>
        </div>

        <textarea class="assignment-diary" rows="2" placeholder="Короткий дневник процедуры">${a.diary || ""}</textarea>
        <div class="row right" style="margin-top:8px;">
          <button class="secondary mark-complete-btn" ${a.status === "Выполнено" ? "disabled" : ""}>
            Отметить выполнено
          </button>
        </div>
        ${
          a.completedAt
            ? `<div class="inline-note">Фиксация: ${new Date(a.completedAt).toLocaleString("ru-RU")}</div>`
            : ""
        }
      </article>
    `
    )
    .join("");

  wrap.querySelectorAll(".mark-complete-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const card = btn.closest(".assignment-card");
      const assignmentId = card.dataset.assignmentId;
      const diary = card.querySelector(".assignment-diary").value.trim();

      try {
        const data = await api(`/api/assignments/${assignmentId}/complete`, {
          method: "POST",
          body: JSON.stringify({ diary })
        });

        state.assignments = state.assignments.map((item) =>
          item.id === assignmentId ? data.assignment : item
        );
        renderAssignments();
        showToast("Статус обновлен: Выполнено");
      } catch (error) {
        showToast(error.message);
      }
    });
  });
}

async function refreshAudit() {
  const wrap = document.getElementById("auditWrap");
  try {
    const data = await api("/api/audit");
    if (!data.audit.length) {
      wrap.innerHTML = "<em>Пока нет записей в журнале</em>";
      return;
    }

    wrap.innerHTML = data.audit
      .map(
        (item) => `
        <div class="audit-item">
          <div><strong>${item.action}</strong></div>
          <div class="audit-time">${new Date(item.at).toLocaleString("ru-RU")}</div>
          <div class="inline-note">${JSON.stringify(item.details)}</div>
        </div>
      `
      )
      .join("");
  } catch (error) {
    wrap.innerHTML = `<span class="inline-note">${error.message}</span>`;
  }
}

document.getElementById("refreshAuditBtn").addEventListener("click", refreshAudit);

async function bootstrap() {
  const startDateInput = document.getElementById("startDate");
  startDateInput.value = new Date().toISOString().slice(0, 10);

  ["workingDaysTarget", "childStatus", "consultationTime", "consultationEndTime", "hospitalizationTime", "lfkCount", "massageCount", "psyCount"].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener("input", () => {
      el.dataset.userEdited = "1";
    });
    el.addEventListener("change", () => {
      el.dataset.userEdited = "1";
    });
  });

  document.getElementById("applyProfileBtn")?.addEventListener("click", async () => {
    try {
      await applyProfile();
      await refreshAudit();
    } catch (error) {
      showToast(error.message);
    }
  });

  try {
    await loadProfiles();
  } catch (error) {
    showToast(error.message);
  }

  try {
    const data = await api("/api/reception/current");
    if (data.profile) {
      state.profile = data.profile;
      renderProfileSelect();
      renderProfileUi();
    }
    if (data.patient) {
      state.patient = data.patient;
    }
    if (data.record) {
      state.record = {
        complaints: data.record.complaints || "",
        anamnesis: data.record.anamnesis || "",
        objectiveStatus: data.record.objectiveStatus || "",
        diagnosis: data.record.diagnosis || "",
        recommendations: data.record.recommendations || "",
        diary: data.record.diary || ""
      };
    }
    if (data.schedule) {
      state.schedule = data.schedule;
    }
    if (Array.isArray(data.assignments)) {
      state.assignments = data.assignments;
    }
  } catch (error) {
    showToast(error.message);
  }

  renderPatientInfo();
  syncFieldEditor();
  renderSchedule();
  renderAssignments();
  await renderPatientList();
}

bootstrap();
