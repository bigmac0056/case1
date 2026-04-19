(function () {
  const PAGE_TOAST_ID = "aqbobek-page-toast";

  function pageToast(message) {
    const existing = document.getElementById(PAGE_TOAST_ID);
    if (existing) {
      existing.remove();
    }

    const host = document.body || document.documentElement;
    if (!host) {
      return;
    }

    const toast = document.createElement("div");
    toast.id = PAGE_TOAST_ID;
    toast.style.all = "initial";
    toast.style.position = "fixed";
    toast.style.right = "16px";
    toast.style.bottom = "16px";
    toast.style.zIndex = "2147483647";
    toast.style.background = "rgba(18,25,41,0.95)";
    toast.style.color = "#fff";
    toast.style.padding = "10px 12px";
    toast.style.borderRadius = "12px";
    toast.style.fontFamily = "Nunito Sans, sans-serif";
    toast.style.fontSize = "12px";
    toast.style.fontWeight = "700";
    toast.style.boxShadow = "0 18px 28px rgba(22,28,32,0.2)";
    toast.textContent = message;

    host.appendChild(toast);

    window.setTimeout(() => {
      toast.remove();
    }, 1800);
  }

  const ASSISTANT_ROOT_ID = "aqb-jarvis-root";
  const ENABLE_IN_PAGE_ASSISTANT_UI = false;
  const STORAGE_KEYS = {
    damumedUrl: "jarvis_damumed_url",
    sandboxUrl: "jarvis_sandbox_url",
    localAiUrl: "jarvis_local_ai_url",
    holdToTalk: "jarvis_hold_to_talk",
    autoResumeListening: "jarvis_auto_resume_listening",
    ttsEnabled: "jarvis_tts_enabled",
    session: "jarvis_assistant_session",
  };

  const DEFAULTS = {
    damumedUrl: "https://damumed.kz",
    sandboxUrl: "http://localhost:4173",
    localAiUrl: "http://127.0.0.1:8000/api/jarvis/process-visit",
  };

  const STAGE = {
    IDLE: "idle",
    COMMAND: "command",
    AWAITING_LOGIN: "awaiting_login",
    RECORDING_VISIT: "recording_visit",
    PROCESSING_VISIT: "processing_visit",
    AWAITING_VISIT_CONFIRMATION: "awaiting_visit_confirmation",
    AWAITING_SCHEDULE_CONFIRMATION: "awaiting_schedule_confirmation",
    AWAITING_SLOT_SELECTION: "awaiting_slot_selection",
  };

  const STAGE_TITLES = {
    [STAGE.IDLE]: "Ожидание",
    [STAGE.COMMAND]: "Командный режим",
    [STAGE.AWAITING_LOGIN]: "Ожидаем вход врача",
    [STAGE.RECORDING_VISIT]: "Идет запись приема",
    [STAGE.PROCESSING_VISIT]: "Локальная обработка записи",
    [STAGE.AWAITING_VISIT_CONFIRMATION]: "Подтверждение документа",
    [STAGE.AWAITING_SCHEDULE_CONFIRMATION]: "Подтверждение расписания",
    [STAGE.AWAITING_SLOT_SELECTION]: "Выбор слота по голосу",
  };

  const MAX_TRANSCRIPT_ITEMS = 80;
  const VOICE_AUTHOR = "voice";
  const JARVIS_AUTHOR = "jarvis";
  const PREFER_BACKEND_STT = true;
  const BACKEND_STT_CHUNK_MS = 4000;
  const BACKEND_STT_MIN_TEXT_CHARS = 2;
  const SLOT_REQUEST_TTL_MS = 15000;
  const AUTO_SCHEDULE_AFTER_VISIT = true;
  const DEMO_SAFE_MODE = true;
  const RECORD_AS_DICTAPHONE = true;
  const VISIT_FIELD_TITLES = {
    complaints: "жалобы",
    anamnesis: "анамнез",
    objective: "объективно",
    diagnosis: "диагноз",
    treatment: "назначения",
    diary: "дневник",
  };

  const state = {
    stage: STAGE.IDLE,
    listening: false,
    recognitionRunning: false,
    narratorSpeaking: false,
    ttsBlocked: false,
    ttsEnabled: true,
    recognitionError: "",
    recognition: null,
    backendStream: null,
    backendRecorder: null,
    fullVisitAudioChunks: [],
    backendLoopActive: false,
    backendStopRequested: false,
    transcript: [],
    visitLines: [],
    visitDraft: null,
    scheduleGrid: [],
    runtimeSlots: [],
    pendingSuggestedSlot: null,
    pendingSlotRequest: null,
    awaitingVoiceConfirm: null,
    strictVisitPending: false,
    patientHint: "",
    pendingSiteCheck: null,
    sttBusy: false,
    lastHeardText: "",
    lastHeardAt: 0,
    panelCollapsed: false,
    holdToTalk: false,
    holdingToTalk: false,
    config: {
      damumedUrl: DEFAULTS.damumedUrl,
      sandboxUrl: DEFAULTS.sandboxUrl,
      localAiUrl: DEFAULTS.localAiUrl,
    },
    lastResponse: {
      action: "none",
      speech: "",
      status: "IDLE",
      data: {},
    },
  };

  const RESPONSE_STATUS_MAP = {
    [STAGE.IDLE]: "IDLE",
    [STAGE.AWAITING_LOGIN]: "IDLE",
    [STAGE.COMMAND]: "READY",
    [STAGE.RECORDING_VISIT]: "RECORDING",
    [STAGE.PROCESSING_VISIT]: "PROCESSING",
    [STAGE.AWAITING_VISIT_CONFIRMATION]: "CONFIRMATION",
    [STAGE.AWAITING_SCHEDULE_CONFIRMATION]: "SCHEDULING",
    [STAGE.AWAITING_SLOT_SELECTION]: "SCHEDULING",
  };

  const refs = {
    root: null,
    panel: null,
    fab: null,
    status: null,
    talkButton: null,
    resetButton: null,
    saveConfigButton: null,
    damumedInput: null,
    sandboxInput: null,
    localAiInput: null,
    transcript: null,
    draft: null,
    schedule: null,
    minimize: null,
  };

  let persistTimer = null;
  let loginWatchTimer = null;
  let beepAudioCtx = null;
  const voiceQueue = [];
  let voiceQueueBusy = false;
  const domSlotElements = new Map();

  const WEEKDAY_WORDS = [
    "понедел",
    "вторн",
    "сред",        // среда, среду, среды, средой
    "четвер",
    "пятниц",      // пятница, пятницу, пятницей
    "суббот",      // суббота, субботу
    "воскрес",     // воскресенье, воскресенья
  ];

  const MONTH_WORDS = [
    "январ",
    "феврал",
    "март",
    "апрел",
    "ма",
    "июн",
    "июл",
    "август",
    "сентябр",
    "октябр",
    "ноябр",
    "декабр",
  ];

  const DOCTOR_DICTIONARY = [
    { name: "Инструктор ЛФК", keywords: ["лфк", "инструктор лфк", "реабилитолог"] },
    { name: "Массажист", keywords: ["массаж", "массажист"] },
    { name: "Клинический психолог", keywords: ["психолог", "клинический психолог"] },
    { name: "Невролог", keywords: ["невролог"] },
    { name: "Кардиолог", keywords: ["кардиолог"] },
    { name: "Терапевт", keywords: ["терапевт"] },
    { name: "Ортопед", keywords: ["ортопед"] },
  ];

  const BUSY_WORDS = [
    "занят",
    "занято",
    "busy",
    "booked",
    "reserved",
    "недоступ",
    "забронир",
    "бронь",
    "записан",
    "блок",
  ];

  const FREE_WORDS = [
    "свобод",
    "free",
    "доступ",
    "окно",
    "available",
  ];

  const DOM_CONFIG_DEFAULTS = {
    interactiveSelectors: [
      "button",
      "a",
      "[role='button']",
      "[onclick]",
      ".btn",
      ".button",
      "[data-testid*='button']",
      "[data-testid*='action']",
    ],
    patient: {
      searchSelectors: [
        "input[placeholder*='Пациент']",
        "input[placeholder*='ФИО']",
        "input[placeholder*='поиск']",
        "input[placeholder*='пациент']",
        "input[placeholder*='ИИН']",
        "input[placeholder*='Фамилия']",
        "input[placeholder*='Search']",
        "input[name*='patient']",
        "input[name*='search']",
        "input[id*='patient']",
        "input[id*='search']",
        "input[data-testid*='patient-search']",
      ],
      cardSelectors: [
        "tr[data-patient-id]",
        "[data-patient-id]",
        "[data-testid*='patient-row']",
        "[data-testid*='patient-card']",
        ".patient-row",
        ".patient-card",
        ".patient-list-item",
        "tr",
      ],
      cardTextHints: ["паци", "patient", "фио", "дата рождения", "карточка", "прием"],
      openButtonsSelectors: ["button", "a", "[role='button']", ".btn", ".button"],
      openButtonsKeywords: ["прием", "осмотр", "карточка", "открыть", "перейти", "open"],
    },
    visit: {
      startButtonSelectors: [
        "button",
        "a",
        "[role='button']",
        "[type='button']",
        ".btn",
        ".button",
        "[data-testid*='visit']",
        "[data-testid*='appointment']",
      ],
      startButtonKeywords: [
        "прием",
        "начать прием",
        "открыть прием",
        "начать осмотр",
        "осмотр",
        "войти в прием",
        "консультация",
        "appointment",
        "consultation",
      ],
      fieldSelectors: {
        complaints: [
          "[data-testid='complaints-field']",
          "textarea[name*='complaint']",
          "textarea[id*='complaint']",
          "textarea[placeholder*='Жалоб']",
        ],
        anamnesis: [
          "[data-testid='anamnesis-field']",
          "textarea[name*='anamnes']",
          "textarea[id*='anamnes']",
          "textarea[placeholder*='Анамнез']",
        ],
        objective: [
          "[data-testid='objective-field']",
          "textarea[name*='objective']",
          "textarea[id*='objective']",
          "textarea[placeholder*='Объектив']",
        ],
        diagnosis: [
          "[data-testid='diagnosis-field']",
          "textarea[name*='diagnosis']",
          "textarea[id*='diagnosis']",
          "textarea[placeholder*='Диагноз']",
        ],
        treatment: [
          "[data-testid='treatment-field']",
          "textarea[name*='treatment']",
          "textarea[id*='treatment']",
          "textarea[placeholder*='Назнач']",
        ],
        diary: [
          "[data-testid='diary-field']",
          "textarea[name*='diary']",
          "textarea[id*='diary']",
          "textarea[placeholder*='Дневник']",
        ],
      },
      // Sandbox: one shared textarea + tab buttons that swap its data-testid.
      // The injection routine clicks the tab first, then writes to the (now-active) textarea.
      tabSelectors: {
        complaints: ["[data-testid='complaints-tab']", ".field-tab[data-field='complaints']"],
        anamnesis: ["[data-testid='anamnesis-tab']", ".field-tab[data-field='anamnesis']"],
        objective: ["[data-testid='objective-tab']", ".field-tab[data-field='objectiveStatus']"],
        diagnosis: ["[data-testid='diagnosis-tab']", ".field-tab[data-field='diagnosis']"],
        treatment: ["[data-testid='treatment-tab']", ".field-tab[data-field='recommendations']"],
        diary: ["[data-testid='diary-tab']", ".field-tab[data-field='diary']"],
      },
      sharedFieldSelectors: [
        "textarea[data-testid='record-field-input']",
        "textarea#fieldInput",
      ],
      saveSelectors: [
        "button",
        "a",
        "[role='button']",
        ".btn",
        ".button",
        "[data-testid*='save']",
        "[data-testid*='confirm']",
      ],
      saveKeywords: ["сохран", "подтверд", "примен", "save", "confirm"],
    },
    schedule: {
      slotSelectors: [
        "[data-slot]",
        "[data-time]",
        "[data-specialist]",
        "[data-testid*='slot']",
        "[data-testid*='calendar-item']",
        ".slot",
        ".schedule-slot",
        ".slot-row",
        ".slot-item",
        ".calendar-slot",
        ".fc-timegrid-slot",
        "tr",
        "li",
        "button",
      ],
      doctorSelectors: [
        "[data-doctor]",
        "[data-specialist]",
        "[data-testid*='doctor']",
        ".doctor",
        ".specialist",
        ".resource-name",
      ],
      confirmSelectors: [
        "button",
        "a",
        "[role='button']",
        ".btn",
        ".button",
        "[data-testid*='confirm']",
        "[data-testid*='save']",
      ],
      confirmKeywords: ["подтверд", "сохран", "запис", "создать", "примен", "ok", "confirm", "create"],
      busyWords: BUSY_WORDS,
      freeWords: FREE_WORDS,
      busyClassHints: [
        "busy",
        "booked",
        "reserved",
        "disabled",
        "occupied",
        "unavailable",
        "blocked",
      ],
      freeClassHints: ["free", "available", "open", "enabled"],
    },
  };

  function asArray(value, fallback) {
    if (!Array.isArray(value) || value.length === 0) {
      return fallback;
    }
    return value.filter((item) => typeof item === "string" && item.trim()).map((item) => item.trim());
  }

  function getDomConfig() {
    const external = window.JarvisDomConfig;
    if (!external || typeof external !== "object") {
      return DOM_CONFIG_DEFAULTS;
    }

    return {
      interactiveSelectors: asArray(
        external.interactiveSelectors,
        DOM_CONFIG_DEFAULTS.interactiveSelectors
      ),
      patient: {
        searchSelectors: asArray(
          external.patient && external.patient.searchSelectors,
          DOM_CONFIG_DEFAULTS.patient.searchSelectors
        ),
        cardSelectors: asArray(
          external.patient && external.patient.cardSelectors,
          DOM_CONFIG_DEFAULTS.patient.cardSelectors
        ),
        cardTextHints: asArray(
          external.patient && external.patient.cardTextHints,
          DOM_CONFIG_DEFAULTS.patient.cardTextHints
        ).map((item) => normalizeText(item)),
        openButtonsSelectors: asArray(
          external.patient && external.patient.openButtonsSelectors,
          DOM_CONFIG_DEFAULTS.patient.openButtonsSelectors
        ),
        openButtonsKeywords: asArray(
          external.patient && external.patient.openButtonsKeywords,
          DOM_CONFIG_DEFAULTS.patient.openButtonsKeywords
        ).map((item) => normalizeText(item)),
      },
      visit: {
        startButtonSelectors: asArray(
          external.visit && external.visit.startButtonSelectors,
          DOM_CONFIG_DEFAULTS.visit.startButtonSelectors
        ),
        startButtonKeywords: asArray(
          external.visit && external.visit.startButtonKeywords,
          DOM_CONFIG_DEFAULTS.visit.startButtonKeywords
        ).map((item) => normalizeText(item)),
        fieldSelectors: {
          complaints: asArray(
            external.visit && external.visit.fieldSelectors && external.visit.fieldSelectors.complaints,
            DOM_CONFIG_DEFAULTS.visit.fieldSelectors.complaints
          ),
          anamnesis: asArray(
            external.visit && external.visit.fieldSelectors && external.visit.fieldSelectors.anamnesis,
            DOM_CONFIG_DEFAULTS.visit.fieldSelectors.anamnesis
          ),
          objective: asArray(
            external.visit && external.visit.fieldSelectors && external.visit.fieldSelectors.objective,
            DOM_CONFIG_DEFAULTS.visit.fieldSelectors.objective
          ),
          diagnosis: asArray(
            external.visit && external.visit.fieldSelectors && external.visit.fieldSelectors.diagnosis,
            DOM_CONFIG_DEFAULTS.visit.fieldSelectors.diagnosis
          ),
          treatment: asArray(
            external.visit && external.visit.fieldSelectors && external.visit.fieldSelectors.treatment,
            DOM_CONFIG_DEFAULTS.visit.fieldSelectors.treatment
          ),
          diary: asArray(
            external.visit && external.visit.fieldSelectors && external.visit.fieldSelectors.diary,
            DOM_CONFIG_DEFAULTS.visit.fieldSelectors.diary
          ),
        },
        tabSelectors: {
          complaints: asArray(
            external.visit && external.visit.tabSelectors && external.visit.tabSelectors.complaints,
            DOM_CONFIG_DEFAULTS.visit.tabSelectors.complaints
          ),
          anamnesis: asArray(
            external.visit && external.visit.tabSelectors && external.visit.tabSelectors.anamnesis,
            DOM_CONFIG_DEFAULTS.visit.tabSelectors.anamnesis
          ),
          objective: asArray(
            external.visit && external.visit.tabSelectors && external.visit.tabSelectors.objective,
            DOM_CONFIG_DEFAULTS.visit.tabSelectors.objective
          ),
          diagnosis: asArray(
            external.visit && external.visit.tabSelectors && external.visit.tabSelectors.diagnosis,
            DOM_CONFIG_DEFAULTS.visit.tabSelectors.diagnosis
          ),
          treatment: asArray(
            external.visit && external.visit.tabSelectors && external.visit.tabSelectors.treatment,
            DOM_CONFIG_DEFAULTS.visit.tabSelectors.treatment
          ),
          diary: asArray(
            external.visit && external.visit.tabSelectors && external.visit.tabSelectors.diary,
            DOM_CONFIG_DEFAULTS.visit.tabSelectors.diary
          ),
        },
        sharedFieldSelectors: asArray(
          external.visit && external.visit.sharedFieldSelectors,
          DOM_CONFIG_DEFAULTS.visit.sharedFieldSelectors
        ),
        saveSelectors: asArray(
          external.visit && external.visit.saveSelectors,
          DOM_CONFIG_DEFAULTS.visit.saveSelectors
        ),
        saveKeywords: asArray(
          external.visit && external.visit.saveKeywords,
          DOM_CONFIG_DEFAULTS.visit.saveKeywords
        ).map((item) => normalizeText(item)),
      },
      schedule: {
        slotSelectors: asArray(
          external.schedule && external.schedule.slotSelectors,
          DOM_CONFIG_DEFAULTS.schedule.slotSelectors
        ),
        doctorSelectors: asArray(
          external.schedule && external.schedule.doctorSelectors,
          DOM_CONFIG_DEFAULTS.schedule.doctorSelectors
        ),
        confirmSelectors: asArray(
          external.schedule && external.schedule.confirmSelectors,
          DOM_CONFIG_DEFAULTS.schedule.confirmSelectors
        ),
        confirmKeywords: asArray(
          external.schedule && external.schedule.confirmKeywords,
          DOM_CONFIG_DEFAULTS.schedule.confirmKeywords
        ).map((item) => normalizeText(item)),
        busyWords: asArray(
          external.schedule && external.schedule.busyWords,
          DOM_CONFIG_DEFAULTS.schedule.busyWords
        ).map((item) => normalizeText(item)),
        freeWords: asArray(
          external.schedule && external.schedule.freeWords,
          DOM_CONFIG_DEFAULTS.schedule.freeWords
        ).map((item) => normalizeText(item)),
        busyClassHints: asArray(
          external.schedule && external.schedule.busyClassHints,
          DOM_CONFIG_DEFAULTS.schedule.busyClassHints
        ).map((item) => normalizeText(item)),
        freeClassHints: asArray(
          external.schedule && external.schedule.freeClassHints,
          DOM_CONFIG_DEFAULTS.schedule.freeClassHints
        ).map((item) => normalizeText(item)),
      },
    };
  }

  const DOM_CONFIG = getDomConfig();

  function storageGet(keys) {
    if (typeof chrome === "undefined" || !chrome.storage || !chrome.storage.local) {
      return Promise.resolve({});
    }

    return new Promise((resolve) => {
      chrome.storage.local.get(keys, (result) => {
        if (chrome.runtime && chrome.runtime.lastError) {
          resolve({});
          return;
        }
        resolve(result || {});
      });
    });
  }

  function storageSet(values) {
    if (typeof chrome === "undefined" || !chrome.storage || !chrome.storage.local) {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      chrome.storage.local.set(values, () => {
        resolve();
      });
    });
  }

  function normalizeText(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/ё/g, "е")
      .replace(/[^a-zа-я0-9\s]/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function normalizeWakeVariants(value) {
    const text = normalizeText(value);
    if (!text) {
      return text;
    }

    const canonicalByAlias = {
      джарвис: "джарвиз",
      дарвис: "джарвиз",
      дарвиз: "джарвиз",
      джорвис: "джарвиз",
      джорвиз: "джарвиз",
      чарвис: "джарвиз",
      джарвич: "джарвиз",
      джарвикс: "джарвиз",
      джарвиc: "джарвиз",
      джарвизз: "джарвиз",
      джарвисс: "джарвиз",
      джарвик: "джарвиз",
      джарвив: "джарвиз",
      джарльз: "джарвиз",
      чарльз: "джарвиз",
      чарлис: "джарвиз",
      чарли: "джарвиз",
      джарви: "джарвиз",
      джарв: "джарвиз",
      ярвис: "джарвиз",
      ярвиз: "джарвиз",
      jarviss: "jarvis",
      jarwis: "jarvis",
      jarwiz: "jarvis",
      jervis: "jarvis",
      jarves: "jarvis",
      darvis: "jarvis",
      charles: "jarvis",
      charls: "jarvis",
      jarv: "jarvis",
    };

    return text
      .split(" ")
      .map((token) => canonicalByAlias[token] || token)
      .join(" ");
  }

  function includesAny(source, samples) {
    return samples.some((sample) => source.includes(sample));
  }

  function hasToken(normalized, token) {
    const tokens = String(normalized || "").split(/\s+/).filter(Boolean);
    return tokens.includes(String(token || "").trim());
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function playAcknowledgeBeep() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) {
        return;
      }

      if (!beepAudioCtx) {
        beepAudioCtx = new AudioCtx();
      }

      const now = beepAudioCtx.currentTime;
      const osc = beepAudioCtx.createOscillator();
      const gain = beepAudioCtx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(1046, now);

      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(0.08, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.11);

      osc.connect(gain);
      gain.connect(beepAudioCtx.destination);

      osc.start(now);
      osc.stop(now + 0.12);
    } catch (_error) {
    }
  }

  function trimArray(array, maxLength) {
    if (array.length <= maxLength) {
      return array;
    }
    return array.slice(array.length - maxLength);
  }

  const COMMAND_DEFAULTS = {
    wakeWords: [
      "джарвиз", "джарвис", "джарвич", "джарви", "джарв", "джарвив", "джарвисс", "джарвизз",
      "ярвис", "ярвиз",
      "jarvis", "jarviss", "jarwis", "jarwiz", "jarv",
    ],
    openDamumed: [
      "джарвиз открой дамумед",
      "джарвиз открой сайт дамумед",
      "джарвиз дамумед открой",
      "джарвиз open damumed",
    ],
    openSandbox: [
      "джарвиз открой песочницу",
      "джарвиз открой сайт песочницы",
      "джарвиз песочницу открой",
      "джарвиз open sandbox",
    ],
    startVisit: [
      "джарвиз начни прием", "джарвис начни прием",
      "джарвиз начинай прием", "джарвис начинай прием",
      "джарвиз открой прием", "джарвис открой прием",
      "джарвиз старт прием", "джарвис старт прием",
      "джарвиз начать прием", "джарвис начать прием",
    ],
    finishVisit: [
      "джарвиз завершай прием", "джарвис завершай прием",
      "джарвиз заверши прием", "джарвис заверши прием",
      "джарвиз завершай", "джарвис завершай",
    ],
    confirmYes: [
      "джарвиз да подтверждаю",
      "джарвис да подтверждаю",
      "джарвиз подтверждаю",
      "джарвис подтверждаю",
      "да подтверждаю",
      "подтверждаю",
    ],
    confirmNo: [
      "джарвиз нет",
      "джарвис нет",
      "джарвиз не подтверждаю",
      "джарвис не подтверждаю",
      "не подтверждаю",
      "отмена",
    ],
    analyzePage: [
      "джарвиз проверь страницу",
      "джарвиз анализ страницы",
      "джарвиз я вошел",
      "джарвиз вход выполнен",
    ],
    analyzeSchedule: [
      "джарвиз проверь расписание",
      "джарвиз проверь занятость",
      "джарвиз проверь свободные окна",
      "джарвиз проверь записи к докторам",
    ],
    placeSlot: [
      "джарвиз поставь на", "джарвиз поставь в", "джарвиз запиши на", "джарвиз перезапиши на",
      "джарвис поставь на", "джарвис поставь в", "джарвис запиши на", "джарвис перезапиши на",
    ],
    resetFlow: ["джарвиз сбрось прием", "джарвиз сброс сценария", "джарвиз очисти прием"],
    markCompleted: [
      "джарвиз отметь выполнено",
      "джарвис отметь выполнено",
      "джарвиз услуга выполнена",
      "джарвис услуга выполнена",
      "джарвиз статус выполнено",
      "джарвис статус выполнено",
    ],
  };

  function getVoiceConfig() {
    const external = window.JarvisVoiceConfig;
    if (!external || typeof external !== "object") {
      return COMMAND_DEFAULTS;
    }

    const externalCommands =
      external.commands && typeof external.commands === "object" ? external.commands : {};

    const cfg = {
      wakeWords: Array.isArray(external.wakeWords)
        ? external.wakeWords.map((item) => normalizeText(item)).filter(Boolean)
        : COMMAND_DEFAULTS.wakeWords,
    };

    Object.keys(COMMAND_DEFAULTS).forEach((key) => {
      if (key === "wakeWords") {
        return;
      }

      const custom = externalCommands[key];
      if (Array.isArray(custom) && custom.length) {
        cfg[key] = custom.map((item) => normalizeText(item)).filter(Boolean);
      } else {
        cfg[key] = COMMAND_DEFAULTS[key];
      }
    });

    if (!cfg.wakeWords.length) {
      cfg.wakeWords = COMMAND_DEFAULTS.wakeWords;
    }

    return cfg;
  }

  const VOICE_COMMANDS = getVoiceConfig();

  function matchCommand(normalized, key) {
    const samples = VOICE_COMMANDS[key] || [];
    const canonical = normalizeWakeVariants(normalized);
    const enriched = `${normalized} ${canonical} ${normalized.replace(/джарвис/g, "джарвиз")}`;
    return includesAny(enriched, samples);
  }

  function containsOnlyWakeWords(normalized) {
    const cleaned = normalizeWakeVariants(normalized)
      .replace(/[\.,!?;:]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!cleaned) {
      return false;
    }

    const tokens = cleaned.split(" ").filter(Boolean);
    if (!tokens.length || tokens.length > 4) {
      return false;
    }

    const fillers = new Set(["пожалуйста", "слушай", "слушайся"]);
    const wakeTokens = new Set([
      "джарвиз",
      "джарвис",
      "джорвис",
      "джорвиз",
      "чарвис",
      "дарвис",
      "джарвич",
      "джарви",
      "джарв",
      "джарльз",
      "чарльз",
      "jarvis",
      "charles",
    ]);

    return tokens.every((token) => wakeTokens.has(token) || fillers.has(token));
  }

  function commandRequiresWakeWord(normalized, stage) {
    if (!DEMO_SAFE_MODE) {
      return false;
    }

    if (!normalized) {
      return false;
    }

    const nonStrictStages = new Set([
      STAGE.RECORDING_VISIT,
      STAGE.AWAITING_VISIT_CONFIRMATION,
      STAGE.AWAITING_SCHEDULE_CONFIRMATION,
      STAGE.AWAITING_SLOT_SELECTION,
    ]);

    if (nonStrictStages.has(stage)) {
      return false;
    }

    if (containsOnlyWakeWords(normalized)) {
      return false;
    }

    const sensitive =
      isOpenDamumedCommand(normalized) ||
      isOpenSandboxCommand(normalized) ||
      isOpenVisitCommand(normalized) ||
      isFinishVisitCommand(normalized) ||
      isAnalyzePageCommand(normalized) ||
      isAnalyzeScheduleCommand(normalized) ||
      isPlaceSlotCommand(normalized) ||
      isAnyFreeSlotCommand(normalized) ||
      hasSlotRequestData(normalized) ||
      isResetFlowCommand(normalized);

    return sensitive;
  }

  function toResponseStatusByStage(stage) {
    return RESPONSE_STATUS_MAP[stage] || "IDLE";
  }

  function stageToAction(stage) {
    if (stage === STAGE.RECORDING_VISIT) {
      return "start_recording";
    }
    if (stage === STAGE.PROCESSING_VISIT) {
      return "fill_form";
    }
    if (
      stage === STAGE.AWAITING_SCHEDULE_CONFIRMATION ||
      stage === STAGE.AWAITING_SLOT_SELECTION
    ) {
      return "check_schedule";
    }
    if (stage === STAGE.AWAITING_VISIT_CONFIRMATION) {
      return "fill_form";
    }
    return "none";
  }

  function publishResponse(action, speech, data) {
    const envelope = {
      action: action || stageToAction(state.stage),
      speech: String(speech || ""),
      status: toResponseStatusByStage(state.stage),
      data: data && typeof data === "object" ? data : {},
    };

    state.lastResponse = envelope;

    try {
      window.dispatchEvent(
        new CustomEvent("jarvis:response", {
          detail: envelope,
        })
      );
    } catch (_error) {
    }

    return envelope;
  }

  function getLastResponseEnvelope() {
    return (
      state.lastResponse || {
        action: "none",
        speech: "",
        status: toResponseStatusByStage(state.stage),
        data: {},
      }
    );
  }

  async function speakAndPublish(action, speech, data, options) {
    const envelope = publishResponse(action, speech, data);

    if (PREFER_BACKEND_STT && state.backendLoopActive) {
      await stopBackendTranscriptionLoop();
    }

    await speak(speech, options);

    if (PREFER_BACKEND_STT && state.listening && !state.narratorSpeaking) {
      void runBackendTranscriptionLoop();
    }

    return envelope;
  }

  function buildAssistantMarkup() {
    return `
      <button class="aqb-jarvis-fab" id="aqb-jarvis-fab" type="button">JARVIS</button>
      <section class="aqb-jarvis-panel" id="aqb-jarvis-panel" aria-live="polite">
        <header class="aqb-jarvis-head">
          <div>
            <p class="aqb-jarvis-eyebrow">Медицинский ассистент</p>
            <p class="aqb-jarvis-title">JARVIS</p>
          </div>
          <button class="aqb-jarvis-minimize" id="aqb-jarvis-minimize" type="button" aria-label="Свернуть">
            —
          </button>
        </header>

        <p class="aqb-jarvis-status" id="aqb-jarvis-status"></p>

        <div class="aqb-jarvis-controls">
          <button class="aqb-jarvis-talk" id="aqb-jarvis-talk" type="button">Говорить</button>
          <button class="aqb-jarvis-reset" id="aqb-jarvis-reset" type="button">Сброс приема</button>
        </div>

        <div class="aqb-jarvis-config">
          <label class="aqb-jarvis-field">
            <span>Damumed URL</span>
            <input id="aqb-jarvis-damumed" type="url" placeholder="https://damumed.kz" />
          </label>
          <label class="aqb-jarvis-field">
            <span>Песочница URL</span>
            <input id="aqb-jarvis-sandbox" type="url" placeholder="https://your-sandbox.example" />
          </label>
          <label class="aqb-jarvis-field">
            <span>Local AI endpoint</span>
            <input id="aqb-jarvis-local-ai" type="url" placeholder="http://127.0.0.1:8000/process-visit" />
          </label>
          <button class="aqb-jarvis-save" id="aqb-jarvis-save" type="button">Сохранить настройки</button>
        </div>

        <section class="aqb-jarvis-block">
          <p class="aqb-jarvis-block-title">Лента записи</p>
          <div class="aqb-jarvis-transcript" id="aqb-jarvis-transcript"></div>
        </section>

        <section class="aqb-jarvis-block">
          <p class="aqb-jarvis-block-title">Черновик осмотра</p>
          <div class="aqb-jarvis-draft" id="aqb-jarvis-draft"></div>
        </section>

        <section class="aqb-jarvis-block">
          <p class="aqb-jarvis-block-title">Smart Scheduling (9 рабочих дней)</p>
          <div class="aqb-jarvis-schedule" id="aqb-jarvis-schedule"></div>
        </section>
      </section>
    `;
  }

  function stageLabel() {
    return STAGE_TITLES[state.stage] || STAGE_TITLES[STAGE.IDLE];
  }

  function renderStatus() {
    if (!refs.status) {
      return;
    }

    const narratorPart = state.narratorSpeaking ? "диктор говорит" : "диктор молчит";
    const micPart = state.listening ? "микрофон активен" : "микрофон выключен";
    const sttPart = state.sttBusy ? "слушаю..." : "ожидаю";
    refs.status.textContent = `${stageLabel()} • ${micPart} • ${narratorPart} • ${sttPart}`;
  }

  function renderButtons() {
    if (refs.talkButton) {
      refs.talkButton.textContent = state.listening ? "Остановить" : "Говорить";
      refs.talkButton.classList.toggle("listening", state.listening);
    }
  }

  function renderPanel() {
    if (!refs.panel) {
      return;
    }
    refs.panel.classList.toggle("collapsed", state.panelCollapsed);
  }

  function renderTranscript() {
    if (!refs.transcript) {
      return;
    }

    if (state.transcript.length === 0) {
      refs.transcript.innerHTML = `<p class="aqb-jarvis-empty">Нажмите «Говорить» и скажите «Открой сайт Damumed».</p>`;
      return;
    }

    refs.transcript.innerHTML = trimArray(state.transcript, 28)
      .map((item) => {
        const speaker = item.author === JARVIS_AUTHOR ? "JARVIS" : "Голос";
        const modifier = item.author === JARVIS_AUTHOR ? "jarvis" : "voice";
        return `
          <article class="aqb-jarvis-line ${modifier}">
            <p class="aqb-jarvis-speaker">${speaker}</p>
            <p class="aqb-jarvis-message">${escapeHtml(item.text)}</p>
          </article>
        `;
      })
      .join("");

    refs.transcript.scrollTop = refs.transcript.scrollHeight;
  }

  function renderDraft() {
    if (!refs.draft) {
      return;
    }

    const draft = state.visitDraft;
    if (!draft) {
      refs.draft.innerHTML = `<p class="aqb-jarvis-empty">После команды «Джарвиз завершай» тут появится структурированный осмотр.</p>`;
      return;
    }

    refs.draft.innerHTML = `
      <article class="aqb-jarvis-draft-card">
        <p><strong>Пациент:</strong> ${escapeHtml(draft.patient)}</p>
        <p><strong>Жалобы:</strong> ${escapeHtml(draft.complaints)}</p>
        <p><strong>Анамнез:</strong> ${escapeHtml(draft.anamnesis)}</p>
        <p><strong>Объективно:</strong> ${escapeHtml(draft.objective)}</p>
        <p><strong>Диагноз:</strong> ${escapeHtml(draft.diagnosis)}</p>
        <p><strong>Назначения:</strong> ${escapeHtml(draft.treatment)}</p>
        <p><strong>Дневник:</strong> ${escapeHtml(draft.diary)}</p>
      </article>
    `;
  }

  function renderSchedule() {
    if (!refs.schedule) {
      return;
    }

    if (!state.scheduleGrid.length && !state.runtimeSlots.length) {
      refs.schedule.innerHTML = `<p class="aqb-jarvis-empty">Расписание сгенерируется после подтверждения осмотра.</p>`;
      return;
    }

    if (state.runtimeSlots.length) {
      refs.schedule.innerHTML = state.runtimeSlots
        .slice(0, 60)
        .map((item) => {
          const modifier = item.status === "free" ? "ok" : item.status === "busy" ? "wait" : "";
          const statusText =
            item.status === "free" ? "Свободно" : item.status === "busy" ? "Занято" : "Нужно уточнить";

          return `
            <article class="aqb-jarvis-schedule-row ${modifier}">
              <p><strong>${escapeHtml(item.dateLabel)}</strong> • ${escapeHtml(item.specialist)}</p>
              <p>${escapeHtml(item.slotLabel)} (${item.duration} мин)</p>
              <p>${escapeHtml(statusText)}</p>
            </article>
          `;
        })
        .join("");
      return;
    }

    refs.schedule.innerHTML = state.scheduleGrid
      .map((item) => {
        const modifier = item.status === "ok" ? "ok" : "wait";
        return `
          <article class="aqb-jarvis-schedule-row ${modifier}">
            <p><strong>${escapeHtml(item.dateLabel)}</strong> • ${escapeHtml(item.procedure)}</p>
            <p>${escapeHtml(item.specialist)}</p>
            <p>${escapeHtml(item.slotLabel)} (${item.duration} мин)</p>
          </article>
        `;
      })
      .join("");
  }

  function renderConfig() {
    if (refs.damumedInput) {
      refs.damumedInput.value = state.config.damumedUrl || "";
    }
    if (refs.sandboxInput) {
      refs.sandboxInput.value = state.config.sandboxUrl || "";
    }
    if (refs.localAiInput) {
      refs.localAiInput.value = state.config.localAiUrl || "";
    }
  }

  function renderAll() {
    renderPanel();
    renderStatus();
    renderButtons();
    renderTranscript();
    renderDraft();
    renderSchedule();
  }

  function pushTranscript(author, text) {
    const value = String(text || "").trim();
    if (!value) {
      return;
    }

    state.transcript.push({
      author,
      text: value,
      timestamp: Date.now(),
    });

    state.transcript = trimArray(state.transcript, MAX_TRANSCRIPT_ITEMS);
    queuePersist();
    renderTranscript();
  }

  async function persistState() {
    const snapshot = {
      stage: state.stage,
      transcript: state.transcript,
      visitLines: state.visitLines,
      visitDraft: state.visitDraft,
      scheduleGrid: state.scheduleGrid,
      runtimeSlots: state.runtimeSlots,
      pendingSuggestedSlot: state.pendingSuggestedSlot,
      pendingSlotRequest: state.pendingSlotRequest,
      awaitingVoiceConfirm: state.awaitingVoiceConfirm,
      strictVisitPending: state.strictVisitPending,
      patientHint: state.patientHint,
      pendingSiteCheck: state.pendingSiteCheck,
      panelCollapsed: state.panelCollapsed,
      lastHeardText: state.lastHeardText,
      lastHeardAt: state.lastHeardAt,
    };

    await storageSet({
      [STORAGE_KEYS.session]: snapshot,
    });
  }

  function queuePersist() {
    if (persistTimer) {
      clearTimeout(persistTimer);
    }

    persistTimer = window.setTimeout(() => {
      persistTimer = null;
      void persistState();
    }, 200);
  }

  function normalizeConfiguredUrl(url) {
    const value = String(url || "").trim();
    if (!value) {
      return "";
    }
    try {
      const parsed = new URL(value);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        return "";
      }
      return parsed.toString();
    } catch (_error) {
      return "";
    }
  }

  function toApiBaseUrl(url) {
    const normalized = normalizeConfiguredUrl(url);
    if (!normalized) {
      return "";
    }

    try {
      return new URL(normalized).origin;
    } catch (_error) {
      return "";
    }
  }

  function toOriginUrl(url) {
    const normalized = normalizeConfiguredUrl(url);
    if (!normalized) {
      return "";
    }

    try {
      return new URL(normalized).origin;
    } catch (_error) {
      return "";
    }
  }

  function urlsMatch(currentUrl, configuredUrl) {
    const normalized = normalizeConfiguredUrl(configuredUrl);
    if (!normalized) {
      return false;
    }

    try {
      const current = new URL(currentUrl);
      const target = new URL(normalized);
      if (current.origin !== target.origin) {
        return false;
      }

      const expectedPath = target.pathname.replace(/\/$/, "");
      if (!expectedPath) {
        return true;
      }
      return current.pathname.startsWith(expectedPath);
    } catch (_error) {
      return false;
    }
  }

  function detectSiteByLocation() {
    const current = window.location.href;

    if (urlsMatch(current, state.config.damumedUrl) || /damumed/i.test(current)) {
      return "damumed";
    }

    if (urlsMatch(current, state.config.sandboxUrl)) {
      return "sandbox";
    }

    return "other";
  }

  function analyzeCurrentPage() {
    const site = detectSiteByLocation();
    if (site === "other") {
      return {
        site,
        loginRequired: false,
        ready: false,
      };
    }

    const passwordField = document.querySelector("input[type='password']");
    const authInput = document.querySelector(
      "input[type='email'], input[type='tel'], input[name*='login'], input[id*='login'], input[placeholder*='логин'], input[placeholder*='почт'], input[placeholder*='телефон'], input[placeholder*='email']"
    );

    const submitLike = [...document.querySelectorAll("button, input[type='submit'], a")].some((el) => {
      const text = normalizeText(el.textContent || el.value || "");
      return includesAny(text, ["войти", "логин", "sign in", "login", "авториза"]);
    });

    const bodyText = normalizeText((document.body && document.body.innerText) || "");
    const hasVisitContext = includesAny(bodyText, [
      "кабинет",
      "прием",
      "пациент",
      "карточка",
      "appointment",
      "dashboard",
    ]);

    const loginRequired = Boolean(passwordField) || Boolean(authInput && submitLike);
    const ready = !loginRequired && hasVisitContext;

    return {
      site,
      loginRequired,
      ready,
    };
  }

  function stopLoginWatcher() {
    if (loginWatchTimer) {
      clearInterval(loginWatchTimer);
      loginWatchTimer = null;
    }
  }

  function startLoginWatcher() {
    stopLoginWatcher();

    loginWatchTimer = window.setInterval(() => {
      if (state.stage !== STAGE.AWAITING_LOGIN) {
        stopLoginWatcher();
        return;
      }

      const analysis = analyzeCurrentPage();
      if (analysis.site === "other") {
        return;
      }

      if (!analysis.loginRequired) {
        extractSlotsFromPageDom();
        stopLoginWatcher();
        state.stage = STAGE.COMMAND;
        queuePersist();
        renderAll();
        void speakAndPublish("open_site", "Вход выполнен. Скажите: Джарвиз начни прием", {
          site: analysis.site,
          loginRequired: false,
        }, {
          resume: state.listening,
        });
      }
    }, 3000);
  }

  async function loadStoredState() {
    const data = await storageGet([
      STORAGE_KEYS.damumedUrl,
      STORAGE_KEYS.sandboxUrl,
      STORAGE_KEYS.localAiUrl,
      STORAGE_KEYS.holdToTalk,
      STORAGE_KEYS.autoResumeListening,
      STORAGE_KEYS.ttsEnabled,
      STORAGE_KEYS.session,
    ]);

    state.config.damumedUrl = normalizeConfiguredUrl(data[STORAGE_KEYS.damumedUrl]) || DEFAULTS.damumedUrl;
    state.config.damumedUrl = toOriginUrl(state.config.damumedUrl) || DEFAULTS.damumedUrl;
    state.config.sandboxUrl =
      toOriginUrl(normalizeConfiguredUrl(data[STORAGE_KEYS.sandboxUrl]) || DEFAULTS.sandboxUrl) || DEFAULTS.sandboxUrl;
    state.config.localAiUrl =
      normalizeConfiguredUrl(data[STORAGE_KEYS.localAiUrl]) || DEFAULTS.localAiUrl;
    state.holdToTalk = Boolean(data[STORAGE_KEYS.holdToTalk]);
    state.ttsEnabled = data[STORAGE_KEYS.ttsEnabled] !== false;
    const autoResume = data[STORAGE_KEYS.autoResumeListening];
    if (autoResume !== false) {
      await storageSet({ [STORAGE_KEYS.autoResumeListening]: true });
    }

    const saved = data[STORAGE_KEYS.session];
    if (saved && typeof saved === "object") {
      state.stage = STAGE_TITLES[saved.stage] ? saved.stage : STAGE.IDLE;
      state.transcript = Array.isArray(saved.transcript) ? trimArray(saved.transcript, MAX_TRANSCRIPT_ITEMS) : [];
      state.visitLines = Array.isArray(saved.visitLines) ? trimArray(saved.visitLines, 400) : [];
      state.visitDraft = saved.visitDraft && typeof saved.visitDraft === "object" ? saved.visitDraft : null;
      state.scheduleGrid = Array.isArray(saved.scheduleGrid) ? saved.scheduleGrid : [];
      state.runtimeSlots = Array.isArray(saved.runtimeSlots) ? saved.runtimeSlots : [];
      state.pendingSuggestedSlot =
        saved.pendingSuggestedSlot && typeof saved.pendingSuggestedSlot === "object"
          ? saved.pendingSuggestedSlot
          : null;
      state.pendingSlotRequest =
        saved.pendingSlotRequest && typeof saved.pendingSlotRequest === "object"
          ? saved.pendingSlotRequest
          : null;
      state.awaitingVoiceConfirm =
        saved.awaitingVoiceConfirm && typeof saved.awaitingVoiceConfirm === "object"
          ? saved.awaitingVoiceConfirm
          : null;
      state.strictVisitPending = Boolean(saved.strictVisitPending);
      state.patientHint = typeof saved.patientHint === "string" ? saved.patientHint : "";
      state.pendingSiteCheck = typeof saved.pendingSiteCheck === "string" ? saved.pendingSiteCheck : null;
      state.panelCollapsed = Boolean(saved.panelCollapsed);
      state.lastHeardText = typeof saved.lastHeardText === "string" ? saved.lastHeardText : "";
      state.lastHeardAt = Number(saved.lastHeardAt) || 0;
    }

    if (state.stage === STAGE.PROCESSING_VISIT) {
      state.stage = state.visitDraft ? STAGE.AWAITING_VISIT_CONFIRMATION : STAGE.COMMAND;
    }
  }

  function mountAssistant() {
    const existing = document.getElementById(ASSISTANT_ROOT_ID);
    if (existing) {
      existing.remove();
    }

    const host = document.body || document.documentElement;
    if (!host) {
      return;
    }

    const root = document.createElement("section");
    root.id = ASSISTANT_ROOT_ID;
    root.innerHTML = buildAssistantMarkup();
    host.appendChild(root);

    refs.root = root;
    refs.panel = root.querySelector("#aqb-jarvis-panel");
    refs.fab = root.querySelector("#aqb-jarvis-fab");
    refs.status = root.querySelector("#aqb-jarvis-status");
    refs.talkButton = root.querySelector("#aqb-jarvis-talk");
    refs.resetButton = root.querySelector("#aqb-jarvis-reset");
    refs.saveConfigButton = root.querySelector("#aqb-jarvis-save");
    refs.damumedInput = root.querySelector("#aqb-jarvis-damumed");
    refs.sandboxInput = root.querySelector("#aqb-jarvis-sandbox");
    refs.localAiInput = root.querySelector("#aqb-jarvis-local-ai");
    refs.transcript = root.querySelector("#aqb-jarvis-transcript");
    refs.draft = root.querySelector("#aqb-jarvis-draft");
    refs.schedule = root.querySelector("#aqb-jarvis-schedule");
    refs.minimize = root.querySelector("#aqb-jarvis-minimize");

    refs.fab?.addEventListener("click", () => {
      state.panelCollapsed = !state.panelCollapsed;
      renderPanel();
      queuePersist();
    });

    refs.minimize?.addEventListener("click", () => {
      state.panelCollapsed = true;
      renderPanel();
      queuePersist();
    });

    refs.talkButton?.addEventListener("click", () => {
      void toggleListening();
    });

    refs.resetButton?.addEventListener("click", () => {
      void resetVisitFlow();
    });

    refs.saveConfigButton?.addEventListener("click", () => {
      void saveConfigFromInputs();
    });

    renderConfig();
    renderAll();
  }

  async function saveConfigFromInputs() {
    if (!refs.damumedInput || !refs.sandboxInput || !refs.localAiInput) {
      return;
    }

    const damumedUrl = toOriginUrl(refs.damumedInput.value);
    const sandboxUrl = toOriginUrl(refs.sandboxInput.value);
    const localAiRaw = String(refs.localAiInput.value || "").trim();
    const localAiUrl = localAiRaw ? normalizeConfiguredUrl(localAiRaw) : "";

    if (!damumedUrl || !sandboxUrl) {
      pageToast("Проверьте URL: нужны корректные http/https адреса.");
      return;
    }

    if (localAiRaw && !localAiUrl) {
      pageToast("Local AI endpoint должен быть корректным URL или пустым.");
      return;
    }

    state.config.damumedUrl = damumedUrl;
    state.config.sandboxUrl = sandboxUrl;
    state.config.localAiUrl = localAiUrl;

    await storageSet({
      [STORAGE_KEYS.damumedUrl]: damumedUrl,
      [STORAGE_KEYS.sandboxUrl]: sandboxUrl,
      [STORAGE_KEYS.localAiUrl]: localAiUrl,
    });

    queuePersist();
    pageToast("Настройки ассистента сохранены.");
  }

  function stopRecognitionRuntime() {
    if (!state.recognition || !state.recognitionRunning) {
      return;
    }

    try {
      state.recognition.stop();
    } catch (_error) {
    }
    state.recognitionRunning = false;
  }

  function getSpeechRecognitionCtor() {
    return window.SpeechRecognition || window.webkitSpeechRecognition || null;
  }

  async function stopBackendTranscriptionLoop() {
    state.backendStopRequested = true;
    state.backendLoopActive = false;
    state.sttBusy = false;

    if (state.backendRecorder) {
      try {
        if (state.backendRecorder.state === "recording") {
          state.backendRecorder.stop();
        }
      } catch (_error) {
      }
    }

    state.backendRecorder = null;

    if (state.backendStream) {
      try {
        state.backendStream.getTracks().forEach((track) => track.stop());
      } catch (_error) {
      }
    }

    state.backendStream = null;
    renderAll();
  }

  function backendTranscribeBlob(blob) {
    return new Promise((resolve) => {
      if (!blob || blob.size === 0) {
        resolve("");
        return;
      }

      const done = (text) => resolve(String(text || "").trim());

      const reader = new FileReader();
      reader.onloadend = async () => {
        try {
          const bytes = new Uint8Array(reader.result || new ArrayBuffer(0));
          const base64 = btoa(String.fromCharCode(...bytes));
          const bridge = window.AqbobekBridge;

          if (!bridge || typeof bridge.request !== "function") {
            done("");
            return;
          }

      const response = await bridge.request("/api/transcribe-base64", {
        method: "POST",
        body: {
          audio_base64: base64,
          mime_type: blob.type || "audio/webm",
          prompt: "джарвис дамумед прием расписание подтверждаю жалобы анамнез объективно диагноз назначения дневник",
        },
      });

          if (!response || !response.ok) {
            done("");
            return;
          }

          const text =
            response.data && typeof response.data === "object"
              ? response.data.text || ""
              : "";
          done(text);
        } catch (_error) {
          done("");
        }
      };
      reader.onerror = () => resolve("");
      reader.readAsArrayBuffer(blob);
    });
  }

  async function transcribeFullVisitAudio() {
    if (!state.fullVisitAudioChunks.length) {
      return "";
    }

    try {
      const blob = new Blob(state.fullVisitAudioChunks, { type: "audio/webm" });
      const text = await backendTranscribeBlob(blob);
      return String(text || "").trim();
    } catch (_error) {
      return "";
    }
  }

  async function runBackendTranscriptionLoop() {
    if (!state.listening || state.narratorSpeaking || state.backendLoopActive) {
      return;
    }

    state.backendStopRequested = false;

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || typeof MediaRecorder === "undefined") {
      state.recognitionError = "media-not-supported";
      pageToast("Браузер не поддерживает запись микрофона через MediaRecorder.");
      return;
    }

    try {
      state.backendStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
    } catch (_error) {
      state.listening = false;
      state.recognitionError = "not-allowed";
      renderAll();
      pageToast("Нет доступа к микрофону. Разрешите микрофон для сайта и нажмите Говорить снова.");
      return;
    }

    state.backendLoopActive = true;
    state.fullVisitAudioChunks = [];
    renderAll();

      while (state.listening && !state.backendStopRequested && !state.narratorSpeaking) {
      state.sttBusy = true;
      renderAll();
      const chunkText = await new Promise((resolve) => {
        let settled = false;
        const chunks = [];

        const finalize = async () => {
          if (settled) {
            return;
          }
          settled = true;
          const blob = new Blob(chunks, { type: "audio/webm" });
          const text = await backendTranscribeBlob(blob);
          resolve(text);
        };

        try {
          const recorder = new MediaRecorder(state.backendStream, { mimeType: "audio/webm" });
          state.backendRecorder = recorder;

          recorder.ondataavailable = (event) => {
            if (event.data && event.data.size > 0) {
              chunks.push(event.data);
              if (RECORD_AS_DICTAPHONE) {
                state.fullVisitAudioChunks.push(event.data);
              }
            }
          };

          recorder.onerror = () => {
            if (!settled) {
              settled = true;
              resolve("");
            }
          };

          recorder.onstop = () => {
            void finalize();
          };

          recorder.start();

          window.setTimeout(() => {
            try {
              if (recorder.state === "recording") {
                recorder.stop();
              }
            } catch (_error) {
              if (!settled) {
                settled = true;
                resolve("");
              }
            }
          }, BACKEND_STT_CHUNK_MS);
        } catch (_error) {
          if (!settled) {
            settled = true;
            resolve("");
          }
        }
      });

      if (!state.listening || state.backendStopRequested) {
        break;
      }

      state.sttBusy = false;
      renderAll();

      if (chunkText && chunkText.length >= BACKEND_STT_MIN_TEXT_CHARS) {
        state.recognitionError = "";
        enqueueVoiceText(chunkText);
      }
    }

    state.sttBusy = false;
    renderAll();
    await stopBackendTranscriptionLoop();
  }

  function ensureRecognition() {
    if (state.recognition) {
      return true;
    }

    const Recognition = getSpeechRecognitionCtor();
    if (!Recognition) {
      return false;
    }

    const recognition = new Recognition();
    recognition.lang = "ru-RU";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        if (!result.isFinal) {
          continue;
        }

        const text = (result[0] && result[0].transcript) || "";
        const normalized = text.trim();
        if (normalized) {
          enqueueVoiceText(normalized);
        }
      }
    };

    recognition.onerror = (event) => {
      if (event.error === "no-speech") {
        return;
      }

      state.recognitionError = String(event.error || "");

      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        state.listening = false;
        stopRecognitionRuntime();
        renderAll();
        pageToast("Нужен доступ к микрофону в настройках браузера.");
        return;
      }

      if (event.error === "network") {
        state.listening = false;
        stopRecognitionRuntime();
        renderAll();
        pageToast("Ошибка распознавания: network. Откройте localhost:4173 по HTTP, разрешите микрофон и нажмите Говорить снова.");
        return;
      }

      pageToast(`Ошибка распознавания: ${event.error}`);
    };

    recognition.onend = () => {
      state.recognitionRunning = false;
      renderAll();

      if (state.listening && !state.narratorSpeaking) {
        startRecognitionRuntime();
      }
    };

    state.recognition = recognition;
    return true;
  }

  function startRecognitionRuntime() {
    if (!ensureRecognition()) {
      pageToast("SpeechRecognition недоступен в этом браузере.");
      state.listening = false;
      renderAll();
      return;
    }

    if (state.recognitionRunning || state.narratorSpeaking) {
      return;
    }

    try {
      state.recognition.start();
      state.recognitionRunning = true;
      renderAll();
    } catch (error) {
      const message = String(error || "");
      if (!/already started/i.test(message)) {
        pageToast("Не удалось включить микрофон.");
      }
    }
  }

  function speak(text, options) {
    const value = String(text || "").trim();
    if (!value) {
      return Promise.resolve();
    }

    console.log("[JARVIS speak() called]", value.slice(0, 80));
    const resume = !options || options.resume !== false;
    const shouldResume = Boolean(resume && state.listening);

    pushTranscript(JARVIS_AUTHOR, value);

    if (!state.ttsEnabled) {
      state.narratorSpeaking = false;
      renderAll();
      return Promise.resolve();
    }

    stopRecognitionRuntime();
    state.narratorSpeaking = true;
    renderAll();

    const synth = window.speechSynthesis;
    const Utterance = window.SpeechSynthesisUtterance;
    if (!synth || typeof Utterance === "undefined") {
      state.narratorSpeaking = false;
      if (shouldResume) {
        if (PREFER_BACKEND_STT) {
          void runBackendTranscriptionLoop();
        } else {
          startRecognitionRuntime();
        }
      }
      renderAll();
      return Promise.resolve();
    }

    synth.cancel();

    return new Promise((resolve) => {
      const utterance = new Utterance(value);
      utterance.lang = "ru-RU";
      utterance.rate = 1;
      utterance.pitch = 1;

      let finalized = false;
      const finalize = (reason) => {
        if (finalized) return;
        finalized = true;
        clearTimeout(ttsTimeoutId);
        console.log("[JARVIS TTS end]", reason || "ok", value.slice(0, 60));
        state.narratorSpeaking = false;
        renderAll();
        if (shouldResume) {
          if (PREFER_BACKEND_STT) {
            // Restart backend Whisper loop instead of native SpeechRecognition
            // (native fails with "network" on HTTP localhost)
            void runBackendTranscriptionLoop();
          } else {
            startRecognitionRuntime();
          }
        }
        resolve();
      };

      utterance.onend = () => finalize("onend");
      utterance.onerror = (e) => {
        console.error("[JARVIS TTS error]", e.error, value.slice(0, 60));
        if (e && (e.error === "not-allowed" || e.error === "service-not-allowed")) {
          state.ttsBlocked = true;
          queuePersist();
          renderAll();
        }
        finalize("onerror");
      };

      // Fallback: if TTS hangs (Chrome MV3 bug), force-unblock after 8s
      const ttsTimeoutId = window.setTimeout(() => finalize("timeout"), 8000);

      synth.speak(utterance);
      console.log("[JARVIS TTS speak]", value.slice(0, 80));
    });
  }

  async function startListening() {
    if (!ensureRecognition()) {
      pageToast("Ваш браузер не поддерживает распознавание речи.");
      return;
    }

    state.listening = true;
    state.recognitionError = "";
    state.ttsBlocked = false;
    state.sttBusy = false;
    renderAll();

    if (PREFER_BACKEND_STT) {
      void runBackendTranscriptionLoop();
      return;
    }

    if (state.transcript.length === 0) {
      await speakAndPublish("none", "Голосовой режим активирован. Ожидаю команду с ключевым словом Джарвиз", {}, {
        resume: true,
      });
      return;
    }

    startRecognitionRuntime();
  }

  function stopListening() {
    state.listening = false;
    state.sttBusy = false;
    if (!RECORD_AS_DICTAPHONE) {
      state.fullVisitAudioChunks = [];
    }
    void stopBackendTranscriptionLoop();
    stopRecognitionRuntime();
    renderAll();
    pageToast("Микрофон выключен.");
  }

  async function toggleListening() {
    if (state.listening) {
      stopListening();
      return;
    }
    await startListening();
  }

  function containsWakeWord(normalized) {
    const canonical = normalizeWakeVariants(normalized);
    const enriched = `${normalized} ${canonical} ${normalized.replace(/джарвис/g, "джарвиз")}`;
    if (includesAny(enriched, VOICE_COMMANDS.wakeWords)) {
      return true;
    }

    const tokens = canonical.split(" ").filter(Boolean);
    if (tokens.some(
      (token) => token.startsWith("джарв") || token.startsWith("jarv") || token.startsWith("ярв")
    )) {
      return true;
    }

    if (tokens.some((token) =>
      token.startsWith("джарл") || token.startsWith("жарв") || token.startsWith("jarl")
    )) {
      return true;
    }

    return tokens.some((token) =>
      token.startsWith("чарл") || token === "charles" || token === "charls"
    );
  }

  function isWakeOnlyCommand(normalized) {
    if (containsOnlyWakeWords(normalized)) {
      return true;
    }

    const canonical = normalizeWakeVariants(normalized)
      .replace(/\b(ты|тут|слышишь|на\s+связи|живой|есть|онлайн)\b/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!canonical) {
      return false;
    }

    return (VOICE_COMMANDS.wakeWords || []).some(
      (wakeWord) => normalizeWakeVariants(wakeWord) === canonical
    );
  }

  async function processWithoutWakeWord(text, normalized) {
    if (state.stage === STAGE.COMMAND) {
      if (isOpenVisitCommand(normalized) || includesAny(normalized, ["начни", "начнем", "начни прием", "начать прием"])) {
        pushTranscript(VOICE_AUTHOR, text);
        await beginVisit(`джарвиз ${text}`);
        return true;
      }

      if (isFinishVisitCommand(normalized) || includesAny(normalized, ["заверши", "стоп", "останови прием"])) {
        pushTranscript(VOICE_AUTHOR, text);
        await finishVisit();
        return true;
      }

      if (isOpenDamumedCommand(normalized) || includesAny(normalized, ["открой дамумед", "открой damumed"])) {
        pushTranscript(VOICE_AUTHOR, text);
        await openSiteCommand("damumed");
        return true;
      }

      if (isOpenSandboxCommand(normalized) || includesAny(normalized, ["открой песочницу", "открой sandbox", "песочницу", "первого пациента", "первый пациент"])) {
        pushTranscript(VOICE_AUTHOR, text);
        if (includesAny(normalized, ["первого пациента", "первый пациент"])) {
          const opened = await openFirstPatientFromDom();
          if (!opened) {
            await speakAndPublish("open_site", "Не нашел карточку первого пациента на этой вкладке.", {}, { resume: true });
          }
        } else {
          await openSiteCommand("sandbox");
        }
        return true;
      }
    }

    if (state.stage === STAGE.RECORDING_VISIT) {
      appendVisitLine(text);
      console.log("[JARVIS visit line]", text.slice(0, 60));
      return true;
    }

    if (state.stage === STAGE.AWAITING_VISIT_CONFIRMATION) {
      if (isYesCommand(normalized) || isNoCommand(normalized)) {
        pushTranscript(VOICE_AUTHOR, text);
        await handleVisitConfirmation(normalized);
        return true;
      }

      if (includesAny(normalized, ["да подтверждаю", "подтверждаю", "ok", "ок"])) {
        pushTranscript(VOICE_AUTHOR, text);
        await handleVisitConfirmation("да подтверждаю");
        return true;
      }

      if (includesAny(normalized, ["нет", "не подтверждаю", "отмена"])) {
        pushTranscript(VOICE_AUTHOR, text);
        await handleVisitConfirmation("нет");
        return true;
      }

      return false;
    }

    if (state.stage === STAGE.AWAITING_SCHEDULE_CONFIRMATION) {
      if (isYesCommand(normalized) || isNoCommand(normalized)) {
        pushTranscript(VOICE_AUTHOR, text);
        await handleScheduleConfirmation(normalized);
        return true;
      }
      return false;
    }

    if (state.stage === STAGE.AWAITING_SLOT_SELECTION) {
      if (isOpenVisitCommand(normalized) || includesAny(normalized, ["начни", "начнем", "начни прием", "начать прием"])) {
        pushTranscript(VOICE_AUTHOR, text);
        await beginVisit(`джарвиз ${text}`);
        return true;
      }

      if (isSlotConfirmationIntent(normalized)) {
        pushTranscript(VOICE_AUTHOR, text);
        await applyRequestedSlot(normalized);
        return true;
      }

      if (isOpenDamumedCommand(normalized)) {
        pushTranscript(VOICE_AUTHOR, text);
        await openSiteCommand("damumed");
        return true;
      }

      if (isOpenSandboxCommand(normalized)) {
        pushTranscript(VOICE_AUTHOR, text);
        await openSiteCommand("sandbox");
        return true;
      }

      if (isOpenVisitCommand(normalized)) {
        pushTranscript(VOICE_AUTHOR, text);
        await beginVisit(text);
        return true;
      }

      if (isFinishVisitCommand(normalized)) {
        pushTranscript(VOICE_AUTHOR, text);
        await finishVisit();
        return true;
      }

      if (isAnalyzeScheduleCommand(normalized)) {
        pushTranscript(VOICE_AUTHOR, text);
        await announceCurrentAvailability();
        return true;
      }

      if (isAnyFreeSlotCommand(normalized)) {
        pushTranscript(VOICE_AUTHOR, text);
        await applyRequestedSlot(normalized);
        return true;
      }

      if (
        isPlaceSlotCommand(normalized) ||
        hasSlotRequestData(normalized) ||
        isAnyFreeSlotCommand(normalized) ||
        isYesCommand(normalized) ||
        isNoCommand(normalized)
      ) {
        pushTranscript(VOICE_AUTHOR, text);
        await applyRequestedSlot(normalized);
        return true;
      }

      return false;
    }

    if (state.stage === STAGE.COMMAND) {
      if (
        isAnyFreeSlotCommand(normalized) ||
        isPlaceSlotCommand(normalized) ||
        hasSlotRequestData(normalized)
      ) {
        pushTranscript(VOICE_AUTHOR, text);
        state.stage = STAGE.AWAITING_SLOT_SELECTION;
        queuePersist();
        renderAll();
        await applyRequestedSlot(normalized);
        return true;
      }

      if (isMarkCompletedCommand(normalized)) {
        pushTranscript(VOICE_AUTHOR, text);
        await markLatestServiceCompleted("", "voice_no_wake");
        return true;
      }
    }

    return false;
  }

  function isOpenDamumedCommand(normalized) {
    return matchCommand(normalized, "openDamumed");
  }

  function isOpenSandboxCommand(normalized) {
    return matchCommand(normalized, "openSandbox");
  }

  function isOpenVisitCommand(normalized) {
    return matchCommand(normalized, "startVisit") || includesAny(normalized, [
      "начни новый прием",
      "начни новый приём",
      "новый прием",
      "новый приём",
    ]);
  }

  function isFinishVisitCommand(normalized) {
    return matchCommand(normalized, "finishVisit");
  }

  function isYesCommand(normalized) {
    return matchCommand(normalized, "confirmYes");
  }

  function isNoCommand(normalized) {
    return matchCommand(normalized, "confirmNo");
  }

  function isAnalyzePageCommand(normalized) {
    return matchCommand(normalized, "analyzePage");
  }

  function isAnalyzeScheduleCommand(normalized) {
    return matchCommand(normalized, "analyzeSchedule");
  }

  function isPlaceSlotCommand(normalized) {
    return (
      matchCommand(normalized, "placeSlot") ||
      includesAny(normalized, [
        "поставь на",
        "поставь в",
        "запиши на",
        "запиши в",
        "запиши",
        "записать",
        "записаться",
        "запишите",
        "записывай",
        "перезапиши на",
        "посади на",
        "посадить на",
        "посадит на",
        "спасать на",
        "поставь",
        "любое свободное",
        "в свободное время",
        "на ближайшее время",
        "ближайшее свободное",
      ])
    );
  }

  function isAnyFreeSlotCommand(normalized) {
    return includesAny(normalized, [
      "запиши в любое свободное",
      "запиши в свободное",
      "запиши на ближайшее свободное",
      "поставь на любое свободное",
      "поставь на ближайшее свободное",
      "поставь на ближайшую дату",
      "на ближайшую дату",
      "на любую ближайшую дату",
      "поставь на любую ближайшую дату",
      "выбери ближайшую дату",
      "самую ближайшую дату",
      "любую ближайшую",
      "подбери ближайшую",
      "подбери свободную",
      "подбери слот",
      "выбери слот",
      "в любое свободное время",
      "в свободное время",
      "на любое свободное",
      "на ближайшее время",
      "в ближайшее свободное",
      "любой свободный слот",
      "первое свободное",
    ]);
  }

  function parseFreeSlotPreference(normalized) {
    const date = parseDateFromText(normalized) || parseRelativeDateFromText(normalized);

    let timeFrom = null;
    let timeTo = null;
    let timeLabel = "";

    if (includesAny(normalized, ["утр", "утром"])) {
      timeFrom = 8 * 60;
      timeTo = 12 * 60;
      timeLabel = "утром";
    } else if (includesAny(normalized, ["днем", "днём", "дня"])) {
      timeFrom = 12 * 60;
      timeTo = 17 * 60;
      timeLabel = "днем";
    } else if (includesAny(normalized, ["вечер", "вечером", "вечера"])) {
      timeFrom = 17 * 60;
      timeTo = 22 * 60;
      timeLabel = "вечером";
    } else if (includesAny(normalized, ["ноч", "ночью"])) {
      timeFrom = 0;
      timeTo = 8 * 60;
      timeLabel = "ночью";
    }

    return {
      date: date || null,
      dateKey: date ? dateToKey(date) : "",
      dateLabel: date ? dateToLabel(date) : "",
      timeFrom,
      timeTo,
      timeLabel,
    };
  }

  function seemsLikeClosestFreeSlotIntent(normalized) {
    return includesAny(normalized, [
      "ближайш",
      "любую",
      "самую",
      "первую свобод",
      "любой свобод",
      "на любую дату",
      "на ближайшую дату",
      "выбери слот",
      "подбери слот",
      "подбери свобод",
      "найди слот",
    ]);
  }

  function isSlotConfirmationIntent(normalized) {
    const phrase = includesAny(normalized, [
      "подтверждаю",
      "подтверд",
      "да подтверждаю",
      "ok",
      "ок",
      "подходит",
      "берем",
      "берем этот",
    ]);

    if (phrase) {
      return true;
    }

    // Only treat bare "да" as confirmation when it's a standalone token
    return hasToken(normalized, "да");
  }

  function isResetFlowCommand(normalized) {
    return matchCommand(normalized, "resetFlow");
  }

  function isMarkCompletedCommand(normalized) {
    return (
      matchCommand(normalized, "markCompleted") ||
      includesAny(normalized, [
        "отметь выполнено",
        "услуга выполнена",
        "статус выполнено",
        "поставь выполнено",
        "mark completed",
      ])
    );
  }

  function shouldExplicitWakeForVisit(normalized) {
    if (!isOpenVisitCommand(normalized)) {
      return false;
    }
    return !containsWakeWord(normalized);
  }

  function extractPatientHint(rawText) {
    const normalized = String(rawText || "").trim();
    const match = normalized.match(/для\s+(.+)/i);
    if (!match || !match[1]) {
      return "";
    }
    return match[1].trim();
  }

  function analyzeRequestedSite(target) {
    const currentSite = detectSiteByLocation();
    if (target === "damumed" && currentSite !== "damumed") {
      return null;
    }
    if (target === "sandbox" && currentSite !== "sandbox") {
      return null;
    }
    return analyzeCurrentPage();
  }

  async function applySiteAnalysis(analysis, announce) {
    if (!analysis || analysis.site === "other") {
      if (announce) {
        await speakAndPublish("open_site", "Сейчас открыт другой сайт. Скажите: Джарвиз открой дамумед или Джарвиз открой песочницу.", {
          site: "other",
        }, {
          resume: state.listening,
        });
      }
      return;
    }

    if (analysis.loginRequired) {
      state.stage = STAGE.AWAITING_LOGIN;
      queuePersist();
      renderAll();
      startLoginWatcher();

      if (announce) {
        await speakAndPublish("open_site", "Требуется вход в систему", {
          site: analysis.site,
          loginRequired: true,
        }, {
          resume: state.listening,
        });
      }
      return;
    }

    stopLoginWatcher();
    state.stage = STAGE.COMMAND;
    queuePersist();
    renderAll();

    if (announce) {
      extractSlotsFromPageDom();
      const speech = state.ttsBlocked
        ? "Вход выполнен. Готов к командам."
        : "Вход выполнен. Скажите: Джарвиз начни прием";
      await speakAndPublish("open_site", speech, {
        site: analysis.site,
        loginRequired: false,
      }, { resume: state.listening });
    }
  }

  async function openSiteCommand(target) {
    const targetUrl = target === "damumed" ? state.config.damumedUrl : state.config.sandboxUrl;
    const normalizedUrl = normalizeConfiguredUrl(targetUrl);

    if (!normalizedUrl) {
      await speakAndPublish("open_site", "Адрес сайта не задан. Укажите URL в настройках расширения.", {
        target,
        ok: false,
      }, {
        resume: state.listening,
      });
      return;
    }

    state.stage = STAGE.COMMAND;
    state.pendingSiteCheck = target;
    queuePersist();
    renderAll();

    await speakAndPublish("open_site", "Открываю сайт", {
      target,
      url: normalizedUrl,
    }, { resume: false });

    console.log("[JARVIS navigate]", normalizedUrl);
    // Open in new/existing tab via background so mic on current tab is not killed
    try {
      chrome.runtime.sendMessage({ type: "assistant:navigateTab", url: normalizedUrl });
    } catch (_e) {
      // Fallback: navigate current tab
      window.location.assign(normalizedUrl);
    }
  }

  function clickElementSafe(element) {
    if (!element) {
      return false;
    }

    const action = () => {
      element.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
      element.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      element.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
      if (typeof element.click === "function") {
        element.click();
      }
    };

    try {
      action();
      return true;
    } catch (_error) {
      return false;
    }
  }

  function wait(ms) {
    return new Promise((resolve) => {
      window.setTimeout(resolve, ms);
    });
  }

  function toSelectorQuery(selectors) {
    if (Array.isArray(selectors)) {
      return selectors.join(", ");
    }
    return String(selectors || "");
  }

  function queryAllBySelectors(selectors, root) {
    const scope = root || document;
    const query = toSelectorQuery(selectors);
    if (!query) {
      return [];
    }

    try {
      return [...scope.querySelectorAll(query)];
    } catch (_error) {
      return [];
    }
  }

  function isVisibleNode(node) {
    if (!node) {
      return false;
    }

    const style = window.getComputedStyle(node);
    if (style.display === "none" || style.visibility === "hidden") {
      return false;
    }

    const rect = node.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function getTextFromNode(node) {
    return normalizeText(node?.textContent || "");
  }

  function getRichNodeText(node) {
    if (!node) {
      return "";
    }

    const joined = [
      node.textContent || "",
      node.getAttribute && node.getAttribute("aria-label"),
      node.getAttribute && node.getAttribute("title"),
      node.getAttribute && node.getAttribute("data-testid"),
      node.className || "",
    ]
      .filter(Boolean)
      .join(" ");

    return normalizeText(joined);
  }

  function findVisibleNodeByText(selectors, samples) {
    const nodes = queryAllBySelectors(selectors);
    return nodes.find((node) => {
      if (!isVisibleNode(node)) {
        return false;
      }
      const text = getRichNodeText(node);
      return includesAny(text, samples);
    });
  }

  function findPatientSearchInput() {
    const inputs = queryAllBySelectors(DOM_CONFIG.patient.searchSelectors);
    return (
      inputs.find((input) => {
        if (!isVisibleNode(input)) {
          return false;
        }
        if (!(input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement)) {
          return false;
        }
        return !input.disabled && !input.readOnly;
      }) || null
    );
  }

  function applyInputValue(input, value) {
    if (!input) {
      return;
    }

    const nativeSetter = Object.getOwnPropertyDescriptor(
      Object.getPrototypeOf(input),
      "value"
    )?.set;

    if (nativeSetter) {
      nativeSetter.call(input, value);
    } else {
      input.value = value;
    }

    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: "Enter" }));
    input.blur();
  }

  function fieldContextText(input) {
    if (!input) {
      return "";
    }

    const labelFromAria = input.getAttribute("aria-label") || "";
    const placeholder = input.getAttribute("placeholder") || "";
    const name = input.getAttribute("name") || "";
    const id = input.id || "";

    let labelText = "";
    if (id) {
      const forLabel = document.querySelector(`label[for='${id}']`);
      labelText = forLabel ? forLabel.textContent || "" : "";
    }

    if (!labelText) {
      const parentLabel = input.closest("label");
      if (parentLabel) {
        labelText = parentLabel.textContent || "";
      }
    }

    return normalizeText(`${labelFromAria} ${placeholder} ${name} ${id} ${labelText}`);
  }

  function findActionButtonInside(container, selectors, keywords) {
    const actionCandidates = queryAllBySelectors(selectors, container);
    const found = actionCandidates.find((node) => {
      if (!isVisibleNode(node)) {
        return false;
      }

      const text = getRichNodeText(node);
      return includesAny(text, keywords);
    });

    return found || null;
  }

  function openAcceptOrStartVisitButton() {
    const candidate =
      findVisibleNodeByText(
      DOM_CONFIG.visit.startButtonSelectors,
      DOM_CONFIG.visit.startButtonKeywords
      ) ||
      findVisibleNodeByText(DOM_CONFIG.interactiveSelectors, DOM_CONFIG.visit.startButtonKeywords);

    if (candidate) {
      return clickElementSafe(candidate);
    }

    return false;
  }

  function locatePatientCards() {
    const cards = queryAllBySelectors(DOM_CONFIG.patient.cardSelectors);
    const seen = new Set();

    return cards
      .filter((card) => {
        if (!isVisibleNode(card)) {
          return false;
        }

        const key = `${card.tagName}-${card.className}-${card.textContent?.slice(0, 120) || ""}`;
        if (seen.has(key)) {
          return false;
        }
        seen.add(key);

        const text = getRichNodeText(card);
        return text.length > 6 && includesAny(text, DOM_CONFIG.patient.cardTextHints);
      })
      .slice(0, 300);
  }

  function findPatientCardByHint(hint) {
    const normalizedHint = normalizeText(hint);
    if (!normalizedHint) {
      return null;
    }

    const cards = locatePatientCards();
    return cards.find((card) => getTextFromNode(card).includes(normalizedHint)) || null;
  }

  function extractPatientNameFromDom() {
    const cards = locatePatientCards();
    const prioritized = cards.slice(0, 3);

    for (const card of prioritized) {
      const text = (card && card.textContent) ? String(card.textContent) : "";
      if (!text) {
        continue;
      }

      const lines = text
        .split(/\n+/)
        .map((line) => String(line || "").trim())
        .filter(Boolean);

      const fromFioLine = lines.find((line) => /фио|пациент|patient/i.test(line));
      if (fromFioLine) {
        const cleaned = fromFioLine
          .replace(/фио\s*[:\-]?/i, "")
          .replace(/пациент\s*[:\-]?/i, "")
          .replace(/patient\s*[:\-]?/i, "")
          .trim();
        if (cleaned.length >= 5) {
          return cleaned;
        }
      }

      const capsCandidate = lines.find((line) => {
        const normalized = normalizeText(line);
        const words = normalized.split(" ").filter(Boolean);
        return words.length >= 2 && words.length <= 5 && line.length >= 8;
      });
      if (capsCandidate) {
        return capsCandidate.trim();
      }
    }

    return "";
  }

