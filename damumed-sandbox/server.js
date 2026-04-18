import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 4173;

const publicDir = path.join(__dirname, "public");

app.use(express.json());
app.use(express.static(publicDir));

const SLOT_TIMES = [
  "09:00",
  "09:30",
  "10:00",
  "10:30",
  "11:00",
  "11:30",
  "12:00",
  "12:30",
  "14:00",
  "14:30",
  "15:00",
  "15:30",
  "16:00",
  "16:30",
  "17:00",
  "17:30"
];

const SPECIALISTS = {
  lfk: { key: "lfk", name: "Инструктор ЛФК" },
  massage: { key: "massage", name: "Массажист" },
  psychologist: { key: "psychologist", name: "Психолог" }
};

const PROFILES = {
  neurologist: {
    key: "neurologist",
    label: "Невропатолог (демо 9 дней)",
    userRole: "Невропатолог детский",
    roleProfile: "default",
    defaultWorkingDays: 9
  },
  psychologist: {
    key: "psychologist",
    label: "Психолог (реал-поток 10 дней)",
    userRole: "Психолог стационара",
    roleProfile: "psychologist",
    defaultWorkingDays: 10
  }
};

// Pre-seeded medical records per patient (from real dataset)
const PATIENT_RECORDS = {
  "p-001": {
    complaints: "Жалобы на нарушение сна, тревожность, трудности с концентрацией внимания, повышенная утомляемость при умственной нагрузке.",
    anamnesis: "Анамнез заболевания: ухудшение состояния в течение последних 3 месяцев. Ранее перенесла ОРВИ с осложнениями. Наследственность не отягощена. Наблюдается у невропатолога с 2021 года.",
    objectiveStatus: "Состояние удовлетворительное. В сознании, контакт сохранён. Черепно-мозговые нервы без патологии. Сухожильные рефлексы D=S, живые. Менингеальных знаков нет. Координация не нарушена.",
    diagnosis: "Z86.6 — Расстройство сна неорганической этиологии",
    recommendations: "ЛФК 9 сеансов, массаж общий 5 сеансов, консультация психолога 3 сеанса. Режим дня, ограничение экранного времени до 1 часа в сутки."
  },
  "p-002": {
    complaints: "Жалобы на отсутствие речевого контакта, стереотипные движения, нарушение социальной коммуникации, избирательность в питании, нарушение сна.",
    anamnesis: "Диагноз F84.0 установлен в возрасте 2 лет. Ранее проходила курсы АВА-терапии. Речь отсутствует, использует карточки PECS. Сенсорные особенности: гиперчувствительность к звукам.",
    objectiveStatus: "Состояние средней тяжести. Контакт глаз снижен. Стереотипные движения рук. Речь: эхолалии, отдельные слова. Мышечный тонус в норме. Рефлексы сохранены.",
    diagnosis: "F84.0 — Детский аутизм",
    recommendations: "Занятия с психологом 5 сеансов, ЛФК адаптивная 7 сеансов, массаж расслабляющий 4 сеанса. Продолжить АВА-терапию амбулаторно."
  },
  "p-003": {
    complaints: "Жалобы на ограничение движений в нижних конечностях, нарушение походки, мышечная спастичность, задержка моторного развития.",
    anamnesis: "Диагноз G80.1 (спастическая диплегия) установлен в возрасте 8 месяцев. Роды на 32 неделе, перинатальная асфиксия. Регулярно проходит курсы реабилитации. Последний курс — 6 месяцев назад.",
    objectiveStatus: "Состояние средней тяжести. Спастичность нижних конечностей 2 балла по шкале Ашворта. Ходит с поддержкой. ДЦП форма — спастическая диплегия. Верхние конечности — без грубой патологии.",
    diagnosis: "G80.1 — Спастическая диплегия (ДЦП)",
    recommendations: "ЛФК интенсивная 9 сеансов, массаж нижних конечностей 7 сеансов, консультация психолога 2 сеанса. Упражнения по методике Войта амбулаторно."
  }
};

