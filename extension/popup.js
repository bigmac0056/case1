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
const btnStartRecording = document.getElementById("btnStartRecording");
const btnFinishRecording = document.getElementById("btnFinishRecording");
const btnForceConfirm = document.getElementById("btnForceConfirm");
const stageLabel = document.getElementById("stageLabel");
const visitLinesCount = document.getElementById("visitLinesCount");
const lastTranscriptEl = document.getElementById("lastTranscript");
const btnApplyManual = document.getElementById("btnApplyManual");
const manualStatus = document.getElementById("manualStatus");

const fieldComplaints = document.getElementById("fieldComplaints");
const fieldAnamnesis = document.getElementById("fieldAnamnesis");
const fieldObjective = document.getElementById("fieldObjective");
const fieldDiagnosis = document.getElementById("fieldDiagnosis");
const fieldTreatment = document.getElementById("fieldTreatment");
const fieldDiary = document.getElementById("fieldDiary");

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

async function openTab(url) {
  if (!chrome.tabs || !chrome.tabs.create) {
    return;
  }
  await chrome.tabs.create({ url });
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

function fillManualFieldsFromDraft(draft) {
  const source = draft && typeof draft === "object" ? draft : {};
  fieldComplaints.value = String(source.complaints || "");
  fieldAnamnesis.value = String(source.anamnesis || "");
  fieldObjective.value = String(source.objective || "");
  fieldDiagnosis.value = String(source.diagnosis || "");
  fieldTreatment.value = String(source.treatment || "");
  fieldDiary.value = String(source.diary || "");
}

async function refreshContentState() {
  try {
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
      voiceDot.className = `dot ${listening ? "dot-on" : "dot-off"}`;
      voiceLabel.textContent = listening
        ? (backendLoopActive ? "микрофон вкл (backend stt)" : "микрофон вкл")
        : "микрофон выкл";

      if (statusText && localAiEnabled) {
        const endpoint = String(envelope.localAiEndpoint || "");
        if (endpoint) {
          statusText.textContent = `Локальная ИИ подключена: ${endpoint}`;
          statusBar.classList.remove("hidden");
        }
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
        fillManualFieldsFromDraft(draft);
      }

      // Suppress network mic error — it's expected on HTTP and fixed by backend STT restart
      if (envelope.recognitionError === "network") {
        // no-op: backend STT loop handles this transparently
      }
    }
  } catch (_error) {
    damumedWarn.classList.remove("hidden");
    voiceDot.className = "dot dot-off";
    voiceLabel.textContent = "нет связи с вкладкой";
  }
}

async function loadUrls() {
  const data = await getStorage([KEY_DAMUMED, KEY_SANDBOX, KEY_LOCAL_AI]);
  if (damumedInput) {
    damumedInput.value = normalizeUrl(data[KEY_DAMUMED]) || DEFAULT_DAMUMED;
  }
  if (sandboxInput) {
    sandboxInput.value = normalizeUrl(data[KEY_SANDBOX]) || DEFAULT_SANDBOX;
  }

  const currentAi = normalizeUrl(data[KEY_LOCAL_AI]);
  if (!currentAi) {
    await setStorage({ [KEY_LOCAL_AI]: "http://127.0.0.1:8000/api/jarvis/process-visit" });
  }
}

async function saveUrls() {
  const damumed = normalizeUrl(damumedInput ? damumedInput.value : "");
  const sandbox = normalizeUrl(sandboxInput ? sandboxInput.value : "");

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
    const response = await sendToContent("assistant:toggleListening", {});
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
    setManualStatus(`Внесено. DOM проверка: ${verification.okCount}/${verification.total}`, false);
  } catch (error) {
    setManualStatus(`Ошибка ручного внесения: ${String(error && error.message ? error.message : error)}`, true);
  }
}

btnTalk?.addEventListener("click", () => {
  void onTalkClick();
});

btnStartRecording?.addEventListener("click", async () => {
  try {
    const response = await sendToContent("assistant:startRecording", {});
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
    const response = await sendToContent("assistant:finishRecording", {});
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

saveUrlsButton?.addEventListener("click", () => {
  void saveUrls();
});

openDamumedButton?.addEventListener("click", () => {
  void (async () => {
    const data = await getStorage([KEY_DAMUMED]);
    await openTab(normalizeUrl(data[KEY_DAMUMED]) || DEFAULT_DAMUMED);
  })();
});

openSandboxButton?.addEventListener("click", () => {
  void (async () => {
    const data = await getStorage([KEY_SANDBOX]);
    await openTab(normalizeUrl(data[KEY_SANDBOX]) || DEFAULT_SANDBOX);
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
  logActivity("Popup открыт, backend проверен");

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
