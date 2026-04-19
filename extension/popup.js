const KEY_DAMUMED = "jarvis_damumed_url";
const KEY_SANDBOX = "jarvis_sandbox_url";

const DEFAULT_DAMUMED = "https://damumed.kz";
const DEFAULT_SANDBOX = "http://localhost:4173";

const backendDot = document.getElementById("backendDot");
const backendLabel = document.getElementById("backendLabel");
const voiceDot = document.getElementById("voiceDot");
const voiceLabel = document.getElementById("voiceLabel");
const damumedWarn = document.getElementById("damumedWarning");
const statusBar = document.getElementById("statusBar");
const statusText = document.getElementById("statusText");

const btnTalk = document.getElementById("btnTalk");
const btnOpenDamumedVoice = document.getElementById("btnOpenDamumedVoice");
const btnOpenSandboxVoice = document.getElementById("btnOpenSandboxVoice");
const holdToTalkToggle = document.getElementById("holdToTalkToggle");
const ttsToggle = document.getElementById("ttsToggle");
const btnPushToTalk = document.getElementById("btnPushToTalk");
const btnStartRecording = document.getElementById("btnStartRecording");
const btnFinishRecording = document.getElementById("btnFinishRecording");
const btnForceConfirm = document.getElementById("btnForceConfirm");
const stageLabel = document.getElementById("stageLabel");
const visitLinesCount = document.getElementById("visitLinesCount");
const lastTranscriptEl = document.getElementById("lastTranscript");
const btnApplyManual = document.getElementById("btnApplyManual");
const manualStatus = document.getElementById("manualStatus");
const fileMedical = document.getElementById("fileMedical");
const fileTemplate = document.getElementById("fileTemplate");
const btnPickMedical = document.getElementById("btnPickMedical");
const btnPickTemplate = document.getElementById("btnPickTemplate");
const btnUseBuiltInTemplate = document.getElementById("btnUseBuiltInTemplate");
const pickedFiles = document.getElementById("pickedFiles");
const btnApplyFiles = document.getElementById("btnApplyFiles");
const fileStatus = document.getElementById("fileStatus");
const btnCompleteByVoice = document.getElementById("btnCompleteByVoice");
const btnCompleteNow = document.getElementById("btnCompleteNow");
const fieldServiceDiary = document.getElementById("fieldServiceDiary");
const serviceStatus = document.getElementById("serviceStatus");

const fieldComplaints = document.getElementById("fieldComplaints");
const fieldPatient = document.getElementById("fieldPatient");
const fieldAnamnesis = document.getElementById("fieldAnamnesis");
const fieldObjective = document.getElementById("fieldObjective");
const fieldDiagnosis = document.getElementById("fieldDiagnosis");
const fieldTreatment = document.getElementById("fieldTreatment");
const fieldDiary = document.getElementById("fieldDiary");

let manualFieldsDirty = false;
let lastDraftStamp = "";

function isManualFieldElement(el) {
  if (!el || !el.id) {
    return false;
  }
  return [
    "fieldPatient",
    "fieldComplaints",
    "fieldAnamnesis",
    "fieldObjective",
    "fieldDiagnosis",
    "fieldTreatment",
    "fieldDiary",
  ].includes(el.id);
}

function getDraftStamp(draft) {
  if (!draft || typeof draft !== "object") {
    return "";
  }

  const createdAt = String(draft.createdAt || "").trim();
  if (createdAt) {
    return createdAt;
  }

  const snapshot = [
    draft.patient,
    draft.complaints,
    draft.anamnesis,
    draft.objective,
    draft.diagnosis,
    draft.treatment,
    draft.diary,
  ]
    .map((item) => String(item || "").trim())
    .join("|");

  return snapshot;
}

const damumedInput = document.getElementById("damumed-url");
const sandboxInput = document.getElementById("sandbox-url");
const saveUrlsButton = document.getElementById("save-urls");
const openDamumedButton = document.getElementById("open-damumed");
const openSandboxButton = document.getElementById("open-sandbox");
const popupStatus = document.getElementById("popup-status");

const KEY_LOCAL_AI = "jarvis_local_ai_url";

function normalizeUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return "";
  }

  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return "";
    }
    return parsed.toString();
  } catch (_error) {
    return "";
  }
}

function toOriginUrl(value) {
  const normalized = normalizeUrl(value);
  if (!normalized) {
    return "";
  }

  try {
    const parsed = new URL(normalized);
    return parsed.origin;
  } catch (_error) {
    return "";
  }
}

function setStatus(message, isError) {
  if (!statusBar || !statusText) {
    return;
  }
  statusBar.classList.remove("hidden");
  statusText.textContent = message;
  statusBar.style.background = isError ? "#fdecea" : "#e8f4fd";
  statusBar.style.borderColor = isError ? "#ef9a9a" : "#b3d9f2";
  statusBar.style.color = isError ? "#c62828" : "#1f5f67";
}