// Pre-occupied slots from other patients (weekday + time, all specialist types)
// weekday: 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat
const GLOBAL_BUSY = [
  { weekday: 1, time: "10:00" },
  { weekday: 2, time: "09:00" },
  { weekday: 3, time: "14:00" },
  { weekday: 4, time: "11:00" },
  { weekday: 5, time: "09:30" },
  { weekday: 1, time: "14:30" },
  { weekday: 3, time: "09:30" },
];

function isGloballyBusy(dateStr, timeStr) {
  const d = new Date(`${dateStr}T00:00:00`);
  const weekday = d.getDay();
  return GLOBAL_BUSY.some((b) => b.weekday === weekday && b.time === timeStr);
}

const db = {
  activeProfileKey: "neurologist",
  currentPatient: null,
  patients: [
    {
      id: "p-001",
      fullName: "ДӘУРЕНҚЫЗЫ ТОМИРИС",
      birthDate: "2014-01-08",
      diagnosis: "Z86.6",
      diagnosisText: "Расстройство сна неорганической этиологии",
      doctor: "САРЕНОВА БОТАКОЗ МАКСАТОВНА",
      // Common Whisper mis-transcriptions (Cyrillic & Latin) of this patient's name
      voiceAliases: ["томирис", "томирос", "тамирис", "tomiris", "tomyris", "tamyris"]
    },
    {
      id: "p-002",
      fullName: "РАХМЕТОЛЛА АЙКҮНІМ",
      birthDate: "2018-08-13",
      diagnosis: "F84.0",
      diagnosisText: "Детский аутизм",
      doctor: "БАТЫРГАЛИЕВА ЖАННА АЛЕКСАНДРОВНА",
      // Whisper hears Kazakh "Айкүнім" as Latin "Icon" because Ай ≈ English letter I
      voiceAliases: ["айкүнім", "айконом", "аэконом", "аиконом", "айкуним", "айкуным",
                     "айкном", "айкон", "айком",
                     "icon", "aikon", "aikun", "aikuenim", "aikunim", "icone"]
    },
    {
      id: "p-003",
      fullName: "НҰРБӨЛЕКҰЛЫ НҰРӘЛИ",
      birthDate: "2016-03-22",
      diagnosis: "G80.1",
      diagnosisText: "Спастическая диплегия (ДЦП)",
      doctor: "САРЕНОВА БОТАКОЗ МАКСАТОВНА",
      voiceAliases: ["нурали", "нуралей", "нурелей", "нурелы", "нурела",
                     "нурала", "нурали", "нуролей", "нурали",
                     "nurali", "norali", "nureli", "nuraly", "нурали"]
    }
  ],
  primaryRecord: null,
  schedule: [],
  assignments: [],
  audit: []
};

function getActiveProfile() {
  return PROFILES[db.activeProfileKey] || PROFILES.neurologist;
}

let assignmentCounter = 1;

const nowIso = () => new Date().toISOString();

function asDateOnly(date) {
  return date.toISOString().slice(0, 10);
}