function parseDateFromText(normalizedText) {
    const clean = ` ${normalizedText} `;
    const cleanFixed = clean
      .replace(/воскр\S*/g, "воскресенье")
      .replace(/вс\b/g, "воскресенье")
      .replace(/пон\S*/g, "понедельник")
      .replace(/вт\b/g, "вторник")
      .replace(/ср\b/g, "среда")
      .replace(/чт\b/g, "четверг")
      .replace(/пт\b/g, "пятница")
      .replace(/сб\b/g, "суббота");
    const now = new Date();

    const isoMatch = cleanFixed.match(/(20\d{2})[\-\.\/](\d{1,2})[\-\.\/](\d{1,2})/);
    if (isoMatch) {
      const year = Number(isoMatch[1]);
      const month = Number(isoMatch[2]) - 1;
      const day = Number(isoMatch[3]);
      const date = new Date(year, month, day, 0, 0, 0, 0);
      if (!Number.isNaN(date.getTime())) {
        return date;
      }
    }

    const dmMatch = cleanFixed.match(/(\d{1,2})[\.\/-](\d{1,2})(?:[\.\/-](\d{2,4}))?/);
    if (dmMatch) {
      const day = Number(dmMatch[1]);
      const month = Number(dmMatch[2]) - 1;
      const yearRaw = dmMatch[3] ? Number(dmMatch[3]) : now.getFullYear();
      const year = yearRaw < 100 ? 2000 + yearRaw : yearRaw;
      const date = new Date(year, month, day, 0, 0, 0, 0);
      if (!Number.isNaN(date.getTime())) {
        return date;
      }
    }

    const dayNumberMatch = cleanFixed.match(/(?:на|в|к)?\s*(\d{1,2})\s+([а-я]+)/i);
    if (dayNumberMatch) {
      const day = Number(dayNumberMatch[1]);
      const monthWord = normalizeText(dayNumberMatch[2]);
      const monthIndex = MONTH_WORDS.findIndex((item) => monthWord.includes(item));
      if (monthIndex >= 0) {
        const year = now.getFullYear();
        let date = new Date(year, monthIndex, day, 0, 0, 0, 0);
        if (date < now) {
          date = new Date(year + 1, monthIndex, day, 0, 0, 0, 0);
        }
        if (!Number.isNaN(date.getTime())) {
          return date;
        }
      }
    }

    if (cleanFixed.includes("сегодня")) {
      return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    }

    if (cleanFixed.includes("завтра")) {
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(0, 0, 0, 0);
      return tomorrow;
    }

    const weekdayIndex = WEEKDAY_WORDS.findIndex((item) => cleanFixed.includes(item));
    if (weekdayIndex >= 0) {
      const weekdayTargets = [1, 2, 3, 4, 5, 6, 0];
      const target = weekdayTargets[weekdayIndex];
      const current = now.getDay();
      let diff = target - current;
      if (diff <= 0) {
        diff += 7;
      }
      const date = new Date(now);
      date.setDate(date.getDate() + diff);
      date.setHours(0, 0, 0, 0);
      return date;
    }

    const weekendMap = {
      понедельник: 1,
      вторник: 2,
      среда: 3,
      четверг: 4,
      пятница: 5,
      суббота: 6,
      воскресенье: 0,
    };

    const directWeekday = Object.entries(weekendMap).find(([name]) => cleanFixed.includes(name));
    if (directWeekday) {
      const target = directWeekday[1];
      const current = now.getDay();
      let diff = target - current;
      if (diff <= 0) {
        diff += 7;
      }
      const date = new Date(now);
      date.setDate(date.getDate() + diff);
      date.setHours(0, 0, 0, 0);
      return date;
    }

    return null;
  }

  function parseRelativeDateFromText(normalizedText) {
    const clean = ` ${normalizedText} `;
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    if (clean.includes("послезавтра")) {
      const date = new Date(now);
      date.setDate(date.getDate() + 2);
      return date;
    }

    return null;
  }

  function parseDateFromAttributes(node) {
    if (!node) {
      return null;
    }

    const attrs = [
      node.getAttribute("data-date"),
      node.getAttribute("datetime"),
      node.getAttribute("value"),
      node.getAttribute("title"),
      node.getAttribute("aria-label"),
    ]
      .filter(Boolean)
      .join(" ");

    if (!attrs) {
      return null;
    }

    return parseDateFromText(normalizeText(attrs));
  }

  function parseTimeFromText(normalizedText) {
    const punctNormalized = normalizedText.replace(/[^a-zа-я0-9:\.\s]/gi, " ");
    const fixed = punctNormalized
      .replace(/\bноль\s*ноль\b/g, "00")
      .replace(/\bв\s*десять\b/g, "10")
      .replace(/\bдесять\b/g, "10")
      .replace(/\bдевять\b/g, "9")
      .replace(/\bвосемь\b/g, "8")
      .replace(/\bсемь\b/g, "7")
      .replace(/\bшесть\b/g, "6")
      .replace(/\bпять\b/g, "5")
      .replace(/\bчетыре\b/g, "4")
      .replace(/\bтри\b/g, "3")
      .replace(/\bдва\b/g, "2")
      .replace(/\bодин\b/g, "1")
      .replace(/\bчасов\b/g, "час")
      .replace(/\bчаса\b/g, "час");

    const hhOnlyMorning = fixed.match(/\b(\d{1,2})\s*(утра|утром)\b/);
    if (hhOnlyMorning) {
      const hh = Number(hhOnlyMorning[1]);
      if (hh >= 1 && hh <= 12) {
        return { hour: hh === 12 ? 0 : hh, minute: 0 };
      }
    }

    const hhOnlyDayEvening = fixed.match(/\b(\d{1,2})\s*(дня|днем|днём|вечера|вечером)\b/);
    if (hhOnlyDayEvening) {
      const hh = Number(hhOnlyDayEvening[1]);
      if (hh >= 0 && hh <= 23) {
        return { hour: hh < 8 ? hh + 12 : hh, minute: 0 };
      }
    }

    const hhOnlyNoon = fixed.match(/\b(\d{1,2})\s*(ноч[ьиью]|ночью)\b/);
    if (hhOnlyNoon) {
      const hh = Number(hhOnlyNoon[1]);
      if (hh >= 0 && hh <= 23) {
        return { hour: hh <= 5 ? hh : hh - 12, minute: 0 };
      }
    }

    const hhmm = fixed.match(/(\d{1,2})[:\.](\d{2})/);
    if (hhmm) {
      const hh = Number(hhmm[1]);
      const mm = Number(hhmm[2]);
      if (hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59) {
        return { hour: hh, minute: mm };
      }
    }

    // "9 утра", "десять утра"
    const morningMatch = fixed.match(/(?:в\s+)?(\d{1,2})\s+утра/);
    if (morningMatch) {
      const hh = Number(morningMatch[1]);
      if (hh >= 1 && hh <= 12) return { hour: hh === 12 ? 0 : hh, minute: 0 };
    }

    // "2 дня", "3 дня", "2 вечера"
    const afternoonMatch = fixed.match(/(?:в\s+)?(\d{1,2})\s+(?:дня|вечера)/);
    if (afternoonMatch) {
      const hh = Number(afternoonMatch[1]);
      return { hour: hh < 8 ? hh + 12 : hh, minute: 0 };
    }

    // word number stems (Whisper transcribes these correctly)
    const WORD_HOURS = [
      ["восем", 8], ["девят", 9], ["десят", 10], ["одиннадцат", 11],
      ["двенадцат", 12], ["тринадцат", 13], ["четырнадцат", 14],
      ["пятнадцат", 15], ["шестнадцат", 16], ["семнадцат", 17],
    ];
    for (const [stem, num] of WORD_HOURS) {
      if (fixed.includes(stem)) return { hour: num, minute: 0 };
    }

    const hourOnly = fixed.match(/(?:в|на)?\s*(\d{1,2})\s*(?:час|ч\b)/);
    if (hourOnly) {
      const hh = Number(hourOnly[1]);
      if (hh >= 0 && hh <= 23) {
        return { hour: hh, minute: 0 };
      }
    }

    // bare number in working-hours range as last resort
    const bareNum = fixed.match(/\b(7|8|9|10|11|12|13|14|15|16|17|18)\b/);
    if (bareNum) {
      return { hour: Number(bareNum[1]), minute: 0 };
    }

    return null;
  }

  function parseMinuteModifier(normalizedText) {
    const quarter = normalizedText.match(/(четверт|15\s*мин|15\s*мину)/);
    if (quarter) {
      return 15;
    }

    const half = normalizedText.match(/(пол\s*|половин|30\s*мин|30\s*мину)/);
    if (half) {
      return 30;
    }

    const m45 = normalizedText.match(/(без\s*четверт|45\s*мин|45\s*мину)/);
    if (m45) {
      return 45;
    }

    return 0;
  }

  function inferTimeWithContext(parsedTime, normalizedText) {
    if (!parsedTime) {
      return null;
    }

    let hour = parsedTime.hour;
    let minute = parsedTime.minute;

    if (minute === 0) {
      minute = parseMinuteModifier(normalizedText);
    }

    const hasMorning = /утр|am/.test(normalizedText);
    const hasEvening = /вечер|pm/.test(normalizedText);
    const hasDaytime = /дня|днем|днём/.test(normalizedText);
    const hasNight = /ноч/.test(normalizedText);

    if ((hasEvening || hasDaytime) && hour < 12) {
      hour += 12;
    }
    if (hasMorning && hour === 12) {
      hour = 0;
    }
    if (hasNight && hour >= 6 && hour <= 11) {
      hour = hour - 12;
    }

    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
      return null;
    }

    return { hour, minute };
  }

  function parseTimeFromAttributes(node) {
    if (!node) {
      return null;
    }

    const attrs = [
      node.getAttribute("data-time"),
      node.getAttribute("datetime"),
      node.getAttribute("title"),
      node.getAttribute("aria-label"),
    ]
      .filter(Boolean)
      .join(" ");

    if (!attrs) {
      return null;
    }

    return parseTimeFromText(normalizeText(attrs));
  }

  function findDateNearNode(node) {
    if (!node) {
      return null;
    }

    const probes = [
      node,
      node.closest("tr"),
      node.closest("li"),
      node.closest("[data-date]"),
      node.closest("[data-testid*='schedule-slot']"),
      node.parentElement,
      node.parentElement && node.parentElement.previousElementSibling,
      node.closest("section") && node.closest("section").querySelector("h3"),
      node.closest("article") && node.closest("article").querySelector("h3"),
      node.closest("tbody") && node.closest("tbody").previousElementSibling,
      node.closest("table") && node.closest("table").querySelector("caption"),
      node.closest("table") && node.closest("table").querySelector("thead"),
    ].filter(Boolean);

    for (const probe of probes) {
      const byAttr = parseDateFromAttributes(probe);
      if (byAttr) {
        return byAttr;
      }

      const byText = parseDateFromText(getRichNodeText(probe));
      if (byText) {
        return byText;
      }
    }

    let cursor = node;
    for (let i = 0; i < 7; i += 1) {
      cursor = cursor && cursor.previousElementSibling;
      if (!cursor) {
        break;
      }

      const byAttr = parseDateFromAttributes(cursor);
      if (byAttr) {
        return byAttr;
      }

      const byText = parseDateFromText(getRichNodeText(cursor));
      if (byText) {
        return byText;
      }
    }

    return null;
  }

  function findTimeNearNode(node) {
    if (!node) {
      return null;
    }

    const probes = [
      node,
      node.closest("tr"),
      node.closest("li"),
      node.closest("[data-time]"),
      node.parentElement,
    ].filter(Boolean);

    for (const probe of probes) {
      const byAttr = parseTimeFromAttributes(probe);
      if (byAttr) {
        return byAttr;
      }

      const byText = parseTimeFromText(getRichNodeText(probe));
      if (byText) {
        return byText;
      }
    }

    return null;
  }

  function parseDoctorFromText(normalizedText) {
    for (const doctor of DOCTOR_DICTIONARY) {
      if (includesAny(normalizedText, doctor.keywords)) {
        return doctor.name;
      }
    }
    return null;
  }

  function dateToKey(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
      return "";
    }

    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  function dateToLabel(date) {
    return date.toLocaleDateString("ru-RU", {
      weekday: "short",
      day: "2-digit",
      month: "2-digit",
    });
  }

  function toMinutesFromTime(timeObj) {
    return timeObj.hour * 60 + timeObj.minute;
  }

  function normalizeSlotDoctor(rawDoctor, rawProcedure) {
    const doctor = rawDoctor || rawProcedure || "Неизвестный специалист";
    const normalized = normalizeText(doctor);
    const found = parseDoctorFromText(normalized);
    return found || doctor;
  }

  function getSlotStatusFromNode(node) {
    const text = normalizeText(node.textContent || "");
    const aria = normalizeText(node.getAttribute("aria-label") || "");
    const klass = normalizeText(node.className || "");
    const joined = `${text} ${aria} ${klass}`;

    if (includesAny(joined, DOM_CONFIG.schedule.busyWords)) {
      return "busy";
    }

    if (includesAny(joined, DOM_CONFIG.schedule.freeWords)) {
      return "free";
    }

    if (includesAny(klass, DOM_CONFIG.schedule.busyClassHints)) {
      return "busy";
    }

    if (includesAny(klass, DOM_CONFIG.schedule.freeClassHints)) {
      return "free";
    }

    return "unknown";
  }

  function extractSlotFromNode(node, indexHint) {
    const normalized = getRichNodeText(node);
    const date = parseDateFromAttributes(node) || findDateNearNode(node) || parseDateFromText(normalized);
    const time = parseTimeFromAttributes(node) || findTimeNearNode(node) || parseTimeFromText(normalized);
    const doctorFromNode = queryAllBySelectors(DOM_CONFIG.schedule.doctorSelectors, node)
      .map((el) => normalizeText(el.textContent || ""))
      .filter(Boolean)
      .join(" ");
    const doctor = parseDoctorFromText(`${doctorFromNode} ${normalized}`);
    const status = getSlotStatusFromNode(node);

    if (!date || !time) {
      return null;
    }

    const startMin = toMinutesFromTime(time);
    const duration = 30;
    const endMin = startMin + duration;
    const dateKey = dateToKey(date);
    const slotId = `slot-${dateKey}-${startMin}-${indexHint}`;

    return {
      id: slotId,
      date,
      dateKey,
      dateLabel: dateToLabel(date),
      startMin,
      duration,
      slotLabel: `${minutesToClock(startMin)} - ${minutesToClock(endMin)}`,
      specialist: normalizeSlotDoctor(doctor, null),
      procedure: "Прием",
      status,
      domId: slotId,
    };
  }

  function extractSlotsFromPageDom() {
    domSlotElements.clear();

    const candidates = queryAllBySelectors(DOM_CONFIG.schedule.slotSelectors);

    const result = [];

    candidates.forEach((node, index) => {
      if (!isVisibleNode(node)) {
        return;
      }

      const text = getRichNodeText(node);
      if (text.length < 6) {
        return;
      }

      if (!parseTimeFromText(text)) {
        return;
      }

      const slot = extractSlotFromNode(node, index);
      if (!slot) {
        return;
      }

      result.push(slot);
      domSlotElements.set(slot.domId, node);
    });

    const unique = [];
    const seen = new Set();
    result.forEach((slot) => {
      const key = `${slot.dateKey}-${slot.startMin}-${normalizeText(slot.specialist)}`;
      if (seen.has(key)) {
        return;
      }
      seen.add(key);
      unique.push(slot);
    });

    return unique;
  }

  function toNodeStats() {
    const cards = locatePatientCards();
    const slots = extractSlotsFromPageDom();
    const free = slots.filter((slot) => slot.status === "free").length;
    const busy = slots.filter((slot) => slot.status === "busy").length;

    return {
      patientCards: cards.length,
      totalSlots: slots.length,
      freeSlots: free,
      busySlots: busy,
    };
  }

  function ensureRuntimeSlots() {
    const fromDom = extractSlotsFromPageDom();
    if (fromDom.length) {
      state.runtimeSlots = fromDom;
      queuePersist();
      return;
    }

    if (state.scheduleGrid.length) {
      state.runtimeSlots = state.scheduleGrid.map((item, idx) => {
        const parts = item.slotLabel.match(/(\d{2}):(\d{2})/);
        const startMin = parts ? Number(parts[1]) * 60 + Number(parts[2]) : 9 * 60 + idx * 30;
        return {
          id: `fallback-${item.dateKey || idx}-${startMin}`,
          date: item.dateKey ? new Date(`${item.dateKey}T00:00:00`) : new Date(),
          dateKey: item.dateKey || new Date().toISOString().slice(0, 10),
          dateLabel: item.dateLabel || dateToLabel(new Date()),
          startMin,
          duration: item.duration || 30,
          slotLabel: item.slotLabel || `${minutesToClock(startMin)} - ${minutesToClock(startMin + (item.duration || 30))}`,
          specialist: item.specialist || "Специалист",
          procedure: item.procedure || "Прием",
          status: item.status === "ok" ? "free" : "busy",
          domId: "",
        };
      });
    }
  }

  function summarizeAvailability() {
    ensureRuntimeSlots();
    if (!state.runtimeSlots.length) {
      return {
        hasData: false,
        freeCount: 0,
        busyCount: 0,
      };
    }

    let freeCount = 0;
    let busyCount = 0;

    state.runtimeSlots.forEach((slot) => {
      if (slot.status === "free") {
        freeCount += 1;
      } else if (slot.status === "busy") {
        busyCount += 1;
      }
    });

    return {
      hasData: true,
      freeCount,
      busyCount,
    };
  }

  function parseRequestedSlot(normalizedText) {
    const directDate = parseDateFromText(normalizedText);
    const relativeDate = parseRelativeDateFromText(normalizedText);
    const date = directDate || relativeDate;

    const directTime = parseTimeFromText(normalizedText);
    const time = inferTimeWithContext(directTime, normalizedText);
    const specialist = parseDoctorFromText(normalizedText);

    if (!date || !time) {
      return null;
    }

    return {
      date,
      dateKey: dateToKey(date),
      dateLabel: dateToLabel(date),
      startMin: toMinutesFromTime(time),
      specialist,
    };
  }

  function parseRequestedSlotParts(normalizedText) {
    const directDate = parseDateFromText(normalizedText);
    const relativeDate = parseRelativeDateFromText(normalizedText);
    const date = directDate || relativeDate;

    const directTime = parseTimeFromText(normalizedText);
    const time = inferTimeWithContext(directTime, normalizedText);

    const specialist = parseDoctorFromText(normalizedText);

    return {
      date: date || null,
      dateKey: date ? dateToKey(date) : "",
      dateLabel: date ? dateToLabel(date) : "",
      startMin: time ? toMinutesFromTime(time) : null,
      specialist: specialist || "",
    };
  }

  function hasSlotRequestData(normalizedText) {
    const parts = parseRequestedSlotParts(normalizedText);
    return Boolean(parts.date || typeof parts.startMin === "number" || parts.specialist);
  }

  function isCompleteSlotRequest(request) {
    return Boolean(request && request.date && typeof request.startMin === "number");
  }

  function mergeSlotRequest(baseRequest, extraRequest) {
    if (!baseRequest && !extraRequest) {
      return null;
    }
    if (!baseRequest) {
      return extraRequest;
    }
    if (!extraRequest) {
      return baseRequest;
    }

    const date = extraRequest.date || baseRequest.date;
    const dateKey = extraRequest.dateKey || baseRequest.dateKey;
    const dateLabel = extraRequest.dateLabel || baseRequest.dateLabel;
    const startMin = typeof extraRequest.startMin === "number"
      ? extraRequest.startMin
      : (typeof baseRequest.startMin === "number" ? baseRequest.startMin : null);
    const specialist = extraRequest.specialist || baseRequest.specialist || "";

    return {
      date,
      dateKey,
      dateLabel,
      startMin,
      specialist,
    };
  }

  function getClosestCandidateSlot(request) {
    ensureRuntimeSlots();
    if (!state.runtimeSlots.length) {
      return null;
    }

    const wantedSpecialist = request.specialist ? normalizeText(request.specialist) : "";

    let candidates = state.runtimeSlots.filter((slot) => {
      if (slot.dateKey !== request.dateKey) {
        return false;
      }
      if (wantedSpecialist) {
        return normalizeText(slot.specialist) === wantedSpecialist;
      }
      return true;
    });

    if (!candidates.length) {
      candidates = state.runtimeSlots.filter((slot) => slot.dateKey === request.dateKey);
    }

    if (!candidates.length) {
      return null;
    }

    return candidates.reduce((best, current) => {
      if (!best) {
        return current;
      }
      const bestDiff = Math.abs(best.startMin - request.startMin);
      const currentDiff = Math.abs(current.startMin - request.startMin);
      return currentDiff < bestDiff ? current : best;
    }, null);
  }

  function findAlternativeFreeSlot(baseSlot) {
    ensureRuntimeSlots();
    const specialistNorm = normalizeText(baseSlot.specialist || "");
    const sameDoctor = state.runtimeSlots.filter(
      (slot) => normalizeText(slot.specialist) === specialistNorm && slot.status === "free"
    );

    if (sameDoctor.length) {
      return sameDoctor[0];
    }

    return state.runtimeSlots.find((slot) => slot.status === "free") || null;
  }

  function findAnyFreeSlot(preference) {
    ensureRuntimeSlots();

    const pref = preference && typeof preference === "object" ? preference : null;

    let free = state.runtimeSlots
      .filter((slot) => slot.status === "free")
      .filter((slot) => {
        if (!pref) {
          return true;
        }

        if (pref.dateKey && slot.dateKey !== pref.dateKey) {
          return false;
        }

        if (typeof pref.timeFrom === "number" && slot.startMin < pref.timeFrom) {
          return false;
        }

        if (typeof pref.timeTo === "number" && slot.startMin >= pref.timeTo) {
          return false;
        }

        return true;
      })
      .sort((a, b) => {
        if (a.dateKey === b.dateKey) {
          return a.startMin - b.startMin;
        }
        return a.dateKey < b.dateKey ? -1 : 1;
      });

    if (!free.length && pref && pref.dateKey) {
      free = state.runtimeSlots
        .filter((slot) => slot.status === "free")
        .filter((slot) => slot.dateKey === pref.dateKey)
        .sort((a, b) => a.startMin - b.startMin);
    }

    if (!free.length && pref && (typeof pref.timeFrom === "number" || typeof pref.timeTo === "number")) {
      free = state.runtimeSlots
        .filter((slot) => slot.status === "free")
        .filter((slot) => {
          if (typeof pref.timeFrom === "number" && slot.startMin < pref.timeFrom) {
            return false;
          }
          if (typeof pref.timeTo === "number" && slot.startMin >= pref.timeTo) {
            return false;
          }
          return true;
        })
        .sort((a, b) => {
          if (a.dateKey === b.dateKey) {
            return a.startMin - b.startMin;
          }
          return a.dateKey < b.dateKey ? -1 : 1;
        });
    }

    return free.length ? free[0] : null;
  }

  async function findAnyFreeSlotViaApi(preference) {
    const sandboxUrl = state.config.sandboxUrl || DEFAULTS.sandboxUrl;
    const sandboxApiBase = toApiBaseUrl(sandboxUrl) || toApiBaseUrl(DEFAULTS.sandboxUrl);
    if (!sandboxApiBase) {
      return null;
    }

    const pref = preference && typeof preference === "object" ? preference : null;
    const baseDate = pref && pref.date ? new Date(pref.date) : new Date();
    baseDate.setHours(0, 0, 0, 0);

    const horizonDays = 21;
    for (let i = 0; i < horizonDays; i += 1) {
      const day = new Date(baseDate);
      day.setDate(baseDate.getDate() + i);
      const dateKey = dateToKey(day);

      if (pref && pref.dateKey && dateKey !== pref.dateKey) {
        continue;
      }

      try {
        const response = await fetch(`${sandboxApiBase}/api/slots/day?date=${encodeURIComponent(dateKey)}`);
        if (!response.ok) {
          continue;
        }

        const data = await response.json();
        const slots = Array.isArray(data && data.slots) ? data.slots : [];
        const freeSlot = slots
          .filter((item) => item && item.status === "free" && item.time)
          .map((item) => {
            const parts = String(item.time).match(/(\d{1,2}):(\d{2})/);
            if (!parts) {
              return null;
            }
            const startMin = Number(parts[1]) * 60 + Number(parts[2]);
            return {
              date: day,
              dateKey,
              dateLabel: dateToLabel(day),
              startMin,
              slotLabel: `${String(item.time)} - ${minutesToClock(startMin + 30)}`,
              specialist: item.specialist || "Специалист",
              procedure: item.type || "Прием",
              status: "free",
              domId: "",
              id: `api-free-${dateKey}-${startMin}`,
            };
          })
          .filter(Boolean)
          .filter((slot) => {
            if (!pref) {
              return true;
            }
            if (typeof pref.timeFrom === "number" && slot.startMin < pref.timeFrom) {
              return false;
            }
            if (typeof pref.timeTo === "number" && slot.startMin >= pref.timeTo) {
              return false;
            }
            return true;
          })
          .sort((a, b) => a.startMin - b.startMin)[0];

        if (freeSlot) {
          return freeSlot;
        }
      } catch (_error) {
        continue;
      }
    }

    return null;
  }

  async function placeSlotToDom(slot) {
    if (!slot.domId) {
      return false;
    }

    const node = domSlotElements.get(slot.domId);
    if (!node) {
      return false;
    }

    const clicked = clickElementSafe(node);
    if (!clicked) {
      return false;
    }

    const confirmButton =
      findVisibleNodeByText(DOM_CONFIG.schedule.confirmSelectors, DOM_CONFIG.schedule.confirmKeywords) ||
      findVisibleNodeByText(DOM_CONFIG.interactiveSelectors, DOM_CONFIG.schedule.confirmKeywords);

    if (confirmButton) {
      clickElementSafe(confirmButton);
    }

    const nodeClass = String(node.className || "");
    node.className = `${nodeClass} jarvis-slot-success`;
    node.setAttribute("data-jarvis-booked", "true");

    const statusBadge =
      node.querySelector(".schedule-status") ||
      node.querySelector("[data-testid*='status']") ||
      node.querySelector("[aria-label*='свобод']");
    if (statusBadge) {
      statusBadge.textContent = "Занято";
      statusBadge.className = `${statusBadge.className || ""} busy booked reserved jarvis-slot-success`;
      statusBadge.setAttribute("aria-label", "занято booked");
    }

    return true;
  }

  function findFieldBySelectors(selectors) {
    const nodes = queryAllBySelectors(selectors);
    return (
      nodes.find((node) => {
        if (!isVisibleNode(node)) {
          return false;
        }
        return node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement;
      }) || null
    );
  }

  // Returns the first visible matching node (for tab buttons, links, etc.).
  function findFirstVisible(selectors) {
    const nodes = queryAllBySelectors(selectors);
    return nodes.find((node) => isVisibleNode(node)) || null;
  }

  // Sandbox-aware verification: clicks each tab and re-reads the (single) shared
  // textarea, because reading all 6 selectors at once would only see whichever
  // tab is currently active.
  async function verifyVisitDraftAfterInject(entries, sharedSelectors) {
    const tabConfig = (DOM_CONFIG.visit && DOM_CONFIG.visit.tabSelectors) || {};
    const checks = [];

    for (const entry of entries) {
      const expected = String(entry.value || "");
      let actual = "";

      // Try field-specific selectors first (works for real Damumed where 6 fields exist).
      let field = findFieldBySelectors(entry.selectors);

      // If we have tab selectors, click the tab so the sandbox swaps its textarea.
      if (!field || (sharedSelectors && sharedSelectors.length)) {
        const tabBtn = (tabConfig[entry.key] || []).length
          ? findFirstVisible(tabConfig[entry.key])
          : null;
        if (tabBtn) {
          clickElementSafe(tabBtn);
          await wait(60);
        }
        field =
          findFieldBySelectors(entry.selectors) ||
          (sharedSelectors && sharedSelectors.length ? findFieldBySelectors(sharedSelectors) : null) ||
          field;
      }

      if (field) {
        actual = String(field.value || "");
      }

      checks.push({
        key: entry.key,
        ok: Boolean(field) && valueMatchesExpected(actual, expected),
      });
    }

    const okCount = checks.filter((item) => item.ok).length;
    const missing = checks.filter((item) => !item.ok).map((item) => item.key);
    return { okCount, total: checks.length, missing };
  }

  function findFieldBySemanticHints(hints) {
    const needles = (Array.isArray(hints) ? hints : [])
      .map((item) => normalizeText(item))
      .filter(Boolean);
    if (!needles.length) {
      return null;
    }

    const allInputs = [
      ...queryAllBySelectors("textarea"),
      ...queryAllBySelectors("input[type='text']"),
      ...queryAllBySelectors("[contenteditable='true']"),
    ].filter((node) => isVisibleNode(node));

    for (const input of allInputs) {
      if (!(input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement || input.isContentEditable)) {
        continue;
      }

      const context = fieldContextText(input);
      if (needles.some((needle) => context.includes(needle))) {
        return input;
      }
    }

    return null;
  }

  function valueMatchesExpected(actual, expected) {
    const a = normalizeText(String(actual || ""));
    const e = normalizeText(String(expected || ""));
    if (!e) {
      return a.length === 0;
    }

    if (a === e) {
      return true;
    }

    if (a.includes(e) || e.includes(a)) {
      return true;
    }

    const minLength = Math.max(10, Math.floor(e.length * 0.45));
    return a.length >= minLength;
  }

  function verifyVisitDraftInDom(entries) {
    const checks = entries.map((entry) => {
      const field = findFieldBySelectors(entry.selectors);
      const actual = field ? String(field.value || "") : "";
      const expected = String(entry.value || "");

      return {
        key: entry.key,
        ok: Boolean(field) && valueMatchesExpected(actual, expected),
      };
    });

    const okCount = checks.filter((item) => item.ok).length;
    const missing = checks.filter((item) => !item.ok).map((item) => item.key);

    return {
      okCount,
      total: checks.length,
      missing,
    };
  }

  function summarizeVisitVerification(check) {
    if (!check || check.total === 0) {
      return "Поля осмотра не найдены в DOM.";
    }

    if (check.okCount === check.total) {
      return `Проверка полей успешна: ${check.okCount} из ${check.total} разделов записаны.`;
    }

    const missingNames = check.missing
      .map((key) => VISIT_FIELD_TITLES[key] || key)
      .join(", ");

    return `Частичная запись: ${check.okCount} из ${check.total}. Нужна ручная проверка: ${missingNames}.`;
  }

  function strictVisitVerified(check) {
    if (!check) {
      return false;
    }
    return check.total > 0 && check.okCount === check.total;
  }

  function hasStrictVisitLock() {
    return Boolean(state.strictVisitPending && state.visitDraft);
  }

  function deriveSlotStatusFromNode(node) {
    if (!node) {
      return "unknown";
    }

    const rowText = getRichNodeText(node);
    if (includesAny(rowText, DOM_CONFIG.schedule.busyWords)) {
      return "busy";
    }
    if (includesAny(rowText, DOM_CONFIG.schedule.freeWords)) {
      return "free";
    }

    const statusBadge =
      node.querySelector(".schedule-status") ||
      node.querySelector("[data-testid*='status']") ||
      node.querySelector("[aria-label*='занято']") ||
      node.querySelector("[aria-label*='свобод']");

    if (!statusBadge) {
      return "unknown";
    }

    const statusText = getRichNodeText(statusBadge);
    if (includesAny(statusText, DOM_CONFIG.schedule.busyWords)) {
      return "busy";
    }
    if (includesAny(statusText, DOM_CONFIG.schedule.freeWords)) {
      return "free";
    }

    return "unknown";
  }

  async function verifySlotBookingInDom(slot) {
    if (!slot) {
      return { ok: false, status: "unknown" };
    }

    await wait(260);

    const node = slot.domId ? domSlotElements.get(slot.domId) : null;
    const status = deriveSlotStatusFromNode(node);
    const bookedAttr = node ? node.getAttribute("data-jarvis-booked") === "true" : false;

    return {
      ok: status === "busy" || bookedAttr,
      status,
      bookedAttr,
    };
  }

  // ═══════════════════════════════════════════════════════════════
  //  MULTI-STEP RPA EXECUTOR
  //  Receives a plan from /api/jarvis/plan-steps and executes each
  //  step on the live sandbox DOM with a visual progress overlay.
  // ═══════════════════════════════════════════════════════════════

  const STEP_OVERLAY_ID = "jarvis-step-overlay";

  function showStepOverlay(label, current, total) {
    let el = document.getElementById(STEP_OVERLAY_ID);
    if (!el) {
      el = document.createElement("div");
      el.id = STEP_OVERLAY_ID;
      Object.assign(el.style, {
        position: "fixed",
        bottom: "72px",
        right: "16px",
        zIndex: "2147483647",
        background: "rgba(10, 50, 100, 0.94)",
        color: "#e8f0ff",
        fontFamily: "system-ui, sans-serif",
        fontSize: "13px",
        lineHeight: "1.5",
        padding: "10px 14px",
        borderRadius: "10px",
        boxShadow: "0 4px 24px rgba(0,0,0,.4)",
        maxWidth: "300px",
        pointerEvents: "none",
        transition: "opacity 0.2s",
      });
      (document.body || document.documentElement).appendChild(el);
    }
    const progress = total > 1 ? `<span style="opacity:.6;font-size:11px"> (${current}/${total})</span>` : "";
    el.innerHTML = `<span style="margin-right:6px">⚙️</span><strong>Джарвис:</strong> ${label}${progress}`;
    el.style.opacity = "1";
  }

  function hideStepOverlay(delay = 1800) {
    const el = document.getElementById(STEP_OVERLAY_ID);
    if (!el) return;
    setTimeout(() => {
      el.style.opacity = "0";
      setTimeout(() => el.remove(), 250);
    }, delay);
  }

  function markStepOverlayDone(summaryLabel) {
    const el = document.getElementById(STEP_OVERLAY_ID);
    if (el) {
      el.style.background = "rgba(10,100,40,0.94)";
      el.innerHTML = `<span style="margin-right:6px">✅</span><strong>Готово:</strong> ${summaryLabel}`;
    }
    hideStepOverlay(2200);
  }

  /** Detect if the current tab is the sandbox (or damumed). */
  function isSandboxPage() {
    const href = window.location.href;
    return /localhost|127\.0\.0\.1|sandbox/i.test(href) || /damumed/i.test(href);
  }

  /** Navigate the sandbox SPA to a named screen by clicking the nav button. */
  async function stepNavigate(screen) {
    const btn = document.querySelector(`.nav-btn[data-screen="${screen}"]`);
    if (!btn) {
      console.warn("[JARVIS step] nav button not found for screen:", screen);
      return false;
    }
    btn.click();
    await wait(350); // Let the SPA render the new screen
    return true;
  }

  /** Open a patient by clicking their card or using the search input. */
  async function stepOpenPatient(query, patientIndex) {
    // Try direct card click first (by index or data-id)
    const cards = Array.from(document.querySelectorAll(".patient-card"));
    if (cards.length > 0) {
      let target = null;
      if (typeof patientIndex === "number" && cards[patientIndex]) {
        target = cards[patientIndex];
      } else if (query) {
        // Try matching by data-id or name
        target = cards.find((c) =>
          (c.dataset.id || "").toLowerCase().includes(query.toLowerCase()) ||
          c.textContent.toLowerCase().includes(query.toLowerCase())
        ) || cards[0];
      } else {
        target = cards[0];
      }
      if (target) {
        target.click();
        await wait(600);
        return true;
      }
    }

    // Fallback: use the search input + open button
    const input = document.getElementById("patientQuery");
    const btn = document.getElementById("openReceptionBtn");
    if (input && btn && query) {
      applyInputValue(input, query);
      await wait(80);
      btn.click();
      await wait(800);
      return true;
    }

    console.warn("[JARVIS step] could not open patient:", query);
    return false;
  }

  /** Fill schedule input fields and optionally trigger generation. */
  async function stepFillSchedule(step) {
    const setVal = (id, val) => {
      const el = document.getElementById(id);
      if (!el || val == null) return;
      applyInputValue(el, String(val));
      // Mark as user-edited so profile defaults don't override
      el.dataset.userEdited = "1";
    };
    if (step.lfk != null) setVal("lfkCount", step.lfk);
    if (step.massage != null) setVal("massageCount", step.massage);
    if (step.psychologist != null) setVal("psyCount", step.psychologist);
    if (step.working_days != null) setVal("workingDaysTarget", step.working_days);
    if (step.start_date) setVal("startDate", step.start_date);
    if (step.consultation_time) setVal("consultationTime", step.consultation_time);
    if (step.consultation_end_time) setVal("consultationEndTime", step.consultation_end_time);
    if (step.hospitalization_time) setVal("hospitalizationTime", step.hospitalization_time);
    if (step.child_status) {
      const sel = document.getElementById("childStatus");
      if (sel) sel.value = step.child_status;
    }
    await wait(80);
  }

  /** Click the "Generate schedule" button and wait for render. */
  async function stepGenerateSchedule() {
    const btn = document.getElementById("generateScheduleBtn");
    if (!btn) return false;
    btn.click();
    await wait(1200); // schedule generation can take a moment
    return true;
  }

  /** Fill visit record fields via the tab-click strategy. */
  async function stepFillRecordFields(fields) {
    if (!fields || typeof fields !== "object") return;
    // Map sandbox field keys → extension draft keys
    const draft = {
      complaints: fields.complaints || "",
      anamnesis: fields.anamnesis || "",
      objective: fields.objectiveStatus || fields.objective || "",
      diagnosis: fields.diagnosis || "",
      treatment: fields.recommendations || fields.treatment || "",
      diary: fields.diary || "",
    };
    // Navigate to record screen first if needed
    const recordScreen = document.getElementById("screen-record");
    if (recordScreen && !recordScreen.classList.contains("active")) {
      await stepNavigate("record");
    }
    await injectVisitDraftToDom(draft);
  }

  /** Click the "Save record" button. */
  async function stepSaveRecord() {
    const btn = document.getElementById("saveRecordBtn");
    if (btn) { btn.click(); await wait(500); return true; }
    return false;
  }

  /** Complete a procedure row in the diary screen. */
  async function stepCompleteProcedure(procedureId, note) {
    const rows = document.querySelectorAll("[data-assignment-id], .assignment-row");
    const target = procedureId
      ? Array.from(rows).find((r) => (r.dataset.assignmentId || r.dataset.id || "") === procedureId)
      : rows[0];
    if (!target) return false;
    const doneBtn = target.querySelector("button.done-btn, button[data-action='complete'], button");
    if (doneBtn) { doneBtn.click(); await wait(400); }
    if (note) {
      const noteInput = target.querySelector("input, textarea");
      if (noteInput) { applyInputValue(noteInput, note); await wait(80); }
    }
    return true;
  }

  /** Execute a single step and return true on success. */
  async function executeSingleStep(step) {
    const action = step.action;
    switch (action) {
      case "navigate":
        return await stepNavigate(step.screen);
      case "open_patient":
        return await stepOpenPatient(step.query, step.patient_index);
      case "fill_record_fields":
        await stepFillRecordFields(step.fields);
        return true;
      case "save_record":
        return await stepSaveRecord();
      case "fill_schedule":
        await stepFillSchedule(step);
        return true;
      case "generate_schedule":
        return await stepGenerateSchedule();
      case "complete_procedure":
        return await stepCompleteProcedure(step.procedure_id, step.note);
      case "wait":
        await wait(step.ms || 500);
        return true;
      default:
        console.warn("[JARVIS step] unknown action:", action);
        return false;
    }
  }

  /** Derive backend base URL from the configured localAiUrl (strips the path). */
  function getBackendBase() {
    try {
      const raw = state.config.localAiUrl || "http://127.0.0.1:8000/api/jarvis/process-visit";
      const u = new URL(raw);
      return `${u.protocol}//${u.host}`;
    } catch {
      return "http://127.0.0.1:8000";
    }
  }

  /** Fetch a step plan from the backend planner. */
  async function fetchStepPlan(transcript) {
    const currentScreen = (() => {
      const active = document.querySelector(".nav-btn.active");
      return active ? (active.dataset.screen || "") : "";
    })();
    const patientOpened = (() => {
      const el = document.getElementById("currentPatient");
      return el ? el.textContent.trim().slice(0, 80) : "";
    })();

    try {
      const resp = await fetch(`${getBackendBase()}/api/jarvis/plan-steps`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript, current_screen: currentScreen, patient_opened: patientOpened }),
      });
      if (!resp.ok) return null;
      return await resp.json(); // {steps: [...], summary: "..."}
    } catch (err) {
      console.warn("[JARVIS plan-steps] fetch failed:", err);
      return null;
    }
  }

  /** Detect if a command looks like a multi-step / navigation command. */
  function isMultiStepCommand(normalized) {
    return (
      includesAny(normalized, [
        "открой первого", "открой второго", "открой третьего",
        "открой пациент", "карточку пациент", "карточка первого",
        "перейди к расписани", "перейди в расписани",
        "поставь лфк", "поставь массаж", "поставь психолог",
        "лфк ", "массаж ", "психолог ",
        "сформируй расписани", "создай расписани", "запланируй расписани",
        "заполни жалобы", "заполни анамнез", "заполни диагноз",
        "перейди к журналу", "открой журнал", "открой аудит",
        "перейди к дневнику", "открой дневник процедур",
        "сохрани осмотр",
      ])
    );
  }

  /** Main entry point: fetch plan → execute step-by-step with overlay. */
  async function executeMultiStepCommand(rawText) {
    showStepOverlay("Планирую шаги...", 0, 0);
    publishResponse("open_reception", "🔄 Планирование: " + rawText.slice(0, 60), {});

    const plan = await fetchStepPlan(rawText);
    if (!plan || !Array.isArray(plan.steps) || plan.steps.length === 0) {
      hideStepOverlay(400);
      return false; // fall through to normal handling
    }

    const { steps, summary } = plan;
    publishResponse("open_reception", `📋 План (${steps.length} шагов): ${summary}`, { steps });

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const label = step.label || step.action;
      showStepOverlay(label, i + 1, steps.length);
      publishResponse("open_reception", `▶ Шаг ${i + 1}/${steps.length}: ${label}`, { stepIndex: i });

      try {
        const ok = await executeSingleStep(step);
        if (!ok) {
          publishResponse("none", `⚠️ Шаг ${i + 1} не выполнен: ${label}`, {});
        }
      } catch (err) {
        console.error("[JARVIS step executor] step failed:", step, err);
        publishResponse("none", `❌ Ошибка на шаге ${i + 1}: ${label}`, { error: String(err) });
      }

      // Short pause between steps so the user can see each action
      if (i < steps.length - 1) await wait(300);
    }

    markStepOverlayDone(summary);
    await speakAndPublish("open_reception", summary, {}, { resume: true });
    return true;
  }

  async function injectVisitDraftToDom(draft) {
    if (!draft) {
      return { success: false, filled: 0, verification: null };
    }

    // Defensive defaults — DOM_CONFIG can be partially loaded if a page reload races us.
    const visitConfig = (DOM_CONFIG && DOM_CONFIG.visit) || {};
    const fieldSelectorsCfg = visitConfig.fieldSelectors || {};
    const tabConfig = visitConfig.tabSelectors || {};
    const sharedSelectors = visitConfig.sharedFieldSelectors || [];

    const buildEntry = (key, value) => ({
      key,
      value,
      selectors: Array.isArray(fieldSelectorsCfg[key]) ? fieldSelectorsCfg[key] : [],
      tabSelectors: Array.isArray(tabConfig[key]) ? tabConfig[key] : [],
    });

    const allEntries = [
      buildEntry("complaints", draft.complaints),
      buildEntry("anamnesis", draft.anamnesis),
      buildEntry("objective", draft.objective),
      buildEntry("diagnosis", draft.diagnosis),
      buildEntry("treatment", draft.treatment),
      buildEntry("diary", draft.diary),
    ];

    // Skip fields with empty/whitespace-only values — no point switching tabs for nothing.
    const entries = allEntries.filter((entry) => String(entry.value || "").trim().length > 0);

    if (!entries.length) {
      console.warn("[JARVIS inject] all draft fields empty, nothing to inject");
      return { success: false, filled: 0, verification: { okCount: 0, total: 0, missing: [] } };
    }

    let filled = 0;

    // Sequential (not parallel) because the sandbox uses ONE shared textarea per tab.
    // Clicking the tab swaps which key the textarea represents.
    for (const entry of entries) {
      try {
        // 1. Try to activate the matching tab (no-op on real Damumed if no tab buttons).
        const tabBtn = entry.tabSelectors.length
          ? findFirstVisible(entry.tabSelectors)
          : null;
        if (tabBtn) {
          clickElementSafe(tabBtn);
          // Yield so the host app can swap the textarea's data-testid / mount the new field.
          await wait(80);
        }

        // 2. Find the input: prefer field-specific selectors, then shared (sandbox), then semantic hints.
        const input =
          findFieldBySelectors(entry.selectors) ||
          (sharedSelectors.length ? findFieldBySelectors(sharedSelectors) : null) ||
          findFieldBySemanticHints([entry.key, VISIT_FIELD_TITLES[entry.key] || entry.key]);

        if (!input) {
          console.warn("[JARVIS inject] no input for", entry.key);
          continue;
        }

        const fieldValue = String(entry.value || "");
        if (input.isContentEditable) {
          input.focus();
          input.textContent = fieldValue;
          input.dispatchEvent(new Event("input", { bubbles: true }));
          input.dispatchEvent(new Event("change", { bubbles: true }));
        } else {
          applyInputValue(input, fieldValue);
        }
        input.setAttribute("data-jarvis-filled", entry.key);
        filled += 1;
      } catch (error) {
        console.error("[JARVIS inject] failed for", entry.key, error);
      }
    }

    await wait(140);

    // For sandbox-style verification (single textarea per tab) we re-walk the entries,
    // clicking each tab and reading the shared textarea so the check matches what's stored.
    const verification = await verifyVisitDraftAfterInject(entries, sharedSelectors);

    const saveButton =
      findVisibleNodeByText(DOM_CONFIG.visit.saveSelectors, DOM_CONFIG.visit.saveKeywords) ||
      findVisibleNodeByText(DOM_CONFIG.interactiveSelectors, DOM_CONFIG.visit.saveKeywords);

    if (saveButton) {
      clickElementSafe(saveButton);
    }

    const host = document.body || document.documentElement;
    if (host) {
      const note = document.createElement("div");
      note.id = "jarvis-visit-success-note";
      note.style.position = "fixed";
      note.style.left = "16px";
      note.style.bottom = "16px";
      note.style.zIndex = "2147483647";
      note.style.background = "#0f7a26";
      note.style.color = "#fff";
      note.style.padding = "10px 14px";
      note.style.borderRadius = "12px";
      note.style.fontFamily = "Nunito Sans, sans-serif";
      note.style.fontSize = "12px";
      note.style.fontWeight = "700";
      note.style.boxShadow = "0 14px 28px rgba(7, 58, 21, 0.28)";
      note.textContent = "JARVIS: поля осмотра заполнены и сохранены";

      const prev = document.getElementById("jarvis-visit-success-note");
      if (prev) {
        prev.remove();
      }

      host.appendChild(note);
      window.setTimeout(() => {
        note.remove();
      }, 2600);
    }

    return {
      success: filled > 0,
      filled,
      verification,
    };
  }

  async function tryOpenPatientVisitByDom(patientHint) {
    const normalizedHint = normalizeText(patientHint || "");

    const search = findPatientSearchInput();
    if (search && normalizedHint) {
      search.focus();
      applyInputValue(search, patientHint);
      await wait(600);
    }

    let openedPatient = false;
    if (normalizedHint) {
      const patientCard = findPatientCardByHint(normalizedHint);
      if (patientCard) {
        const actionInsideCard = findActionButtonInside(
          patientCard,
          DOM_CONFIG.patient.openButtonsSelectors,
          DOM_CONFIG.patient.openButtonsKeywords
        );
        if (actionInsideCard) {
          openedPatient = clickElementSafe(actionInsideCard);
        }

        if (!openedPatient) {
          openedPatient = clickElementSafe(patientCard);
        }

        if (openedPatient) {
          await wait(450);
        }
      }
    }

    const visitOpened = openAcceptOrStartVisitButton();
    return visitOpened || openedPatient;
  }

  async function openFirstPatientFromDom() {
    const cards = locatePatientCards();
    if (!cards.length) {
      return false;
    }

    const first = cards[0];
    if (!first) {
      return false;
    }

    const actionInsideCard = findActionButtonInside(
      first,
      DOM_CONFIG.patient.openButtonsSelectors,
      DOM_CONFIG.patient.openButtonsKeywords
    );

    if (actionInsideCard && clickElementSafe(actionInsideCard)) {
      await wait(350);
      return true;
    }

    if (clickElementSafe(first)) {
      await wait(350);
      return true;
    }

    return false;
  }

  async function runLocalAiProcessing(visitLines, patientHint) {
    const endpoint = state.config.localAiUrl;
    if (!endpoint) {
      return null;
    }

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        mode: "cors",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          patient_hint: patientHint,
          transcript_lines: visitLines,
        }),
      });

      if (!response.ok) {
        return null;
      }

      const data = await response.json();
      if (!data || typeof data !== "object") {
        return null;
      }

      const mapped = {
        patient: String(data.patient || patientHint || "").trim(),
        complaints: String(data.complaints || data.jaloby || "").trim(),
        anamnesis: String(data.anamnesis || data.history || "").trim(),
        objective: String(data.objective || data.exam || "").trim(),
        diagnosis: String(data.diagnosis || data.dx || "").trim(),
        treatment: String(data.treatment || data.plan || "").trim(),
        diary: String(data.diary || data.notes || "").trim(),
        createdAt: new Date().toISOString(),
      };

      return mapped;
    } catch (_error) {
      return null;
    }
  }

  async function runLocalAssistantFallback(rawText, stage) {
    const endpoint = state.config.localAiUrl;
    if (!endpoint) {
      return "";
    }

    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 1500);

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        mode: "cors",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          intent: "assistant_fallback",
          stage: String(stage || state.stage || ""),
          raw_text: String(rawText || "").trim(),
          patient_hint: state.patientHint || "",
          transcript_lines: [],
        }),
      });

      if (!response.ok) {
        return "";
      }

      const data = await response.json();
      const candidate = [data && data.treatment, data && data.diary, data && data.objective]
        .map((item) => String(item || "").trim())
        .find(Boolean);
      clearTimeout(timer);
      return candidate || "";
    } catch (_error) {
      clearTimeout(timer);
      return "";
    }
  }

  function buildContextualFallbackSpeech(rawText, stage) {
    const normalized = normalizeText(rawText || "");

    if (stage === STAGE.AWAITING_VISIT_CONFIRMATION) {
      return "Сейчас этап подтверждения. Скажите: Да подтверждаю или Нет.";
    }

    if (stage === STAGE.RECORDING_VISIT) {
      return "Идет запись приема. Когда закончите, скажите: Джарвиз заверши прием.";
    }

    if (stage === STAGE.AWAITING_SLOT_SELECTION) {
      return "Сейчас выбор слота. Скажите: Выбери ближайшую дату или Поставь на день и время.";
    }

    if (stage === STAGE.COMMAND) {
      if (includesAny(normalized, ["начни", "прием", "приём", "новый"])) {
        return "Чтобы начать прием, скажите: Джарвиз начни прием.";
      }
      if (includesAny(normalized, ["распис", "слот", "ближай", "постав"])) {
        return "Скажите: Выбери ближайшую дату или Поставь на день и время.";
      }
      return "Я на связи. Скажите короткую команду: Джарвиз начни прием, Джарвиз стоп, или Выбери ближайшую дату.";
    }

    return "Команда не распознана по сценарию.";
  }

  function hasStructuredVisitDraft(draft) {
    if (!draft || typeof draft !== "object") {
      return false;
    }

    const keys = ["complaints", "anamnesis", "objective", "diagnosis", "treatment", "diary"];
    const filledCount = keys.reduce((acc, key) => {
      return acc + (String(draft[key] || "").trim().length > 0 ? 1 : 0);
    }, 0);

    return filledCount >= 4;
  }

  async function askVisitDraftConfirmation(draft, source) {
    if (!draft) {
      return;
    }

    state.awaitingVoiceConfirm = {
      kind: "visit_draft",
      source,
      createdAt: Date.now(),
    };
    queuePersist();

    const sourceTitle = source === "local_ai" ? "локальной ИИ" : "правилам";
    await speakAndPublish("fill_form", `Черновик сформирован по ${sourceTitle}. Все подтверждаете для внесения?`, {
      draft,
      source,
    }, { resume: true });
  }

  async function beginVisit(rawCommand) {
    if (state.stage !== STAGE.COMMAND) {
      await speakAndPublish("start_recording", "Сначала откройте сайт командой: Джарвиз открой дамумед или Джарвиз открой песочницу", {
        requiredStatus: "READY",
      }, {
        resume: state.listening,
      });
      return;
    }

    const analysis = analyzeCurrentPage();
    if (analysis.site !== "other" && analysis.loginRequired) {
      state.stage = STAGE.AWAITING_LOGIN;
      queuePersist();
      renderAll();
      startLoginWatcher();
      await speakAndPublish("open_site", "Требуется вход в систему", {
        site: analysis.site,
        loginRequired: true,
      }, {
        resume: state.listening,
      });
      return;
    }

    const openedByDom = await tryOpenPatientVisitByDom(extractPatientHint(rawCommand));

    state.stage = STAGE.RECORDING_VISIT;
    state.visitLines = [];
    state.visitDraft = null;
    state.scheduleGrid = [];
    state.runtimeSlots = [];
    state.pendingSuggestedSlot = null;
    state.strictVisitPending = false;
    const spokenHint = extractPatientHint(rawCommand);
    const domPatient = extractPatientNameFromDom();
    state.patientHint = spokenHint || domPatient || "";
    queuePersist();
    renderAll();

    await speakAndPublish("start_recording", "Начинаю запись приема", {
      openedByDom,
      patientHint: state.patientHint,
    }, { resume: true });
  }

  function appendVisitLine(text) {
    const line = String(text || "").trim();
    const normalized = normalizeText(line);
    if (!line || normalized.length < 4) {
      return;
    }

    if (
      normalized === "продолжение следует" ||
      normalized.includes("subtitles") ||
      normalized.includes("субтитры") ||
      normalized.includes("спасибо за просмотр")
    ) {
      return;
    }

    state.visitLines.push(line);
    state.visitLines = trimArray(state.visitLines, 500);
    queuePersist();
  }

  function buildVisitDraft(lines, patientHint) {
    const sections = {
      complaints: [],
      anamnesis: [],
      objective: [],
      diagnosis: [],
      treatment: [],
      diary: [],
    };

    let activeSection = "complaints";

    lines.forEach((line) => {
      const normalized = normalizeText(line);

      if (includesAny(normalized, ["жалоб", "жалоба"])) {
        activeSection = "complaints";
      } else if (includesAny(normalized, ["анамнез", "история", "болеет", "со слов"])) {
        activeSection = "anamnesis";
      } else if (includesAny(normalized, ["объектив", "обьектив", "осмотр", "температур", "давлен"])) {
        activeSection = "objective";
      } else if (includesAny(normalized, ["диагноз", "мкб", "код"])) {
        activeSection = "diagnosis";
      } else if (includesAny(normalized, ["назнач", "рекоменд", "лечение", "препарат", "терапи"])) {
        activeSection = "treatment";
      } else if (includesAny(normalized, ["дневник", "динамик", "состояние сегодня"])) {
        activeSection = "diary";
      }

      sections[activeSection].push(line.trim());
    });

    const fallback = "";
    const join = (array) => (array.length ? array.join(" ") : fallback);

    return {
      patient: patientHint || "Не указан",
      complaints: join(sections.complaints),
      anamnesis: join(sections.anamnesis),
      objective: join(sections.objective),
      diagnosis: join(sections.diagnosis),
      treatment: join(sections.treatment),
      diary: join(sections.diary),
      createdAt: new Date().toISOString(),
    };
  }

  function overlaps(startA, durationA, startB, durationB) {
    const endA = startA + durationA;
    const endB = startB + durationB;
    return startA < endB && startB < endA;
  }

  function minutesToClock(total) {
    const mm = total % 60;
    const hh = Math.floor(total / 60);
    return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
  }

  function nextWorkingDays(count) {
    const days = [];
    const cursor = new Date();

    while (days.length < count) {
      cursor.setDate(cursor.getDate() + 1);
      const day = cursor.getDay();
      if (day === 0 || day === 6) {
        continue;
      }

      days.push({
        key: cursor.toISOString().slice(0, 10),
        dateLabel: cursor.toLocaleDateString("ru-RU", {
          weekday: "short",
          day: "2-digit",
          month: "2-digit",
        }),
      });
    }

    return days;
  }

  function buildBusyGrid(days) {
    const specialists = ["Инструктор ЛФК", "Массажист", "Клинический психолог"];
    const grid = {};

    days.forEach((day, dayIndex) => {
      grid[day.key] = {};

      specialists.forEach((specialist, specialistIndex) => {
        const firstStart = 9 * 60 + ((dayIndex + specialistIndex * 2) % 7) * 30;
        const secondStart = 13 * 60 + ((dayIndex * 2 + specialistIndex) % 8) * 20;

        const firstDuration = specialist === "Клинический психолог" ? 30 : 40;
        const secondDuration = specialist === "Инструктор ЛФК" ? 40 : 30;

        grid[day.key][specialist] = [
          { start: firstStart, duration: firstDuration },
          { start: secondStart, duration: secondDuration },
        ];
      });
    });

    return grid;
  }

  function findFreeStart(busyIntervals, duration) {
    const dayStart = 9 * 60;
    const dayEnd = 18 * 60;

    for (let start = dayStart; start + duration <= dayEnd; start += 10) {
      const blocked = busyIntervals.some((interval) =>
        overlaps(start, duration, interval.start, interval.duration)
      );
      if (!blocked) {
        return start;
      }
    }

    return null;
  }

  function generateSmartSchedule() {
    const basePlan = [
      { procedure: "ЛФК", specialist: "Инструктор ЛФК", duration: 40 },
      { procedure: "Массаж", specialist: "Массажист", duration: 40 },
      { procedure: "Психолог", specialist: "Клинический психолог", duration: 30 },
    ];

    const days = nextWorkingDays(9);
    const busyGrid = buildBusyGrid(days);

    return days.map((day, index) => {
      const plan = basePlan[index % basePlan.length];
      const busy = busyGrid[day.key][plan.specialist];
      const start = findFreeStart(busy, plan.duration);

      if (start === null) {
        return {
          dateKey: day.key,
          dateLabel: day.dateLabel,
          procedure: plan.procedure,
          specialist: plan.specialist,
          duration: plan.duration,
          slotLabel: "Нет свободного окна",
          status: "wait",
        };
      }

      busy.push({
        start,
        duration: plan.duration,
      });

      return {
        dateKey: day.key,
        dateLabel: day.dateLabel,
        procedure: plan.procedure,
        specialist: plan.specialist,
        duration: plan.duration,
        slotLabel: `${minutesToClock(start)} - ${minutesToClock(start + plan.duration)}`,
        status: "ok",
      };
    });
  }

  async function fetchAndApplySandboxSchedule(draft) {
    const sandboxUrl = state.config.sandboxUrl || DEFAULTS.sandboxUrl;
    const sandboxApiBase = toApiBaseUrl(sandboxUrl) || toApiBaseUrl(DEFAULTS.sandboxUrl);
    if (!sandboxApiBase) {
      return null;
    }
    const plan = [];
    const lfkCount = Number(draft && draft.lfk) || 9;
    const massageCount = Number(draft && draft.massage) || 5;
    const psyCount = Number(draft && draft.psychologist) || 3;
    if (lfkCount > 0) plan.push({ type: "lfk", duration: 30, count: lfkCount });
    if (massageCount > 0) plan.push({ type: "massage", duration: 30, count: massageCount });
    if (psyCount > 0) plan.push({ type: "psychologist", duration: 40, count: psyCount });

    // Ensure a patient is selected in sandbox before generating schedule
    const patientQuery = (draft && draft.patient) || state.patientHint || "первого";
    try {
      await fetch(`${sandboxApiBase}/api/reception/open`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: patientQuery }),
      });
    } catch (_e) {
      // Proceed anyway — sandbox may already have a patient open
    }

    try {
      const resp = await fetch(`${sandboxApiBase}/api/schedule/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, startDate: new Date().toISOString().slice(0, 10) }),
      });
      if (!resp.ok) return null;
      const data = await resp.json();
      const assignments = Array.isArray(data.assignments) ? data.assignments : [];
      state.runtimeSlots = assignments.map((asg, idx) => {
        const tp = asg.startTime ? asg.startTime.match(/(\d{1,2}):(\d{2})/) : null;
        const startMin = tp ? Number(tp[1]) * 60 + Number(tp[2]) : 9 * 60 + idx * 30;
        const ep = asg.endTime ? asg.endTime.match(/(\d{1,2}):(\d{2})/) : null;
        const endMin = ep ? Number(ep[1]) * 60 + Number(ep[2]) : startMin + 30;
        const dateKey = asg.date || new Date().toISOString().slice(0, 10);
        const dateObj = new Date(`${dateKey}T00:00:00`);
        return {
          id: asg.id || `api-${idx}`,
          date: dateObj,
          dateKey,
          dateLabel: dateToLabel(dateObj),
          startMin,
          duration: asg.duration || 30,
          slotLabel: `${asg.startTime || minutesToClock(startMin)} - ${asg.endTime || minutesToClock(endMin)}`,
          specialist: asg.specialist || "Специалист",
          procedure: asg.type || "Прием",
          status: normalizeText(String(asg.status || "")).includes("выполн") ? "busy" : "free",
          domId: "",
        };
      });
      state.scheduleGrid = [];
      queuePersist();
      // Navigate to schedule tab in sandbox DOM
      document.querySelectorAll(".nav-btn").forEach((btn) => {
        if (btn.dataset && btn.dataset.screen === "schedule") btn.click();
      });
      return data;
    } catch (_err) {
      console.error("[JARVIS] fetchAndApplySandboxSchedule error:", _err);
      return null;
    }
  }

  async function checkSlotAvailabilityApi(dateKey, timeStr) {
    const sandboxUrl = state.config.sandboxUrl || DEFAULTS.sandboxUrl;
    const sandboxApiBase = toApiBaseUrl(sandboxUrl) || toApiBaseUrl(DEFAULTS.sandboxUrl);
    if (!sandboxApiBase) {
      return null;
    }
    try {
      const resp = await fetch(
        `${sandboxApiBase}/api/slots/check?date=${encodeURIComponent(dateKey)}&time=${encodeURIComponent(timeStr)}`
      );
      if (!resp.ok) return null;
      return await resp.json();
    } catch {
      return null;
    }
  }

  async function fetchAssignmentsApi() {
    const sandboxUrl = state.config.sandboxUrl || DEFAULTS.sandboxUrl;
    const sandboxApiBase = toApiBaseUrl(sandboxUrl) || toApiBaseUrl(DEFAULTS.sandboxUrl);
    if (!sandboxApiBase) {
      return [];
    }

    try {
      const response = await fetch(`${sandboxApiBase}/api/assignments`);
      if (!response.ok) {
        return [];
      }
      const data = await response.json();
      return Array.isArray(data && data.assignments) ? data.assignments : [];
    } catch (_error) {
      return [];
    }
  }

  function assignmentPriority(assignment) {
    const status = normalizeText(assignment && assignment.status ? assignment.status : "");
    if (status.includes("заплан")) {
      return 3;
    }
    if (status.includes("в работе") || status.includes("процесс")) {
      return 2;
    }
    if (status.includes("выполн")) {
      return 0;
    }
    return 1;
  }

  function findLastPendingAssignment(assignments) {
    const list = Array.isArray(assignments) ? assignments.slice() : [];
    if (!list.length) {
      return null;
    }

    const sorted = list.sort((a, b) => {
      const pa = assignmentPriority(a);
      const pb = assignmentPriority(b);
      if (pa !== pb) {
        return pb - pa;
      }

      const da = String(a && a.date ? a.date : "");
      const db = String(b && b.date ? b.date : "");
      if (da !== db) {
        return da > db ? -1 : 1;
      }

      const ta = String(a && a.startTime ? a.startTime : "");
      const tb = String(b && b.startTime ? b.startTime : "");
      return ta > tb ? -1 : ta < tb ? 1 : 0;
    });

    return sorted[0] || null;
  }

  async function completeAssignmentApi(assignmentId, diary) {
    const sandboxUrl = state.config.sandboxUrl || DEFAULTS.sandboxUrl;
    const sandboxApiBase = toApiBaseUrl(sandboxUrl) || toApiBaseUrl(DEFAULTS.sandboxUrl);
    if (!sandboxApiBase) {
      return { ok: false, error: "sandbox_api_not_configured" };
    }

    try {
      const response = await fetch(`${sandboxApiBase}/api/assignments/${encodeURIComponent(assignmentId)}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ diary: String(diary || "").trim() }),
      });
      if (!response.ok) {
        return { ok: false, error: `http_${response.status}` };
      }
      const data = await response.json();
      return { ok: true, data };
    } catch (error) {
      return { ok: false, error: String(error || "complete_assignment_failed") };
    }
  }

  async function markLatestServiceCompleted(diary, source) {
    const assignments = await fetchAssignmentsApi();
    const target = findLastPendingAssignment(assignments);
    if (!target || !target.id) {
      await speakAndPublish("check_schedule", "Нет активных назначений для отметки выполнено.", { source }, {
        resume: true,
      });
      return { ok: false, error: "no_assignment" };
    }

    const result = await completeAssignmentApi(target.id, diary);
    if (!result.ok) {
      await speakAndPublish("check_schedule", "Не удалось поставить статус Выполнено. Проверьте API песочницы.", {
        source,
        error: result.error,
      }, {
        resume: true,
      });
      return { ok: false, error: result.error || "complete_failed" };
    }

    const assignment = result.data && result.data.assignment ? result.data.assignment : null;
    const completedAt = assignment && assignment.completedAt ? assignment.completedAt : "";
    const specialist = assignment && assignment.specialist ? assignment.specialist : "специалиста";
    const timeLabel = assignment && assignment.startTime ? assignment.startTime : "";

    await speakAndPublish("check_schedule", `Отметил Выполнено: ${specialist}${timeLabel ? `, ${timeLabel}` : ""}.`, {
      source,
      assignment,
    }, {
      resume: true,
    });

    return { ok: true, assignment, completedAt };
  }

  async function announceCurrentAvailability() {
    if (!state.patientHint) {
      state.patientHint = extractPatientNameFromDom() || state.patientHint || "";
    }

    if (!state.runtimeSlots.length && !state.scheduleGrid.length) {
      const scheduleData = await fetchAndApplySandboxSchedule(state.visitDraft || {});
      if (!scheduleData) {
        const fromDom = extractSlotsFromPageDom();
        if (fromDom.length) {
          state.runtimeSlots = fromDom;
          state.scheduleGrid = [];
          queuePersist();
        }
      }
    }

    ensureRuntimeSlots();
    renderAll();

    const total = state.runtimeSlots.length + state.scheduleGrid.length;

    if (!total) {
      await speakAndPublish("check_schedule", "Расписание не найдено. Сформируйте расписание вручную.", {
        hasData: false,
      }, { resume: true });
      return;
    }

    state.stage = STAGE.AWAITING_SLOT_SELECTION;
    queuePersist();
    renderAll();

    const busyCount = state.runtimeSlots.filter((s) => s.status === "busy").length;
    const freeCount = state.runtimeSlots.filter((s) => s.status === "free").length;

    if (freeCount === 0 && busyCount > 0) {
      // All slots are pre-assigned (API schedule) — announce count and invite queries
      await speakAndPublish("check_schedule",
        `Расписание сформировано: ${busyCount} назначений. Назовите день и время — проверю доступность.`,
        { totalSlots: busyCount, fromApi: true },
        { resume: true }
      );
    } else {
      await speakAndPublish("check_schedule",
        `Проверил расписание: свободно ${freeCount}, занято ${busyCount}. Назовите команду: Поставь на день и время`,
        { freeCount, busyCount },
        { resume: true }
      );
    }
  }

  async function applyRequestedSlot(normalized) {
    if (state.stage !== STAGE.AWAITING_SLOT_SELECTION) {
      await speakAndPublish("check_schedule", "Сначала завершите этап формирования расписания", {
        requiredStatus: "SCHEDULING",
      }, {
        resume: true,
      });
      return;
    }

    if (isSlotConfirmationIntent(normalized)) {
      if (state.pendingSuggestedSlot) {
        const placedPending = await placeSlotToDom(state.pendingSuggestedSlot);
        if (placedPending) {
          state.pendingSuggestedSlot.status = "busy";
          state.stage = STAGE.IDLE;
          state.pendingSlotRequest = null;
          queuePersist();
          renderAll();
          await speakAndPublish("check_schedule", "Подтверждено. Слот поставлен.", {
            slot: state.pendingSuggestedSlot,
          }, {
            resume: true,
          });
          return;
        }
      }

      await speakAndPublish("check_schedule", "Нет ожидающего слота для подтверждения. Назовите новую команду записи.", {}, {
        resume: true,
      });
      return;
    }

    if (isOpenVisitCommand(normalized)) {
      await beginVisit(normalized);
      return;
    }

    if (isFinishVisitCommand(normalized)) {
      await finishVisit();
      return;
    }

    if (isAnyFreeSlotCommand(normalized)) {
      const preference = parseFreeSlotPreference(normalized);
      let freeSlot = findAnyFreeSlot(preference);
      if (!freeSlot) {
        freeSlot = await findAnyFreeSlotViaApi(preference);
      }
    if (!freeSlot) {
      await speakAndPublish("check_schedule", "Свободных слотов по этому условию не найдено. Назовите день и время вручную.", {
        preference,
        runtimeSlots: state.runtimeSlots.length,
      }, {
        resume: true,
      });
      return;
    }

      const placedAny = await placeSlotToDom(freeSlot);
      if (placedAny) {
        freeSlot.status = "busy";
        state.stage = STAGE.IDLE;
        state.pendingSuggestedSlot = null;
        state.pendingSlotRequest = null;
        queuePersist();
        renderAll();
        await speakAndPublish(
          "check_schedule",
          `Готово. Записал на свободное время ${preference.dateLabel ? `на ${preference.dateLabel}` : ""}${preference.timeLabel ? ` ${preference.timeLabel}` : ""}: ${freeSlot.dateLabel}, ${freeSlot.slotLabel}.`,
          { slot: freeSlot, preference },
          { resume: true }
        );
        return;
      }

      await speakAndPublish(
        "check_schedule",
        `Нашел свободный слот: ${freeSlot.dateLabel}, ${freeSlot.slotLabel}.` +
          (freeSlot.domId ? " Скажите: подтверждаю, чтобы поставить." : " Слот найден по API песочницы."),
        { slot: freeSlot, preference },
        { resume: true }
      );

      if (freeSlot.domId) {
        state.pendingSuggestedSlot = freeSlot;
        queuePersist();
      }
      return;
    }

    if (isYesCommand(normalized) && state.pendingSuggestedSlot) {
      const placedSuggested = await placeSlotToDom(state.pendingSuggestedSlot);
      if (placedSuggested) {
        state.pendingSuggestedSlot.status = "busy";
        const verifySuggested = await verifySlotBookingInDom(state.pendingSuggestedSlot);
        state.stage = STAGE.IDLE;
        state.pendingSuggestedSlot = null;
        queuePersist();
        renderAll();
        if (verifySuggested.ok) {
          await speakAndPublish("check_schedule", "Запись успешно создана", {
            verification: verifySuggested,
          }, {
            resume: true,
          });
        } else {
          await speakAndPublish("check_schedule", "Запрос на запись отправлен, но подтверждение по DOM не получено", {
            verification: verifySuggested,
          }, {
            resume: true,
          });
        }
      } else {
        await speakAndPublish("check_schedule", "Не удалось автоматически поставить слот. Проверьте расписание вручную", {}, {
          resume: true,
        });
      }
      return;
    }

    if (isNoCommand(normalized) && state.pendingSuggestedSlot) {
      state.pendingSuggestedSlot = null;
      queuePersist();
      renderAll();
      await speakAndPublish("check_schedule", "Это время занято. Назовите другое", {}, { resume: true });
      return;
    }

    if (seemsLikeClosestFreeSlotIntent(normalized)) {
      const preference = parseFreeSlotPreference(normalized);
      let freeSlot = findAnyFreeSlot(preference);
      if (!freeSlot) {
        freeSlot = await findAnyFreeSlotViaApi(preference);
      }

      if (!freeSlot) {
        await speakAndPublish("check_schedule", "Ближайший свободный слот не найден. Назовите день и время вручную.", {
          preference,
        }, {
          resume: true,
        });
        return;
      }

      const placedAny = await placeSlotToDom(freeSlot);
      if (placedAny) {
        freeSlot.status = "busy";
        state.stage = STAGE.IDLE;
        state.pendingSuggestedSlot = null;
        state.pendingSlotRequest = null;
        queuePersist();
        renderAll();
        await speakAndPublish(
          "check_schedule",
          `Готово. Выбрал ближайший свободный слот: ${freeSlot.dateLabel}, ${freeSlot.slotLabel}.`,
          { slot: freeSlot, preference },
          { resume: true }
        );
        return;
      }

      await speakAndPublish(
        "check_schedule",
        `Нашел ближайший свободный слот: ${freeSlot.dateLabel}, ${freeSlot.slotLabel}. Скажите: подтверждаю, чтобы поставить.` +
          (freeSlot.domId ? "" : " Если это слот из API песочницы, откройте расписание и подтвердите запись вручную."),
        { slot: freeSlot, preference },
        { resume: true }
      );
      state.pendingSuggestedSlot = freeSlot;
      queuePersist();
      return;
    }

    const parsedRequest = parseRequestedSlotParts(normalized);
    const hasAnySlotHints = hasSlotRequestData(normalized) || isPlaceSlotCommand(normalized);
    const nowTs = Date.now();
    let previousRequest = state.pendingSlotRequest;

    if (previousRequest && nowTs - (Number(previousRequest.ts) || 0) > SLOT_REQUEST_TTL_MS) {
      previousRequest = null;
      state.pendingSlotRequest = null;
    }

    const request = mergeSlotRequest(previousRequest ? previousRequest.request : null, parsedRequest);
    console.log("[JARVIS slot parse]", JSON.stringify({
      normalized,
      parsedRequest,
      previousRequest: previousRequest ? previousRequest.request : null,
      mergedRequest: request,
      isComplete: isCompleteSlotRequest(request),
    }));

    if (!request || !isCompleteSlotRequest(request)) {
      const hasDate = Boolean(request && request.date);
      const hasTime = Boolean(request && typeof request.startMin === "number");

      let prompt = "Не распознал дату и время. Скажите: Поставь на день и время";
      if (hasDate && !hasTime) {
        prompt = "День понял. Теперь скажите время, например: в 10 утра";
      } else if (!hasDate && hasTime) {
        prompt = "Время понял. Теперь скажите день, например: в воскресенье";
      } else if (!hasAnySlotHints) {
        // Random phrase/noise in slot stage — do not spam strict date-time prompt.
        return;
      }

      state.pendingSlotRequest = {
        request: request || { date: null, dateKey: "", dateLabel: "", startMin: null, specialist: "" },
        ts: nowTs,
        source: normalized,
      };
      queuePersist();

      console.log("[JARVIS slot parse partial]", JSON.stringify({
        normalized,
        request,
        hasDate,
        hasTime,
      }));

      await speakAndPublish("check_schedule", prompt, {
        partial: request || null,
        hasDate,
        hasTime,
      }, {
        resume: true,
      });
      return;
    }

    state.pendingSlotRequest = {
      request,
      ts: nowTs,
      source: normalized,
    };
    queuePersist();

    const hh = String(Math.floor(request.startMin / 60)).padStart(2, "0");
    const mm = String(request.startMin % 60).padStart(2, "0");
    const timeStr = `${hh}:${mm}`;

    // Check via sandbox API first
    const apiCheck = await checkSlotAvailabilityApi(request.dateKey, timeStr);

    if (apiCheck !== null) {
      if (!apiCheck.available) {
        if (apiCheck.reason === "busy_other_patient") {
          await speakAndPublish("check_schedule",
            `Время ${timeStr} ${request.dateLabel} занято другим пациентом. Выберите другое время.`,
            { dateKey: request.dateKey, time: timeStr },
            { resume: true }
          );
        } else if (apiCheck.reason === "already_assigned" && apiCheck.assignment) {
          const asg = apiCheck.assignment;
          await speakAndPublish("check_schedule",
            `В это время уже назначен ${asg.specialist}. Расписание сформировано автоматически.`,
            { assignment: asg },
            { resume: true }
          );
        } else {
          await speakAndPublish("check_schedule",
            `Время ${timeStr} ${request.dateLabel} занято. Назовите другое.`,
            { dateKey: request.dateKey, time: timeStr },
            { resume: true }
          );
        }
        return;
      }

      // Slot is free
      state.pendingSlotRequest = null;
      queuePersist();
      await speakAndPublish("check_schedule",
        `Время ${timeStr} ${request.dateLabel} свободно. Расписание уже сформировано автоматически, проверьте вкладку Назначения.`,
        { dateKey: request.dateKey, time: timeStr, available: true },
        { resume: true }
      );
      return;
    }

    // API unavailable — fallback to local runtimeSlots
    const candidate = getClosestCandidateSlot(request);
    if (!candidate) {
      await speakAndPublish("check_schedule", "Это время занято. Назовите другое", {
        dateKey: request.dateKey,
      }, {
        resume: true,
      });
      return;
    }

    if (candidate.status === "busy") {
      await speakAndPublish("check_schedule", "Это время занято. Назовите другое", {}, { resume: true });
      return;
    }

    const placed = await placeSlotToDom(candidate);
    if (placed) {
      candidate.status = "busy";
      const verifyPrimary = await verifySlotBookingInDom(candidate);
      state.stage = STAGE.IDLE;
      state.pendingSuggestedSlot = null;
      state.pendingSlotRequest = null;
      queuePersist();
      renderAll();
      await speakAndPublish("check_schedule",
        verifyPrimary.ok ? "Запись успешно создана" : "Запись отправлена, проверьте расписание",
        { slot: { dateLabel: candidate.dateLabel, slotLabel: candidate.slotLabel, specialist: candidate.specialist } },
        { resume: true }
      );
      return;
    }

    await speakAndPublish("check_schedule", `Время ${timeStr} свободно. Проверьте расписание на сайте.`, {}, { resume: true });
  }

  async function finishVisit() {
    if (state.stage !== STAGE.RECORDING_VISIT) {
      await speakAndPublish("start_recording", "Прием еще не открыт. Скажите: Джарвиз начни прием", {
        requiredStatus: "READY",
      }, {
        resume: state.listening,
      });
      return;
    }

    state.stage = STAGE.PROCESSING_VISIT;
    queuePersist();
    renderAll();

    await speakAndPublish("stop_recording", "Обрабатываю данные приема", {
      transcriptLines: state.visitLines.length,
    }, { resume: false });

    const inferredPatient = state.patientHint || extractPatientNameFromDom() || "";
    if (!state.patientHint && inferredPatient) {
      state.patientHint = inferredPatient;
    }

    let linesForProcessing = state.visitLines.slice();
    if (RECORD_AS_DICTAPHONE) {
      const fullText = await transcribeFullVisitAudio();
      if (fullText) {
        linesForProcessing = [fullText];
      }
    }

    const aiDraft = await runLocalAiProcessing(linesForProcessing, inferredPatient);
    const fallbackDraft = buildVisitDraft(linesForProcessing, inferredPatient);
    const draft = aiDraft || fallbackDraft;

    const hasDraftData = hasStructuredVisitDraft(draft);
    if (!hasDraftData) {
      const autoHint = {
        patient: inferredPatient || "",
        complaints: "",
        anamnesis: "",
        objective: "",
        diagnosis: "",
        treatment: "",
        diary: "",
        manualRequired: true,
        createdAt: new Date().toISOString(),
      };
      state.visitDraft = autoHint;
      state.stage = STAGE.AWAITING_VISIT_CONFIRMATION;
      queuePersist();
      renderAll();
      await speakAndPublish("fill_form", "Черновик пустой. Заполните поля вручную или загрузите шаблон, затем подтвердите.", {
        draft: autoHint,
        source: "fallback_empty",
      }, { resume: true });
      return;
    }

    if (!draft.patient && inferredPatient) {
      draft.patient = inferredPatient;
    }
    state.visitDraft = draft;
    state.stage = STAGE.AWAITING_VISIT_CONFIRMATION;
    queuePersist();
    renderAll();

    if (aiDraft && hasStructuredVisitDraft(aiDraft)) {
      await askVisitDraftConfirmation(draft, "local_ai");
      return;
    }

    await askVisitDraftConfirmation(draft, "rule_fallback");
  }

  async function confirmVisitAndAdvance(verification) {
    state.strictVisitPending = false;
    state.stage = AUTO_SCHEDULE_AFTER_VISIT ? STAGE.AWAITING_SLOT_SELECTION : STAGE.COMMAND;
    queuePersist();
    renderAll();

    if (!AUTO_SCHEDULE_AFTER_VISIT) {
      await speakAndPublish("fill_form", "Данные внесены и подтверждены. Прием завершен. Скажите: Джарвиз проверь расписание, когда будете готовы.", {
        verification,
      }, { resume: true });
      return;
    }

    await speakAndPublish("fill_form", "Данные внесены. Формирую расписание...", { verification }, { resume: false });

    // Ensure sandbox has an opened patient before schedule generation.
    if (!state.patientHint) {
      state.patientHint = extractPatientNameFromDom() || state.patientHint || "";
    }

    const scheduleData = await fetchAndApplySandboxSchedule(state.visitDraft);
    if (!scheduleData) {
      const fromDom = extractSlotsFromPageDom();
      if (fromDom.length) {
        state.runtimeSlots = fromDom;
        state.scheduleGrid = [];
      } else {
        state.scheduleGrid = generateSmartSchedule();
        state.runtimeSlots = [];
      }
      queuePersist();
    }

    renderAll();
    await announceCurrentAvailability();
  }

  async function handleVisitConfirmation(normalized) {
    if (state.awaitingVoiceConfirm && state.awaitingVoiceConfirm.kind === "visit_draft") {
      if (isYesCommand(normalized)) {
        state.awaitingVoiceConfirm = null;
        queuePersist();
      } else if (isNoCommand(normalized)) {
        state.awaitingVoiceConfirm = null;
        state.stage = STAGE.IDLE;
        state.strictVisitPending = false;
        queuePersist();
        renderAll();
        await speakAndPublish("fill_form", "Хорошо, черновик не вношу. Можете отредактировать вручную и нажать Внести в форму вручную.", {}, {
          resume: true,
        });
        return;
      }
    }

    if (isYesCommand(normalized)) {
      const hasRealDraft = state.visitDraft && hasStructuredVisitDraft(state.visitDraft);
      if (!hasRealDraft) {
        await speakAndPublish("fill_form", "Черновик еще пустой. Сначала заполните поля вручную в расширении или загрузите шаблон, затем подтвердите.", {
          requireManualDraft: true,
        }, {
          resume: true,
        });
        return;
      }

      // If user already applied manual draft through popup, accept and move on
      // without forcing DOM injection in current page.
      if (state.visitDraft && state.visitDraft.manualRequired !== true) {
        const hasManualFields = [
          "complaints",
          "anamnesis",
          "objective",
          "diagnosis",
          "treatment",
          "diary",
        ].some((key) => String(state.visitDraft[key] || "").trim().length > 0);

        if (hasManualFields) {
          await confirmVisitAndAdvance({ total: 0, okCount: 0, manual: true });
          return;
        }
      }

      const injectResult = await injectVisitDraftToDom(state.visitDraft);
      const verification = injectResult.verification;

      // If DOM fields not found on this page (total=0), accept confirmation —
      // user will fill manually via popup "Внести в форму вручную"
      if (!verification || verification.total === 0) {
        console.log("[JARVIS confirm] no DOM fields found, accepting manually");
        await confirmVisitAndAdvance({ total: 0, okCount: 0, skipped: true });
        return;
      }

      if (injectResult.success && strictVisitVerified(verification)) {
        await confirmVisitAndAdvance(verification);
        return;
      }

      state.strictVisitPending = true;
      state.stage = STAGE.AWAITING_VISIT_CONFIRMATION;
      queuePersist();
      renderAll();

      await speakAndPublish("fill_form", "Не все поля заполнены. Скажите ещё раз: Да подтверждаю — или нажмите кнопку в расширении", {
        verification,
      }, { resume: true });
      return;
    }

    if (isNoCommand(normalized)) {
      state.stage = STAGE.IDLE;
      state.strictVisitPending = false;
      state.awaitingVoiceConfirm = null;
      queuePersist();
      renderAll();
      await speakAndPublish("fill_form", "Вы можете проверить и внести вручную", {}, {
        resume: true,
      });
      return;
    }

    if (includesAny(normalized, ["подтверждаю", "подтвердить", "подтверждено"])) {
      await handleVisitConfirmation("да подтверждаю");
      return;
    }

    if (includesAny(normalized, ["отмена", "не подтверждаю", "не надо", "нет"])) {
      await handleVisitConfirmation("нет");
      return;
    }

    await speakAndPublish("fill_form", "Не расслышал подтверждение. Скажите: Да подтверждаю или Нет", {}, {
      resume: true,
    });
  }

  async function handleScheduleConfirmation(normalized) {
    if (isYesCommand(normalized)) {
      state.stage = STAGE.AWAITING_SLOT_SELECTION;
      queuePersist();
      renderAll();

      const scheduleData = await fetchAndApplySandboxSchedule(state.visitDraft);
      if (!scheduleData) {
        const fromDom = extractSlotsFromPageDom();
        if (fromDom.length) {
          state.runtimeSlots = fromDom;
          state.scheduleGrid = [];
        } else {
          state.scheduleGrid = generateSmartSchedule();
          state.runtimeSlots = [];
        }
        queuePersist();
      }

      await announceCurrentAvailability();
      return;
    }

    if (isNoCommand(normalized)) {
      state.stage = STAGE.IDLE;
      queuePersist();
      renderAll();
      await speakAndPublish("check_schedule", "Вы можете проверить и внести вручную", {}, {
        resume: true,
      });
      return;
    }

    await speakAndPublish("check_schedule", "Ответ не распознан. Скажите: Да или Нет", {}, {
      resume: true,
    });
  }

  async function resetVisitFlow() {
    stopLoginWatcher();

    state.stage = STAGE.IDLE;
    state.visitLines = [];
    state.visitDraft = null;
    state.scheduleGrid = [];
    state.runtimeSlots = [];
    state.pendingSuggestedSlot = null;
    state.pendingSlotRequest = null;
    state.awaitingVoiceConfirm = null;
    state.strictVisitPending = false;
    state.patientHint = "";
    state.pendingSiteCheck = null;
    state.transcript = [];
    state.fullVisitAudioChunks = [];

    queuePersist();
    renderAll();

    if (state.listening) {
      await speakAndPublish("none", "Сценарий очищен. Ожидаю команду: Джарвиз открой дамумед или Джарвиз открой песочницу", {}, {
        resume: true,
      });
    } else {
      pageToast("Сценарий приема очищен.");
    }
  }

  async function processVoiceText(rawText) {
    const text = String(rawText || "").trim();
    if (!text) {
      return;
    }

    const normalized = normalizeText(text);
    if (!normalized) {
      return;
    }

    const hasWakeWord = containsWakeWord(normalized);
    const isFinishCmd = isFinishVisitCommand(normalized);
    const wakeRequired = commandRequiresWakeWord(normalized, state.stage);

    console.log("[JARVIS voice]", JSON.stringify({
      text: text.slice(0, 80),
      stage: state.stage,
      hasWakeWord,
      isFinishCmd,
      wakeRequired,
    }));

    if (wakeRequired && !hasWakeWord) {
      console.log("[JARVIS blocked - no wake word in demo safe mode]");
      return;
    }

    playAcknowledgeBeep();

    if (!hasWakeWord) {
      const handled = await processWithoutWakeWord(text, normalized);
      if (!handled) {
        console.log("[JARVIS ignored - no wake word, stage:", state.stage, "]");
      }
      return;
    }

    pushTranscript(VOICE_AUTHOR, text);

    if (state.stage === STAGE.AWAITING_SLOT_SELECTION && isOpenVisitCommand(normalized)) {
      await beginVisit(text);
      return;
    }

    if (state.stage === STAGE.AWAITING_SLOT_SELECTION && includesAny(normalized, ["начни", "начнем", "начни прием", "начать прием"])) {
      await beginVisit(`джарвиз ${text}`);
      return;
    }

    if (state.stage === STAGE.AWAITING_SLOT_SELECTION && includesAny(normalized, ["ночн", "ночной", "вечерн"])) {
      await speakAndPublish("check_schedule", "Скажите конкретно: поставь на день и время, например: Джарвиз поставь на понедельник в 9 утра.", {}, {
        resume: true,
      });
      return;
    }

    if (state.stage === STAGE.AWAITING_SLOT_SELECTION && isFinishVisitCommand(normalized)) {
      await finishVisit();
      return;
    }

    if (state.stage !== STAGE.RECORDING_VISIT && isWakeOnlyCommand(normalized)) {
      await speakAndPublish("none", "Слушаю вашу команду", {}, {
        resume: true,
      });
      return;
    }

    // ── Multi-step RPA: detect navigation / automation commands and plan them ──
    // Only when on a sandbox/damumed page, not mid-recording, and not a slot-selection loop.
    if (
      isSandboxPage() &&
      state.stage === STAGE.COMMAND &&
      isMultiStepCommand(normalized)
    ) {
      const handled = await executeMultiStepCommand(text);
      if (handled) return;
      // If plan returned empty steps, fall through to legacy handlers below.
    }

    if (state.stage === STAGE.RECORDING_VISIT) {
      if (isFinishCmd) {
        await finishVisit();
        return;
      }
      appendVisitLine(text);
      return;
    }

    if (
      state.stage === STAGE.COMMAND &&
      (isAnyFreeSlotCommand(normalized) || isPlaceSlotCommand(normalized) || hasSlotRequestData(normalized))
    ) {
      state.stage = STAGE.AWAITING_SLOT_SELECTION;
      queuePersist();
      renderAll();
      await applyRequestedSlot(normalized);
      return;
    }

    if (state.stage === STAGE.AWAITING_VISIT_CONFIRMATION) {
      await handleVisitConfirmation(normalized);
      return;
    }

    if (state.stage === STAGE.AWAITING_SCHEDULE_CONFIRMATION) {
      await handleScheduleConfirmation(normalized);
      return;
    }

    if (hasStrictVisitLock()) {
      if (isYesCommand(normalized)) {
        await handleVisitConfirmation(normalized);
        return;
      }

      if (isNoCommand(normalized)) {
        await speakAndPublish("fill_form", "Пока не подтверждены все разделы осмотра. Скажите: Да подтверждаю", {}, {
          resume: true,
        });
        return;
      }
    }

    if (state.stage === STAGE.AWAITING_SLOT_SELECTION) {
      if (isSlotConfirmationIntent(normalized)) {
        await applyRequestedSlot(normalized);
        return;
      }

      if (includesAny(normalized, ["первого пациента", "первый пациент", "открой первого пациента"])) {
        const opened = await openFirstPatientFromDom();
        if (!opened) {
          await speakAndPublish("open_site", "Не нашел карточку первого пациента на этой вкладке.", {}, { resume: true });
        }
        return;
      }

      if (isOpenDamumedCommand(normalized)) {
        await openSiteCommand("damumed");
        return;
      }

      if (isOpenSandboxCommand(normalized) || includesAny(normalized, ["открой песочницу", "песочницу"])) {
        await openSiteCommand("sandbox");
        return;
      }

      if (includesAny(normalized, ["начнем", "начнем прием", "начинаем"])) {
        await beginVisit(`джарвиз ${text}`);
        return;
      }

      if (isAnalyzeScheduleCommand(normalized)) {
        await announceCurrentAvailability();
        return;
      }

      if (hasSlotRequestData(normalized)) {
        await applyRequestedSlot(normalized);
        return;
      }

      if (isAnyFreeSlotCommand(normalized)) {
        await applyRequestedSlot(normalized);
        return;
      }

      if (isPlaceSlotCommand(normalized) || isYesCommand(normalized) || isNoCommand(normalized)) {
        await applyRequestedSlot(normalized);
        return;
      }

      await speakAndPublish("check_schedule", "Назовите команду: Поставь на день время", {}, {
        resume: true,
      });
      return;
    }

    if (isOpenDamumedCommand(normalized)) {
      await openSiteCommand("damumed");
      return;
    }

    if (isOpenSandboxCommand(normalized)) {
      await openSiteCommand("sandbox");
      return;
    }

    if (state.stage === STAGE.IDLE) {
      await speakAndPublish("none", "Ожидаю команду: Джарвиз открой дамумед или Джарвиз открой песочницу", {}, {
        resume: true,
      });
      return;
    }

    if (isOpenVisitCommand(normalized)) {
      if (state.stage !== STAGE.COMMAND) {
        await speakAndPublish("start_recording", "Сначала откройте сайт командой: Джарвиз открой дамумед или Джарвиз открой песочницу", {}, {
          resume: true,
        });
        return;
      }

      if (shouldExplicitWakeForVisit(normalized)) {
        await speakAndPublish("start_recording", "Для начала приема скажите: Джарвиз начни прием", {}, {
          resume: true,
        });
        return;
      }

      await beginVisit(text);
      return;
    }

    if (isFinishVisitCommand(normalized)) {
      await finishVisit();
      return;
    }

    if (isAnalyzePageCommand(normalized)) {
      const analysis = analyzeCurrentPage();
      await applySiteAnalysis(analysis, true);
      return;
    }

    if (containsWakeWord(normalized) && includesAny(normalized, ["покажи дом", "статус дом", "dom status"])) {
      const stats = toNodeStats();
      await speakAndPublish("check_schedule", `DOM проверка: карточек пациентов ${stats.patientCards}, слотов ${stats.totalSlots}, свободных ${stats.freeSlots}, занятых ${stats.busySlots}.`, {
        stats,
      }, {
        resume: true,
      });
      return;
    }

    if (isAnalyzeScheduleCommand(normalized)) {
      state.stage = STAGE.AWAITING_SLOT_SELECTION;
      queuePersist();
      renderAll();
      await announceCurrentAvailability();
      return;
    }

    if (isMarkCompletedCommand(normalized)) {
      await markLatestServiceCompleted("", "voice");
      return;
    }

    if (isPlaceSlotCommand(normalized)) {
      state.stage = STAGE.AWAITING_SLOT_SELECTION;
      queuePersist();
      renderAll();
      await applyRequestedSlot(normalized);
      return;
    }

    if (isResetFlowCommand(normalized)) {
      await resetVisitFlow();
      return;
    }

    if (containsWakeWord(normalized)) {
      if (state.stage === STAGE.AWAITING_SLOT_SELECTION && includesAny(normalized, ["первого пациента", "первый пациент"])) {
        const opened = await openFirstPatientFromDom();
        if (!opened) {
          await speakAndPublish("open_site", "Не нашел карточку первого пациента на этой вкладке.", {}, { resume: true });
        }
        return;
      }

      let fallbackSpeech = buildContextualFallbackSpeech(text, state.stage);
      const aiHint = await runLocalAssistantFallback(text, state.stage);
      if (aiHint) {
        fallbackSpeech = aiHint;
      }

      await speakAndPublish("none", fallbackSpeech, {
        rawText: text,
      }, {
        resume: true,
      });
    }
  }

  function enqueueVoiceText(text) {
    const normalizedText = String(text || "").trim();
    if (!normalizedText) {
      return;
    }

    const normalized = normalizeText(normalizedText);
    const normalizedWake = normalizeWakeVariants(normalized);
    // Whisper sometimes hallucinates YouTube/podcast filler when audio is silent or noisy.
    // Drop these aggressively so they don't pollute medical fields.
    const globalNoise = [
      "продолжение следует",
      "субтитры",
      "субтитры подготовил",
      "субтитры сделал",
      "субтитры от",
      "субтитры создал",
      "subtitles",
      "subtitles by",
      "спасибо за просмотр",
      "спасибо за внимание",
      "спасибо что смотрели",
      "спасибо что были с нами",
      "лайк и подписка",
      "ставьте лайки",
      "ставьте лайк",
      "подписывайтесь на канал",
      "подписывайтесь на наш канал",
      "не забудьте подписаться",
      "до новых встреч",
      "увидимся в следующем видео",
      "всем пока",
      "музыка играет",
      "играет музыка",
      "фоновая музыка",
      "звучит музыка",
      "аплодисменты",
      "смех в зале",
      "корректор",
      "редактор субтитров",
      "amara.org",
      "перевод субтитров",
    ];
    if (includesAny(normalized, globalNoise)) {
      console.log("[JARVIS noise-filter] dropped:", normalizedText.slice(0, 80));
      return;
    }

    if (
      state.stage === STAGE.COMMAND &&
      (includesAny(normalizedWake, ["чарвис", "дарвис", "джорвис", "чарльз", "джарвис", "джарвиз"]) ||
        includesAny(normalized, ["начни прием", "начни", "открой песочницу", "открой дамумед"]))
    ) {
      // Ensure command-mode wakeword variants are not dropped by strict wake routing.
      // They are handled in processWithoutWakeWord command branch.
    }

    // Drop ultra-short isolated tokens like "э", "а", "м", "ну" — pure filler.
    const tokens = normalized.split(/\s+/).filter(Boolean);
    if (tokens.length === 1 && tokens[0].length <= 2) {
      const fillerSingles = new Set(["э", "а", "м", "у", "о", "ы", "ну", "эм", "ам", "ой", "ох", "ха", "хм", "мм", "ээ", "аа", "оо"]);
      if (fillerSingles.has(tokens[0])) {
        console.log("[JARVIS noise-filter] dropped filler:", tokens[0]);
        return;
      }
    }

    // Drop pure punctuation / symbols (Whisper sometimes emits "..." or single chars).
    if (!/[a-zа-яё0-9]/i.test(normalizedText)) {
      console.log("[JARVIS noise-filter] dropped non-alphanumeric:", normalizedText.slice(0, 40));
      return;
    }

    state.lastHeardText = normalizedText;
    state.lastHeardAt = Date.now();
    queuePersist();

    console.log("[JARVIS enqueue]", JSON.stringify({
      text: normalizedText.slice(0, 120),
      stage: state.stage,
      queueSizeBefore: voiceQueue.length,
    }));

    voiceQueue.push(normalizedText);
    void drainVoiceQueue();
  }

  async function drainVoiceQueue() {
    if (voiceQueueBusy) {
      return;
    }

    voiceQueueBusy = true;

    try {
      while (voiceQueue.length) {
        const next = voiceQueue.shift();
        if (!next) {
          continue;
        }

        try {
          await processVoiceText(next);
        } catch (error) {
          console.error("[JARVIS voice processing error]", error, String(next).slice(0, 120));
          state.recognitionError = "voice-processing-error";
          renderAll();
        }
      }
    } finally {
      voiceQueueBusy = false;
    }
  }

  function isPendingSiteLoaded() {
    if (!state.pendingSiteCheck) {
      return false;
    }

    const current = window.location.href;

    if (state.pendingSiteCheck === "damumed") {
      return urlsMatch(current, state.config.damumedUrl) || /damumed/i.test(current);
    }

    if (state.pendingSiteCheck === "sandbox") {
      return urlsMatch(current, state.config.sandboxUrl);
    }

    return false;
  }

  async function handlePendingSiteCheck() {
    if (!state.pendingSiteCheck) {
      return;
    }

    if (!isPendingSiteLoaded()) {
      state.pendingSiteCheck = null;
      queuePersist();
      return;
    }

    const target = state.pendingSiteCheck;
    state.pendingSiteCheck = null;
    queuePersist();

    const analysis = analyzeRequestedSite(target);
    await applySiteAnalysis(analysis, true);

    if (!state.listening) {
      try {
        const data = await storageGet([STORAGE_KEYS.autoResumeListening]);
        const autoResume = data[STORAGE_KEYS.autoResumeListening] !== false;
        if (autoResume) {
          await startListening();
        }
      } catch (_error) {
      }
    }
  }

  function setupRuntimeMessageHandler() {
    if (typeof chrome === "undefined" || !chrome.runtime || !chrome.runtime.onMessage) {
      return;
    }

    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message && message.type === "assistant:toggleListening") {
        void (async () => {
          try {
            await toggleListening();
            sendResponse({
              ok: true,
              listening: state.listening,
              stage: state.stage,
              response: getLastResponseEnvelope(),
            });
          } catch (error) {
            sendResponse({
              ok: false,
              error: String(error || "toggle_listening_failed"),
            });
          }
        })();
        return true;
      }

      if (message && message.type === "assistant:analyzePage") {
        const analysis = analyzeCurrentPage();
        sendResponse({ ok: true, ...analysis });
        return;
      }

      if (message && message.type === "assistant:resetVisit") {
        void resetVisitFlow();
        sendResponse({ ok: true });
        return;
      }

      if (message && message.type === "assistant:getStateEnvelope") {
        const lastT = state.transcript.length > 0 ? state.transcript[state.transcript.length - 1] : null;
        sendResponse({
          ok: true,
          response: getLastResponseEnvelope(),
          stage: state.stage,
          stageTitle: STAGE_TITLES[state.stage] || state.stage,
          listening: state.listening,
          sttBusy: state.sttBusy,
          recognitionError: state.recognitionError,
          backendLoopActive: state.backendLoopActive,
          visitLinesCount: state.visitLines.length,
          lastTranscriptLine: lastT ? `${lastT.author === "voice" ? "🎙" : "🤖"} ${lastT.text}` : "",
          lastHeardText: state.lastHeardText,
          lastHeardAt: state.lastHeardAt,
          visitDraft: state.visitDraft || null,
          localAiEnabled: Boolean(state.config.localAiUrl),
          localAiEndpoint: state.config.localAiUrl || "",
          awaitingVoiceConfirm: state.awaitingVoiceConfirm,
          holdToTalk: state.holdToTalk,
          holdingToTalk: state.holdingToTalk,
          ttsBlocked: state.ttsBlocked,
          ttsEnabled: state.ttsEnabled,
        });
        return;
      }

      if (message && message.type === "assistant:setTtsEnabled") {
        void (async () => {
          try {
            const enabled = Boolean(message.payload && message.payload.enabled);
            state.ttsEnabled = enabled;
            await storageSet({ [STORAGE_KEYS.ttsEnabled]: enabled });
            queuePersist();
            renderAll();
            sendResponse({ ok: true, ttsEnabled: state.ttsEnabled });
          } catch (error) {
            sendResponse({ ok: false, error: String(error || "set_tts_enabled_failed") });
          }
        })();
        return true;
      }

      if (message && message.type === "assistant:setHoldToTalk") {
        void (async () => {
          try {
            const enabled = Boolean(message.payload && message.payload.enabled);
            state.holdToTalk = enabled;
            if (!enabled) {
              state.holdingToTalk = false;
            }
            await storageSet({ [STORAGE_KEYS.holdToTalk]: enabled });
            queuePersist();
            renderAll();
            sendResponse({ ok: true, holdToTalk: state.holdToTalk, holdingToTalk: state.holdingToTalk });
          } catch (error) {
            sendResponse({ ok: false, error: String(error || "set_hold_to_talk_failed") });
          }
        })();
        return true;
      }

      if (message && message.type === "assistant:pushToTalk") {
        void (async () => {
          try {
            const active = Boolean(message.payload && message.payload.active);
            if (!state.holdToTalk) {
              sendResponse({ ok: true, holdToTalk: false, listening: state.listening, holdingToTalk: state.holdingToTalk });
              return;
            }

            state.holdingToTalk = active;
            if (active && !state.listening) {
              await startListening();
            }
            if (!active && state.listening) {
              stopListening();
            }
            queuePersist();
            renderAll();
            sendResponse({ ok: true, holdToTalk: state.holdToTalk, listening: state.listening, holdingToTalk: state.holdingToTalk });
          } catch (error) {
            sendResponse({ ok: false, error: String(error || "push_to_talk_failed") });
          }
        })();
        return true;
      }

      if (message && message.type === "assistant:startRecording") {
        state.stage = STAGE.RECORDING_VISIT;
        state.visitLines = [];
        state.visitDraft = null;
        state.scheduleGrid = [];
        state.fullVisitAudioChunks = [];
        renderAll();
        queuePersist();
        pageToast("Прием начат — диктуйте");
        sendResponse({ ok: true, stage: state.stage });
        return;
      }

      if (message && message.type === "assistant:finishRecording") {
        void (async () => {
          try {
            await finishVisit();
            sendResponse({ ok: true, stage: state.stage });
          } catch (error) {
            sendResponse({ ok: false, error: String(error && error.message ? error.message : error) });
          }
        })();
        return true;
      }

      if (message && message.type === "assistant:forceConfirm") {
        void (async () => {
          try {
            await confirmVisitAndAdvance({ total: 0, okCount: 0, forced: true });
            sendResponse({ ok: true, stage: state.stage });
          } catch (error) {
            sendResponse({ ok: false, error: String(error && error.message ? error.message : error) });
          }
        })();
        return true;
      }

      if (message && message.type === "assistant:applyManualDraft") {
        void (async () => {
          try {
            const raw = message.payload && typeof message.payload === "object" ? message.payload : {};
            const draft = {
              patient: String(raw.patient || state.patientHint || "").trim(),
              complaints: String(raw.complaints || "").trim(),
              anamnesis: String(raw.anamnesis || "").trim(),
              objective: String(raw.objective || "").trim(),
              diagnosis: String(raw.diagnosis || "").trim(),
              treatment: String(raw.treatment || "").trim(),
              diary: String(raw.diary || "").trim(),
              manualRequired: false,
              createdAt: new Date().toISOString(),
            };

            state.visitDraft = draft;
            state.awaitingVoiceConfirm = null;
            // Do not force immediate DOM inject from popup. Keep manual draft in state
            // and allow voice confirmation to proceed in a stable path.
            const result = { success: true, verification: { total: 0, okCount: 0, manual: true } };
            sendResponse({
              ok: true,
              applied: result.success,
              verification: result.verification,
              stage: state.stage,
            });
          } catch (error) {
            sendResponse({ ok: false, error: String(error || "manual_apply_failed") });
          }
        })();
        return true;
      }

      if (message && message.type === "assistant:markServiceCompleted") {
        void (async () => {
          try {
            const diary = String(message.payload && message.payload.diary ? message.payload.diary : "").trim();
            const result = await markLatestServiceCompleted(diary, "manual");
            if (!result.ok) {
              sendResponse({ ok: false, error: result.error || "mark_service_failed" });
              return;
            }

            sendResponse({
              ok: true,
              assignment: result.assignment,
              completedAt: result.completedAt || "",
            });
          } catch (error) {
            sendResponse({ ok: false, error: String(error || "mark_service_failed") });
          }
        })();
        return true;
      }

      if (message && message.type === "assistant:manualCommand") {
        void (async () => {
          try {
            const text = String(message.payload && message.payload.text ? message.payload.text : "").trim();
            if (!text) {
              sendResponse({ ok: false, error: "empty_manual_command" });
              return;
            }
            enqueueVoiceText(text);
            sendResponse({ ok: true });
          } catch (error) {
            sendResponse({ ok: false, error: String(error || "manual_command_failed") });
          }
        })();
        return true;
      }
    });
  }

  async function initAssistant() {
    await loadStoredState();

    if (ENABLE_IN_PAGE_ASSISTANT_UI) {
      mountAssistant();
    } else {
      const existing = document.getElementById(ASSISTANT_ROOT_ID);
      if (existing) {
        existing.remove();
      }
    }

    renderAll();
    setupRuntimeMessageHandler();
    await handlePendingSiteCheck();

    // If we are already on target site after reload, recover stage without forcing "open site" prompt.
    const currentAnalysis = analyzeCurrentPage();
    if (currentAnalysis && currentAnalysis.site !== "other") {
      await applySiteAnalysis(currentAnalysis, false);
    }

    if (state.stage === STAGE.AWAITING_LOGIN) {
      startLoginWatcher();
    }
  }

  void initAssistant();
})();