function setPopupStatus(message) {
  if (!popupStatus) {
    return;
  }
  popupStatus.textContent = message;
}

function setManualStatus(message, isError) {
  if (!manualStatus) {
    return;
  }
  manualStatus.textContent = message;
  manualStatus.className = isError ? "fill-status error" : "fill-status";
}

function setFileStatus(message, isError) {
  if (!fileStatus) {
    return;
  }
  fileStatus.textContent = message;
  fileStatus.className = isError ? "fill-status error" : "fill-status";
}

function setServiceStatus(message, isError) {
  if (!serviceStatus) {
    return;
  }
  serviceStatus.textContent = message;
  serviceStatus.className = isError ? "fill-status error" : "fill-status";
}

function refreshPickedFilesLabel() {
  if (!pickedFiles) {
    return;
  }

  const med = fileMedical && fileMedical.files && fileMedical.files[0] ? fileMedical.files[0].name : "";
  const tpl = fileTemplate && fileTemplate.files && fileTemplate.files[0] ? fileTemplate.files[0].name : "";
  if (!med && !tpl) {
    pickedFiles.textContent = "Файлы не выбраны";
    return;
  }

  const parts = [];
  if (med) parts.push(`Медфайл: ${med}`);
  if (tpl) parts.push(`Шаблон: ${tpl}`);
  pickedFiles.textContent = parts.join(" | ");
}

function mergeDraft(base, extra) {
  const baseObj = base && typeof base === "object" ? base : {};
  const extraObj = extra && typeof extra === "object" ? extra : {};
  const out = { ...baseObj };
  ["patient", "complaints", "anamnesis", "objective", "diagnosis", "treatment", "diary"].forEach((key) => {
    const value = String(extraObj[key] || "").trim();
    if (value) {
      const prev = String(out[key] || "").trim();
      out[key] = prev ? `${prev} ${value}`.trim() : value;
    }
  });
  return out;
}

function extractStructuredDraftFromText(text) {
  const source = String(text || "").trim();
  if (!source) {
    return {};
  }

  const normalized = source.replace(/\r/g, "\n");
  const fields = {
    patient: ["пациент", "фио", "patient"],
    complaints: ["жалобы", "complaints"],
    anamnesis: ["анамнез", "анамнеза", "history"],
    objective: ["объектив", "осмотр", "objective"],
    diagnosis: ["диагноз", "мкб", "diagnosis"],
    treatment: ["назнач", "рекоменд", "лечение", "treatment", "plan"],
    diary: ["дневник", "динамик", "diary"],
  };

  const out = {};
  const lines = normalized.split(/\n+/).map((line) => line.trim()).filter(Boolean);

  for (const line of lines) {
    for (const [key, hints] of Object.entries(fields)) {
      if (hints.some((hint) => line.toLowerCase().includes(hint))) {
        const value = line
          .replace(/^([^:]{1,30}):/i, "")
          .replace(/^[-•]\s*/, "")
          .trim();
        if (value && value.length > 2) {
          const prev = String(out[key] || "").trim();
          out[key] = prev ? `${prev} ${value}`.trim() : value;
        }
      }
    }
  }

  if (!Object.keys(out).length) {
    out.diary = source.slice(0, 900);
  }
  return out;
}

function parseTemplateContent(content) {
  const raw = String(content || "").trim();
  if (!raw) {
    return {};
  }

  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      return parsed;
    }
  } catch (_error) {
  }

  return extractStructuredDraftFromText(raw);
}

async function readFileText(file, maxChars) {
  if (!file) {
    return "";
  }

  const text = await file.text();
  const value = String(text || "").trim();
  if (!value) {
    return "";
  }
  return value.slice(0, Math.max(200, maxChars));
}

async function applyFileAndTemplateToDraft() {
  const medical = fileMedical && fileMedical.files && fileMedical.files[0] ? fileMedical.files[0] : null;
  const template = fileTemplate && fileTemplate.files && fileTemplate.files[0] ? fileTemplate.files[0] : null;

  if (!medical && !template) {
    setFileStatus("Выберите хотя бы один файл", true);
    return;
  }

  const current = {
    patient: String(fieldPatient.value || "").trim(),
    complaints: String(fieldComplaints.value || "").trim(),
    anamnesis: String(fieldAnamnesis.value || "").trim(),
    objective: String(fieldObjective.value || "").trim(),
    diagnosis: String(fieldDiagnosis.value || "").trim(),
    treatment: String(fieldTreatment.value || "").trim(),
    diary: String(fieldDiary.value || "").trim(),
  };

  const [medicalText, templateText] = await Promise.all([
    readFileText(medical, 3000),
    readFileText(template, 2400),
  ]);

  const fromMedical = extractStructuredDraftFromText(medicalText);
  const fromTemplate = parseTemplateContent(templateText);
  const merged = mergeDraft(mergeDraft(current, fromTemplate), fromMedical);

  fillManualFieldsFromDraft(merged);
  const mergedFields = Object.keys(merged).filter((key) => String(merged[key] || "").trim()).length;
  setFileStatus(`Интегрировано из файлов. Полей с данными: ${mergedFields}`, false);
}