function addAudit(action, details = {}) {
  db.audit.unshift({
    id: `audit-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    at: nowIso(),
    action,
    details
  });
}

function getBusinessDays(startDateInput, count) {
  const startDate = startDateInput ? new Date(startDateInput) : new Date();
  const day = new Date(startDate);
  day.setHours(0, 0, 0, 0);

  const result = [];
  while (result.length < count) {
    const weekday = day.getDay();
    if (weekday !== 0 && weekday !== 6) {
      result.push(asDateOnly(day));
    }
    day.setDate(day.getDate() + 1);
  }
  return result;
}

function normalizePlan(plan) {
  if (Array.isArray(plan) && plan.length > 0) {
    return plan
      .map((item) => ({
        type: item.type,
        duration: Number(item.duration) || 30,
        count: Number(item.count) || 1
      }))
      .filter((item) => SPECIALISTS[item.type]);
  }

  return [
    { type: "lfk", duration: 30, count: 9 },
    { type: "massage", duration: 30, count: 5 },
    { type: "psychologist", duration: 40, count: 3 }
  ];
}

function createAvailability(days) {
  const map = {};
  Object.keys(SPECIALISTS).forEach((type) => {
    map[type] = {};
    days.forEach((day) => {
      map[type][day] = SLOT_TIMES.map(() => true);
    });
  });
  return map;
}

function findContiguousStart(availabilityRow, blocks) {
  for (let i = 0; i <= availabilityRow.length - blocks; i += 1) {
    let ok = true;
    for (let j = 0; j < blocks; j += 1) {
      if (!availabilityRow[i + j]) {
        ok = false;
        break;
      }
    }
    if (ok) return i;
  }
  return -1;
}

function markUsed(availabilityRow, startIndex, blocks) {
  for (let j = 0; j < blocks; j += 1) {
    availabilityRow[startIndex + j] = false;
  }
}

function generateSchedule(planInput, startDate, options = {}) {
  const plan = normalizePlan(planInput);
  const profile = getActiveProfile();
  const requestedWorkingDays = Number(options.workingDaysTarget) || profile.defaultWorkingDays;
  const workingDaysTarget = Math.max(1, Math.min(20, requestedWorkingDays));
  const childStatus = String(options.childStatus || "deviations").toLowerCase();
  const consultationTime = String(options.consultationTime || "").trim();
  const consultationEndTime = String(options.consultationEndTime || "").trim();
  const hospitalizationTime = String(options.hospitalizationTime || "").trim();

  if (childStatus === "norm") {
    return {
      days: [],
      events: [],
      unresolved: [],
      createdAt: nowIso(),
      skipped: true,
      reason: "child_status=norm",
      workingDaysTarget: 0,
      profile: profile.key
    };
  }

  const days = getBusinessDays(startDate, workingDaysTarget);
  const availability = createAvailability(days);

  const blockedSlots = new Set();
  if (consultationTime) blockedSlots.add(consultationTime);
  if (hospitalizationTime) blockedSlots.add(hospitalizationTime);

  if (consultationEndTime && SLOT_TIMES.includes(consultationEndTime)) {
    const endIdx = SLOT_TIMES.indexOf(consultationEndTime);
    for (let i = 0; i <= endIdx; i += 1) {
      blockedSlots.add(SLOT_TIMES[i]);
    }
  }

  const events = [];
  const unresolved = [];

  plan.forEach((procedure) => {
    const blocks = Math.max(1, Math.ceil(procedure.duration / 30));
    for (let i = 0; i < procedure.count; i += 1) {
      let assigned = false;
      for (const day of days) {
        const row = availability[procedure.type][day];
        const startIndex = findContiguousStart(row, blocks);
        if (startIndex >= 0) {
          const startTime = SLOT_TIMES[startIndex];
          if (blockedSlots.has(startTime)) {
            continue;
          }

          markUsed(row, startIndex, blocks);
          const endIndex = Math.min(startIndex + blocks - 1, SLOT_TIMES.length - 1);
          let durationValue = procedure.duration;
          if (events.length === 0 && profile.roleProfile === "psychologist" && procedure.type === "psychologist") {
            durationValue = 30;
          }
          events.push({
            id: `evt-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
            date: day,
            startTime,
            endTime: SLOT_TIMES[endIndex + 1] || "18:00",
            specialist: SPECIALISTS[procedure.type].name,
            type: procedure.type,
            duration: durationValue
          });
          assigned = true;
          break;
        }
      }
      if (!assigned) {
        unresolved.push({
          type: procedure.type,
          specialist: SPECIALISTS[procedure.type].name,
          duration: procedure.duration
        });
      }
    }
  });

  events.sort((a, b) => {
    const left = `${a.date} ${a.startTime}`;
    const right = `${b.date} ${b.startTime}`;
    return left.localeCompare(right);
  });

  return {
    days,
    events,
    unresolved,
    createdAt: nowIso(),
    skipped: false,
    reason: "",
    workingDaysTarget,
    profile: profile.key
  };
}