function useBuiltInTemplate() {
  const sample = {
    patient: "ДЕМО ПАЦИЕНТ",
    complaints: "Жалобы на слабость и быструю утомляемость.",
    anamnesis: "Состояние наблюдается несколько дней, положительная динамика неполная.",
    objective: "Общее состояние удовлетворительное, сознание ясное, гемодинамика стабильна.",
    diagnosis: "Основной диагноз по профилю реабилитации.",
    treatment: "Рекомендован курс ЛФК, массаж, психологическое сопровождение.",
    diary: "Процедура выполнена, переносимость удовлетворительная.",
  };
  fillManualFieldsFromDraft(sample, true);
  lastDraftStamp = getDraftStamp(sample);
  setFileStatus("Встроенный демо-шаблон загружен", false);
}

async function markServiceCompletedNow() {
  const diary = String((fieldServiceDiary && fieldServiceDiary.value) || "").trim();
  const response = await sendToContent("assistant:markServiceCompleted", { diary });
  if (!response || !response.ok) {
    throw new Error((response && response.error) || "mark_service_failed");
  }
  const completedAt = response.completedAt || "";
  setServiceStatus(completedAt ? `Отмечено выполнено: ${completedAt}` : "Отмечено выполнено", false);
}

function getStorage(keys) {
  if (typeof chrome === "undefined" || !chrome.storage || !chrome.storage.local) {
    return Promise.resolve({});
  }
  return new Promise((resolve) => {
    chrome.storage.local.get(keys, (result) => resolve(result || {}));
  });
}

function setStorage(values) {
  if (typeof chrome === "undefined" || !chrome.storage || !chrome.storage.local) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    chrome.storage.local.set(values, () => resolve());
  });
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab || null;
}

async function sendToContent(type, payload) {
  const tab = await getActiveTab();
  if (!tab || !tab.id) {
    throw new Error("Нет активной вкладки");
  }
  return chrome.tabs.sendMessage(tab.id, { type, payload: payload || {} });
}

async function sendToAssistant(type, payload) {
  const tab = await getActiveTab();
  if (!tab || !tab.id || !tab.url) {
    throw new Error("Нет активной вкладки");
  }

  const url = String(tab.url || "");
  const isHttpPage = /^https?:\/\//i.test(url);

  if (isHttpPage) {
    return sendToContent(type, payload);
  }

  if (type === "assistant:toggleListening" || type === "assistant:pushToTalk") {
    return { ok: false, error: "Откройте Damumed или sandbox и нажмите Говорить" };
  }

  const storage = await getStorage([KEY_DAMUMED, KEY_SANDBOX]);
  const lowerType = String(type || "").toLowerCase();
  const targetUrl = lowerType.includes("sandbox")
    ? toOriginUrl(storage[KEY_SANDBOX]) || DEFAULT_SANDBOX
    : toOriginUrl(storage[KEY_DAMUMED]) || DEFAULT_DAMUMED;

  if (!targetUrl) {
    return { ok: false, error: "URL не настроен" };
  }

  const nav = await chrome.runtime.sendMessage({ type: "assistant:navigateTab", url: targetUrl });
  if (!nav || !nav.ok) {
    return { ok: false, error: (nav && nav.error) || "navigation_failed" };
  }

  return { ok: true, redirected: true, targetUrl };
}

async function openTab(url) {
  if (!chrome.tabs || !chrome.tabs.create) {
    return;
  }
  await chrome.tabs.create({ url });
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function focusTabByOrigin(origin, timeoutMs = 5000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const tabs = await chrome.tabs.query({});
    const found = tabs.find((tab) => tab && typeof tab.url === "string" && tab.url.startsWith(origin));
    if (found && found.id) {
      await chrome.tabs.update(found.id, { active: true });
      if (found.windowId) {
        await chrome.windows.update(found.windowId, { focused: true });
      }
      return found;
    }
    await wait(250);
  }
  return null;
}