/**
 * Phonetically normalize Kazakh name to simplified Cyrillic.
 * Whisper transcribes Kazakh names without special letters (ұ→у, ү→у, ә→а, etc.).
 * This lets us match "нурали" against "НҰРӘЛИ" and "айконом" against "АЙКҮНІМ".
 */
function kzToRu(s) {
  return s.toLowerCase()
    .replace(/[ұүу̇]/g, "у")
    .replace(/ә/g, "а")
    .replace(/қ/g, "к")
    .replace(/ң/g, "н")
    .replace(/[іи]/g, "и")
    .replace(/ғ/g, "г")
    .replace(/ө/g, "о")
    // Whisper sometimes renders the "ай" diphthong as "аэ" or "аи"
    .replace(/аэ/g, "ай")
    .replace(/аи/g, "ай");
}

/**
 * Fuzzy patient name matching — handles Whisper's distortion of Kazakh names.
 * Steps: exact → normalized exact → 3-char word-prefix on normalized strings.
 * Example: "айконом" matches "АЙКҮНІМ" (айкүнім→айкуним, prefix "айк" matches).
 *          "нурали"  matches "НҰРӘЛИ"  (нұрәли→нурали, exact match after normalize).
 */
function fuzzyPatientMatch(patient, query) {
  const name = patient.fullName.toLowerCase();
  // Strip trailing punctuation Whisper sometimes adds (period, comma, etc.)
  const q = query.toLowerCase().replace(/[.,!?;:]+$/, "").trim();

  // 1. Exact substring / ID
  if (name.includes(q) || patient.id.toLowerCase() === q) return true;

  // 2. Voice aliases — covers Latin Whisper outputs (e.g. "Icon" for "Айкүнім")
  const aliases = patient.voiceAliases || [];
  if (aliases.some((alias) => {
    const a = alias.toLowerCase();
    return a === q || q.includes(a) || a.includes(q);
  })) return true;

  // 3. After Kazakh→Russian phonetic normalization
  const normName = kzToRu(name);
  const normQ    = kzToRu(q);

  if (normName.includes(normQ)) return true;

  // 4. Word-level 3-char prefix matching on normalized Cyrillic strings
  const words      = normName.split(/\s+/).filter((w) => w.length >= 3);
  const queryWords = normQ.split(/\s+/).filter((w) => w.length >= 3);

  for (const qw of queryWords) {
    const prefix = qw.slice(0, 3);
    if (words.some((nw) => nw.startsWith(prefix))) return true;
  }

  return false;
}

/**
 * Number-based patient lookup.
 * Supports: "один/первого/1" → p-001, "два/второго/2" → p-002, "три/третьего/3" → p-003.
 * Whisper handles numbers perfectly — zero distortion risk.
 */
const ORDINAL_MAP = {
  // digits
  "1": 0, "2": 1, "3": 2,
  // cardinals
  "один": 0, "одного": 0, "два": 1, "двух": 1, "три": 2, "трёх": 2,
  // ordinals (all forms)
  "первый": 0, "первого": 0, "первой": 0, "первому": 0, "первую": 0, "первом": 0, "первый": 0,
  "второй": 1, "второго": 1, "второму": 1, "вторую": 1, "втором": 1,
  "третий": 2, "третьего": 2, "третьему": 2, "третью": 2, "третьем": 2,
};

function findPatientByNumber(query) {
  const q = query.toLowerCase().replace(/[.,!?;:]+$/, "").trim();
  // Direct match (single word/number)
  if (Object.prototype.hasOwnProperty.call(ORDINAL_MAP, q)) {
    return db.patients[ORDINAL_MAP[q]] || null;
  }
  // Word-by-word scan — \b doesn't work with Cyrillic in JS regex
  const words = q.split(/\s+/);
  for (const word of words) {
    if (Object.prototype.hasOwnProperty.call(ORDINAL_MAP, word)) {
      return db.patients[ORDINAL_MAP[word]] || null;
    }
  }
  return null;
}