async function openSiteAndActivateVoice(target) {
  const storage = await getStorage([KEY_DAMUMED, KEY_SANDBOX]);
  const targetUrl = target === "sandbox"
    ? toOriginUrl(storage[KEY_SANDBOX]) || DEFAULT_SANDBOX
    : toOriginUrl(storage[KEY_DAMUMED]) || DEFAULT_DAMUMED;

  if (!targetUrl) {
    throw new Error("URL не настроен");
  }

  const nav = await chrome.runtime.sendMessage({ type: "assistant:navigateTab", url: targetUrl });
  if (!nav || !nav.ok) {
    throw new Error((nav && nav.error) || "navigation_failed");
  }

  const origin = new URL(targetUrl).origin;
  const tab = await focusTabByOrigin(origin, 7000);
  if (!tab || !tab.id) {
    throw new Error("Не удалось активировать вкладку сайта");
  }

  await wait(500);
  const voice = await chrome.tabs.sendMessage(tab.id, { type: "assistant:toggleListening", payload: {} });
  if (!voice || !voice.ok) {
    throw new Error((voice && voice.error) || "voice_toggle_failed");
  }

  return { targetUrl };
}

async function checkBackend() {
  try {
    const response = await fetch("http://127.0.0.1:8000/health", { method: "GET" });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    backendDot.className = "dot dot-on";
    backendLabel.textContent = "backend вкл";
  } catch (_error) {
    backendDot.className = "dot dot-off";
    backendLabel.textContent = "backend выкл";
  }
}

function fillManualFieldsFromDraft(draft, force) {
  if (!force && manualFieldsDirty) {
    return;
  }

  const source = draft && typeof draft === "object" ? draft : {};
  fieldPatient.value = String(source.patient || "");
  fieldComplaints.value = String(source.complaints || "");
  fieldAnamnesis.value = String(source.anamnesis || "");
  fieldObjective.value = String(source.objective || "");
  fieldDiagnosis.value = String(source.diagnosis || "");
  fieldTreatment.value = String(source.treatment || "");
  fieldDiary.value = String(source.diary || "");
  manualFieldsDirty = false;
}

async function refreshContentState() {
  try {
    const tab = await getActiveTab();
    const url = String((tab && tab.url) || "");
    const isHttpPage = /^https?:\/\//i.test(url);

    if (!isHttpPage) {
      damumedWarn.classList.remove("hidden");
      voiceDot.className = "dot dot-off";
      voiceLabel.textContent = "откройте сайт";
      if (lastTranscriptEl) {
        lastTranscriptEl.textContent = "Откройте Damumed или sandbox, затем включайте голосовой ввод";
        lastTranscriptEl.classList.remove("hidden");
      }
      return;
    }

    const [analysis, envelope] = await Promise.all([
      sendToContent("assistant:analyzePage", {}),
      sendToContent("assistant:getStateEnvelope", {}),
    ]);

    const site = analysis && analysis.site ? analysis.site : "other";
    damumedWarn.classList.toggle("hidden", site === "damumed" || site === "sandbox");

    if (envelope && envelope.ok) {
      const listening = Boolean(envelope.listening);
      const backendLoopActive = Boolean(envelope.backendLoopActive);
      const sttBusy = Boolean(envelope.sttBusy);
      const localAiEnabled = Boolean(envelope.localAiEnabled);
      const holdToTalk = Boolean(envelope.holdToTalk);
      const holdingToTalk = Boolean(envelope.holdingToTalk);
      const ttsBlocked = Boolean(envelope.ttsBlocked);
      const ttsEnabled = envelope.ttsEnabled !== false;
      voiceDot.className = `dot ${listening ? "dot-on" : "dot-off"}`;
      voiceLabel.textContent = listening
        ? (backendLoopActive ? "микрофон вкл (backend stt)" : "микрофон вкл")
        : "микрофон выкл";

      if (holdToTalkToggle) {
        holdToTalkToggle.checked = holdToTalk;
      }

      if (ttsToggle) {
        ttsToggle.checked = ttsEnabled;
      }

      if (btnPushToTalk) {
        btnPushToTalk.classList.toggle("hidden", !holdToTalk);
        btnPushToTalk.textContent = holdingToTalk ? "🛑 Отпустите для паузы" : "🎤 Зажми и говори";
      }

      if (btnTalk) {
        btnTalk.classList.toggle("hidden", holdToTalk);
      }

      if (statusText && localAiEnabled) {
        const endpoint = String(envelope.localAiEndpoint || "");
        if (endpoint) {
          statusText.textContent = `Локальная ИИ подключена: ${endpoint}`;
          statusBar.classList.remove("hidden");
        }
      }

      if (ttsBlocked) {
        setStatus("Озвучка заблокирована браузером (TTS not-allowed). Работа распознавания продолжается.", true);
      }
      if (btnTalk) {
        btnTalk.textContent = listening ? "⏹ Остановить" : "🎙️ Говорить";
      }

      // Stage display
      const stage = envelope.stage || "idle";
      const title = envelope.stageTitle || stage;
      if (stageLabel) stageLabel.textContent = title;
      if (stageLabel) {
        stageLabel.className = `stage-label stage-${stage.replace(/_/g, "-")}`;
      }

      // Show force-confirm button only when stuck in confirmation stage
      if (btnForceConfirm) {
        if (stage === "awaiting_visit_confirmation") {
          btnForceConfirm.classList.remove("hidden");
        } else {
          btnForceConfirm.classList.add("hidden");
        }
      }

      // Visit lines count
      const linesCount = envelope.visitLinesCount || 0;
      if (visitLinesCount) {
        if (stage === "recording_visit" && linesCount > 0) {
          visitLinesCount.textContent = `${linesCount} фраз`;
          visitLinesCount.classList.remove("hidden");
        } else {
          visitLinesCount.classList.add("hidden");
        }
      }

      // Last recognized text
      const lastLine = envelope.lastTranscriptLine || "";
      const lastHeard = String(envelope.lastHeardText || "").trim();
      const awaitingVoiceConfirm = envelope.awaitingVoiceConfirm && typeof envelope.awaitingVoiceConfirm === "object";
      if (lastTranscriptEl) {
        if (sttBusy) {
          lastTranscriptEl.textContent = "🎧 Слушаю...";
          lastTranscriptEl.classList.remove("hidden");
        } else if (awaitingVoiceConfirm) {
          lastTranscriptEl.textContent = "🤖 Ожидаю подтверждение: скажите Да подтверждаю или Нет";
          lastTranscriptEl.classList.remove("hidden");
        } else if (lastLine) {
          lastTranscriptEl.textContent = lastLine;
          lastTranscriptEl.classList.remove("hidden");
        } else if (lastHeard) {
          lastTranscriptEl.textContent = `🎧 Последнее: ${lastHeard}`;
          lastTranscriptEl.classList.remove("hidden");
        } else {
          lastTranscriptEl.classList.add("hidden");
        }
      }

      // Fill manual fields: prefer direct visitDraft, fall back to lastResponse.data.draft
      const directDraft = envelope.visitDraft && typeof envelope.visitDraft === "object" ? envelope.visitDraft : null;
      const lastResponse = envelope.response && typeof envelope.response === "object" ? envelope.response : null;
      const responseDraft = lastResponse && lastResponse.data && typeof lastResponse.data.draft === "object"
        ? lastResponse.data.draft : null;
      const draft = directDraft || responseDraft;
      if (draft) {
        const stamp = getDraftStamp(draft);
        const isNewDraft = Boolean(stamp) && stamp !== lastDraftStamp;
        fillManualFieldsFromDraft(draft, isNewDraft);
        if (stamp) {
          lastDraftStamp = stamp;
        }
      } else if (lastResponse && lastResponse.action === "fill_form") {
        setManualStatus("Черновик пустой. Выберите шаблон в блоке 'Файлы и шаблоны' и нажмите 'Интегрировать'.", true);
      }

      if (stage === "awaiting_visit_confirmation") {
        const currentDraft = {
          patient: String(fieldPatient && fieldPatient.value ? fieldPatient.value : "").trim(),
          complaints: String(fieldComplaints && fieldComplaints.value ? fieldComplaints.value : "").trim(),
          anamnesis: String(fieldAnamnesis && fieldAnamnesis.value ? fieldAnamnesis.value : "").trim(),
          objective: String(fieldObjective && fieldObjective.value ? fieldObjective.value : "").trim(),
          diagnosis: String(fieldDiagnosis && fieldDiagnosis.value ? fieldDiagnosis.value : "").trim(),
          treatment: String(fieldTreatment && fieldTreatment.value ? fieldTreatment.value : "").trim(),
          diary: String(fieldDiary && fieldDiary.value ? fieldDiary.value : "").trim(),
        };
        const filled = Object.values(currentDraft).filter((value) => String(value || "").trim().length > 0).length;
        if (filled < 3) {
          setManualStatus("Заполните минимум 3 поля и нажмите 'Внести в форму вручную', затем подтвердите голосом.", true);
        }
      }

      // Suppress network mic error — it's expected on HTTP and fixed by backend STT restart
      if (envelope.recognitionError === "network") {
        // no-op: backend STT loop handles this transparently
      }
    }
  } catch (_error) {
    const msg = String(_error && _error.message ? _error.message : _error || "");
    const isTransient = /Receiving end does not exist|Could not establish connection/i.test(msg);
    if (isTransient) {
      setStatus("Вкладка перезагружалась. Подождите 1-2 сек, связь восстановится автоматически.", true);
      return;
    }

    damumedWarn.classList.remove("hidden");
    voiceDot.className = "dot dot-off";
    voiceLabel.textContent = "нет связи с вкладкой";
  }
}