app.get("/api/patients", (req, res) => {
  const query = String(req.query.query || "").trim().toLowerCase();
  const data = query
    ? db.patients.filter(
        (p) =>
          p.fullName.toLowerCase().includes(query) ||
          p.id.toLowerCase().includes(query) ||
          p.diagnosis.toLowerCase().includes(query) ||
          fuzzyPatientMatch(p, query)
      )
    : db.patients;
  res.json({ data });
});

app.get("/api/profiles", (req, res) => {
  const active = getActiveProfile();
  res.json({
    activeProfileKey: active.key,
    profiles: Object.values(PROFILES)
  });
});

app.post("/api/profiles/active", (req, res) => {
  const key = String(req.body?.profileKey || "").trim();
  if (!PROFILES[key]) {
    res.status(400).json({ error: "Неизвестный профиль" });
    return;
  }
  db.activeProfileKey = key;
  const active = getActiveProfile();
  addAudit("Переключен профиль sandbox", {
    profile: active.key,
    label: active.label
  });
  res.json({ activeProfileKey: active.key, profile: active });
});

app.post("/api/reception/open", (req, res) => {
  const query = String(req.body?.query || "").trim().toLowerCase();

  // Search priority: number → exact → ID → fuzzy → first patient
  const patient =
    findPatientByNumber(query) ||
    (query && db.patients.find((p) => p.fullName.toLowerCase().includes(query))) ||
    (query && db.patients.find((p) => p.id.toLowerCase() === query)) ||
    (query && db.patients.find((p) => fuzzyPatientMatch(p, query))) ||
    db.patients[0];

  db.currentPatient = patient;
  // Pre-load seeded medical record for this patient
  if (PATIENT_RECORDS[patient.id]) {
    db.primaryRecord = {
      patientId: patient.id,
      ...PATIENT_RECORDS[patient.id],
      updatedAt: nowIso()
    };
  } else {
    db.primaryRecord = null;
  }
  addAudit("Открыт первичный прием", {
    patientId: patient.id,
    patientName: patient.fullName,
    diagnosis: patient.diagnosisText || patient.diagnosis
  });

  res.json({ patient, record: db.primaryRecord });
});

app.get("/api/reception/current", (req, res) => {
  const profile = getActiveProfile();
  res.json({
    profile,
    patient: db.currentPatient,
    record: db.primaryRecord,
    schedule: db.schedule,
    assignments: db.assignments,
    audit: db.audit.slice(0, 100)
  });
});

app.post("/api/reception/record", (req, res) => {
  if (!db.currentPatient) {
    res.status(400).json({ error: "Сначала откройте пациента" });
    return;
  }

  const payload = {
    patientId: db.currentPatient.id,
    complaints: String(req.body?.complaints || "").trim(),
    anamnesis: String(req.body?.anamnesis || "").trim(),
    objectiveStatus: String(req.body?.objectiveStatus || "").trim(),
    diagnosis: String(req.body?.diagnosis || "").trim(),
    recommendations: String(req.body?.recommendations || "").trim(),
    updatedAt: nowIso()
  };

  db.primaryRecord = payload;
  addAudit("Сохранен первичный осмотр", {
    patientId: db.currentPatient.id,
    fields: ["Жалобы", "Анамнез", "Объективные данные", "Диагноз", "Назначения"]
  });

  res.json({ record: payload });
});