async function loadUrls() {
  const data = await getStorage([KEY_DAMUMED, KEY_SANDBOX, KEY_LOCAL_AI]);
  const damumedOrigin = toOriginUrl(data[KEY_DAMUMED]) || DEFAULT_DAMUMED;
  const sandboxOrigin = toOriginUrl(data[KEY_SANDBOX]) || DEFAULT_SANDBOX;

  if (toOriginUrl(data[KEY_DAMUMED]) !== data[KEY_DAMUMED] || toOriginUrl(data[KEY_SANDBOX]) !== data[KEY_SANDBOX]) {
    await setStorage({
      [KEY_DAMUMED]: damumedOrigin,
      [KEY_SANDBOX]: sandboxOrigin,
    });
  }

  if (damumedInput) {
    damumedInput.value = damumedOrigin;
  }
  if (sandboxInput) {
    sandboxInput.value = sandboxOrigin;
  }

  const currentAi = normalizeUrl(data[KEY_LOCAL_AI]);
  if (!currentAi) {
    await setStorage({ [KEY_LOCAL_AI]: "http://127.0.0.1:8000/api/jarvis/process-visit" });
  }
}

async function saveUrls() {
  const damumed = toOriginUrl(damumedInput ? damumedInput.value : "");
  const sandbox = toOriginUrl(sandboxInput ? sandboxInput.value : "");

  if (!damumed || !sandbox) {
    setPopupStatus("Проверь URL: нужны корректные http/https адреса");
    return;
  }

  await setStorage({
    [KEY_DAMUMED]: damumed,
    [KEY_SANDBOX]: sandbox,
  });

  setPopupStatus("URL сохранены");
}

async function onTalkClick() {
  try {
    logActivity("Переключение микрофона...");
    const response = await sendToAssistant("assistant:toggleListening", {});
    if (!response || !response.ok) {
      throw new Error((response && response.error) || "toggle_failed");
    }

    const listening = Boolean(response.listening);
    const backendLoopActive = Boolean(response.backendLoopActive);
    voiceDot.className = `dot ${listening ? "dot-on" : "dot-off"}`;
    voiceLabel.textContent = listening
      ? (backendLoopActive ? "микрофон вкл (backend stt)" : "микрофон вкл")
      : "микрофон выкл";
    btnTalk.textContent = listening ? "⏹ Остановить" : "🎙️ Говорить";

    const msg = listening ? "Микрофон включён" : "Микрофон выключен";
    setStatus(msg, false);
    logActivity(msg);
  } catch (error) {
    const msg = `Ошибка голоса: ${String(error && error.message ? error.message : error)}`;
    setStatus(msg, true);
    logActivity(msg, true);
  }
}

async function onApplyManualClick() {
  try {
    const payload = {
      patient: String(fieldPatient.value || "").trim(),
      complaints: String(fieldComplaints.value || "").trim(),
      anamnesis: String(fieldAnamnesis.value || "").trim(),
      objective: String(fieldObjective.value || "").trim(),
      diagnosis: String(fieldDiagnosis.value || "").trim(),
      treatment: String(fieldTreatment.value || "").trim(),
      diary: String(fieldDiary.value || "").trim(),
    };

    const response = await sendToContent("assistant:applyManualDraft", payload);
    if (!response || !response.ok) {
      throw new Error((response && response.error) || "manual_apply_failed");
    }

    const verification = response.verification || { okCount: 0, total: 0 };
    if (verification.manual) {
      setManualStatus("Черновик сохранен. Теперь скажите: Да подтверждаю", false);
    } else {
      setManualStatus(`Внесено. DOM проверка: ${verification.okCount}/${verification.total}`, false);
    }
    manualFieldsDirty = false;
    lastDraftStamp = `${Date.now()}`;
  } catch (error) {
    setManualStatus(`Ошибка ручного внесения: ${String(error && error.message ? error.message : error)}`, true);
  }
}

btnTalk?.addEventListener("click", () => {
  void onTalkClick();
});

holdToTalkToggle?.addEventListener("change", async () => {
  try {
    const enabled = Boolean(holdToTalkToggle.checked);
    const response = await sendToAssistant("assistant:setHoldToTalk", { enabled });
    if (!response || !response.ok) {
      throw new Error((response && response.error) || "set_hold_to_talk_failed");
    }

    if (!enabled) {
      await sendToAssistant("assistant:pushToTalk", { active: false });
    }

    await refreshContentState();
    setStatus(enabled ? "Push-to-talk включен" : "Push-to-talk выключен", false);
  } catch (error) {
    setStatus(`Ошибка режима PTT: ${String(error && error.message ? error.message : error)}`, true);
    await refreshContentState();
  }
});