app.post("/api/schedule/generate", (req, res) => {
  if (!db.currentPatient) {
    res.status(400).json({ error: "Сначала откройте пациента" });
    return;
  }

  const plan = req.body?.plan;
  const startDate = req.body?.startDate;
  const schedule = generateSchedule(plan, startDate, {
    workingDaysTarget: req.body?.workingDaysTarget,
    childStatus: req.body?.childStatus,
    consultationTime: req.body?.consultationTime,
    consultationEndTime: req.body?.consultationEndTime,
    hospitalizationTime: req.body?.hospitalizationTime
  });
  db.schedule = schedule;

  if (schedule.skipped) {
    db.assignments = [];
    addAudit("Расписание пропущено", {
      patientId: db.currentPatient.id,
      reason: schedule.reason,
      profile: schedule.profile
    });
    res.json({
      schedule: db.schedule,
      assignments: db.assignments
    });
    return;
  }

  db.assignments = schedule.events.map((event) => ({
    id: `asg-${assignmentCounter++}`,
    eventId: event.id,
    patientId: db.currentPatient.id,
    patientName: db.currentPatient.fullName,
    date: event.date,
    startTime: event.startTime,
    endTime: event.endTime,
    specialist: event.specialist,
    type: event.type,
    status: "Запланировано",
    diary: "",
    updatedAt: schedule.createdAt,
    completedAt: null
  }));

  addAudit("Сформировано расписание", {
    patientId: db.currentPatient.id,
    profile: schedule.profile,
    workingDaysTarget: schedule.workingDaysTarget,
    events: schedule.events.length,
    unresolved: schedule.unresolved.length
  });

  res.json({
    schedule: db.schedule,
    assignments: db.assignments
  });
});

app.get("/api/schedule", (req, res) => {
  res.json({ schedule: db.schedule });
});

app.get("/api/assignments", (req, res) => {
  res.json({ assignments: db.assignments });
});

app.post("/api/assignments/:id/complete", (req, res) => {
  const assignment = db.assignments.find((a) => a.id === req.params.id);
  if (!assignment) {
    res.status(404).json({ error: "Назначение не найдено" });
    return;
  }

  const diary = String(req.body?.diary || "").trim();
  assignment.status = "Выполнено";
  assignment.completedAt = nowIso();
  assignment.updatedAt = assignment.completedAt;
  assignment.diary = diary;

  addAudit("Статус услуги изменен на 'Выполнено'", {
    assignmentId: assignment.id,
    patientId: assignment.patientId,
    specialist: assignment.specialist,
    completedAt: assignment.completedAt
  });

  if (diary) {
    addAudit("Добавлена дневниковая запись по услуге", {
      assignmentId: assignment.id,
      size: diary.length
    });
  }

  res.json({ assignment });
});

app.get("/api/audit", (req, res) => {
  res.json({ audit: db.audit.slice(0, 200) });
});

app.get("/api/slots/check", (req, res) => {
  const date = String(req.query.date || "").trim();
  const time = String(req.query.time || "").trim();
  const type = String(req.query.type || "").trim();

  if (!date || !time) {
    res.status(400).json({ error: "date and time required" });
    return;
  }

  if (isGloballyBusy(date, time)) {
    res.json({ available: false, reason: "busy_other_patient" });
    return;
  }

  const existing = db.assignments.find(
    (a) => a.date === date && a.startTime === time && (!type || a.type === type)
  );
  if (existing) {
    res.json({ available: false, reason: "already_assigned", assignment: existing });
    return;
  }

  res.json({ available: true, reason: "free" });
});

app.get("/api/slots/day", (req, res) => {
  const date = String(req.query.date || "").trim();
  if (!date) {
    res.status(400).json({ error: "date required" });
    return;
  }

  const d = new Date(`${date}T00:00:00`);
  const weekday = d.getDay();
  const slots = SLOT_TIMES.map((time) => {
    const globalBusy = GLOBAL_BUSY.some((b) => b.weekday === weekday && b.time === time);
    const assignment = db.assignments.find((a) => a.date === date && a.startTime === time);
    return {
      time,
      status: globalBusy ? "global_busy" : assignment ? "assigned" : "free",
      specialist: assignment ? assignment.specialist : null,
      type: assignment ? assignment.type : null,
    };
  });

  res.json({ date, slots });
});

app.get("/", (req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

app.listen(port, () => {
  console.log(`Damumed sandbox is running on http://localhost:${port}`);
});