ttsToggle?.addEventListener("change", async () => {
  try {
    const enabled = Boolean(ttsToggle.checked);
    const response = await sendToAssistant("assistant:setTtsEnabled", { enabled });
    if (!response || !response.ok) {
      throw new Error((response && response.error) || "set_tts_failed");
    }
    setStatus(enabled ? "Озвучка включена" : "Озвучка отключена (демо-режим)", false);
    await refreshContentState();
  } catch (error) {
    setStatus(`Ошибка переключения TTS: ${String(error && error.message ? error.message : error)}`, true);
    await refreshContentState();
  }
});

function bindPushToTalkButton() {
  if (!btnPushToTalk) {
    return;
  }

  const press = async () => {
    try {
      await sendToAssistant("assistant:pushToTalk", { active: true });
      await refreshContentState();
    } catch (_error) {
    }
  };

  const release = async () => {
    try {
      await sendToAssistant("assistant:pushToTalk", { active: false });
      await refreshContentState();
    } catch (_error) {
    }
  };

  btnPushToTalk.addEventListener("mousedown", () => { void press(); });
  btnPushToTalk.addEventListener("mouseup", () => { void release(); });
  btnPushToTalk.addEventListener("mouseleave", () => { void release(); });
  btnPushToTalk.addEventListener("touchstart", (event) => {
    event.preventDefault();
    void press();
  }, { passive: false });
  btnPushToTalk.addEventListener("touchend", (event) => {
    event.preventDefault();
    void release();
  }, { passive: false });
  btnPushToTalk.addEventListener("touchcancel", (event) => {
    event.preventDefault();
    void release();
  }, { passive: false });
}

btnStartRecording?.addEventListener("click", async () => {
  try {
    const response = await sendToAssistant("assistant:startRecording", {});
    if (response && response.redirected) {
      setStatus("Открыл сайт. Перейдите на вкладку и нажмите Начать прием ещё раз.", false);
      return;
    }
    if (!response || !response.ok) throw new Error("Не удалось начать прием");
    setStatus("Прием начат — диктуйте показания", false);
    await refreshContentState();
  } catch (error) {
    setStatus(`Ошибка: ${String(error && error.message ? error.message : error)}`, true);
  }
});

btnFinishRecording?.addEventListener("click", async () => {
  try {
    btnFinishRecording.disabled = true;
    btnFinishRecording.textContent = "⏳ Обрабатываю...";
    setStatus("Завершаю прием — отправляю в AI...", false);
    const response = await sendToAssistant("assistant:finishRecording", {});
    if (response && response.redirected) {
      setStatus("Открыл сайт. Перейдите на вкладку и завершите прием на странице.", false);
      return;
    }
    if (!response || !response.ok) throw new Error(response?.error || "Не удалось завершить прием");
    setStatus("Прием завершён — проверьте поля ниже", false);
    await refreshContentState();
  } catch (error) {
    setStatus(`Ошибка: ${String(error && error.message ? error.message : error)}`, true);
  } finally {
    btnFinishRecording.disabled = false;
    btnFinishRecording.textContent = "⏹ Завершить прием";
  }
});

btnForceConfirm?.addEventListener("click", async () => {
  try {
    btnForceConfirm.disabled = true;
    btnForceConfirm.textContent = "⏳ Подтверждаю...";
    const response = await sendToContent("assistant:forceConfirm", {});
    if (!response || !response.ok) throw new Error(response?.error || "Не удалось подтвердить");
    setStatus("Подтверждено — можно вносить вручную", false);
    if (typeof logActivity === "function") logActivity("Подтверждено вручную через кнопку");
    await refreshContentState();
  } catch (error) {
    setStatus(`Ошибка: ${String(error && error.message ? error.message : error)}`, true);
  } finally {
    btnForceConfirm.disabled = false;
    btnForceConfirm.textContent = "✅ Подтвердить (пропустить проверку)";
  }
});

btnApplyManual?.addEventListener("click", () => {
  void onApplyManualClick();
});

[fieldPatient, fieldComplaints, fieldAnamnesis, fieldObjective, fieldDiagnosis, fieldTreatment, fieldDiary]
  .forEach((input) => {
    input?.addEventListener("input", (event) => {
      if (isManualFieldElement(event.target)) {
        manualFieldsDirty = true;
      }
    });
  });

btnApplyFiles?.addEventListener("click", () => {
  void (async () => {
    try {
      btnApplyFiles.disabled = true;
      await applyFileAndTemplateToDraft();
    } catch (error) {
      setFileStatus(`Ошибка интеграции: ${String(error && error.message ? error.message : error)}`, true);
    } finally {
      btnApplyFiles.disabled = false;
    }
  })();
});

btnPickMedical?.addEventListener("click", () => {
  try {
    if (fileMedical && typeof fileMedical.showPicker === "function") {
      fileMedical.showPicker();
    } else if (fileMedical) {
      fileMedical.click();
    }
  } catch (_error) {
    if (fileMedical) fileMedical.click();
  }
});

btnPickTemplate?.addEventListener("click", () => {
  try {
    if (fileTemplate && typeof fileTemplate.showPicker === "function") {
      fileTemplate.showPicker();
    } else if (fileTemplate) {
      fileTemplate.click();
    }
  } catch (_error) {
    if (fileTemplate) fileTemplate.click();
  }
});

fileMedical?.addEventListener("change", () => {
  refreshPickedFilesLabel();
});

fileTemplate?.addEventListener("change", () => {
  refreshPickedFilesLabel();
});

btnUseBuiltInTemplate?.addEventListener("click", () => {
  useBuiltInTemplate();
});

btnCompleteNow?.addEventListener("click", () => {
  void (async () => {
    try {
      btnCompleteNow.disabled = true;
      await markServiceCompletedNow();
      await refreshContentState();
    } catch (error) {
      setServiceStatus(`Ошибка статуса: ${String(error && error.message ? error.message : error)}`, true);
    } finally {
      btnCompleteNow.disabled = false;
    }
  })();
});

btnCompleteByVoice?.addEventListener("click", () => {
  void (async () => {
    try {
      const response = await sendToAssistant("assistant:manualCommand", {
        text: "джарвиз отметь выполнено",
      });
      if (!response || !response.ok) {
        throw new Error((response && response.error) || "manual_voice_command_failed");
      }
      setServiceStatus("Команда отправлена: отметка выполнено", false);
    } catch (error) {
      setServiceStatus(`Ошибка голосовой команды: ${String(error && error.message ? error.message : error)}`, true);
    }
  })();
});

saveUrlsButton?.addEventListener("click", () => {
  void saveUrls();
});

openDamumedButton?.addEventListener("click", () => {
  void (async () => {
    const data = await getStorage([KEY_DAMUMED]);
    await openTab(toOriginUrl(data[KEY_DAMUMED]) || DEFAULT_DAMUMED);
  })();
});

openSandboxButton?.addEventListener("click", () => {
  void (async () => {
    const data = await getStorage([KEY_SANDBOX]);
    await openTab(toOriginUrl(data[KEY_SANDBOX]) || DEFAULT_SANDBOX);
  })();
});

btnOpenDamumedVoice?.addEventListener("click", () => {
  void (async () => {
    try {
      btnOpenDamumedVoice.disabled = true;
      setStatus("Открываю Damumed и включаю микрофон...", false);
      await openSiteAndActivateVoice("damumed");
      setStatus("Damumed открыт, микрофон включен", false);
      await refreshContentState();
    } catch (error) {
      setStatus(`Ошибка запуска: ${String(error && error.message ? error.message : error)}`, true);
    } finally {
      btnOpenDamumedVoice.disabled = false;
    }
  })();
});

btnOpenSandboxVoice?.addEventListener("click", () => {
  void (async () => {
    try {
      btnOpenSandboxVoice.disabled = true;
      setStatus("Открываю песочницу и включаю микрофон...", false);
      await openSiteAndActivateVoice("sandbox");
      setStatus("Песочница открыта, микрофон включен", false);
      await refreshContentState();
    } catch (error) {
      setStatus(`Ошибка запуска: ${String(error && error.message ? error.message : error)}`, true);
    } finally {
      btnOpenSandboxVoice.disabled = false;
    }
  })();
});

const activityLog = document.getElementById("activityLog");
const activityLines = [];

function logActivity(text, isError) {
  if (!activityLog) return;
  const now = new Date().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  activityLines.push({ time: now, text, isError: Boolean(isError) });
  if (activityLines.length > 20) activityLines.shift();
  activityLog.innerHTML = activityLines
    .slice()
    .reverse()
    .map((l) => `<div class="log-line${l.isError ? " log-error" : ""}">[${l.time}] ${l.text}</div>`)
    .join("");
}

// Patch setStatus to also log
const _origSetStatus = setStatus;
// (can't re-assign const, so we wrap at call sites)

void (async () => {
  await loadUrls();
  await checkBackend();
  await refreshContentState();
  refreshPickedFilesLabel();
  logActivity("Popup открыт, backend проверен");
  bindPushToTalkButton();

  window.setInterval(async () => {
    const prevStage = stageLabel ? stageLabel.textContent : "";
    await refreshContentState();
    await checkBackend();
    const newStage = stageLabel ? stageLabel.textContent : "";
    if (newStage && newStage !== prevStage) {
      logActivity(`Стадия: ${newStage}`);
    }
  }, 2000);
})();
