const STORAGE_KEYS = {
  apiBaseUrl: "backend_api_base_url",
  siteUrl: "site_url",
  token: "backend_token",
  authState: "auth_state",
  authProvider: "auth_provider",
};

const DEFAULTS = {
  apiBaseUrl: "http://127.0.0.1:8000",
  siteUrl: "",
  token: "",
  authState: "signed_out",
  authProvider: "none",
};

async function getStorage(keys) {
  return chrome.storage.local.get(keys);
}

async function setStorage(values) {
  return chrome.storage.local.set(values);
}

async function getBackendConfig() {
  const data = await getStorage([
    STORAGE_KEYS.apiBaseUrl,
    STORAGE_KEYS.siteUrl,
    STORAGE_KEYS.token,
    STORAGE_KEYS.authState,
    STORAGE_KEYS.authProvider,
  ]);
  return {
    apiBaseUrl: data[STORAGE_KEYS.apiBaseUrl] || DEFAULTS.apiBaseUrl,
    siteUrl: data[STORAGE_KEYS.siteUrl] || DEFAULTS.siteUrl,
    token: data[STORAGE_KEYS.token] || DEFAULTS.token,
    authState: data[STORAGE_KEYS.authState] || DEFAULTS.authState,
    authProvider: data[STORAGE_KEYS.authProvider] || DEFAULTS.authProvider,
  };
}

function normalizePath(path) {
  if (!path) {
    return "/";
  }
  return path.startsWith("/") ? path : `/${path}`;
}

function toResponseError(error) {
  return {
    ok: false,
    error: error instanceof Error ? error.message : String(error),
  };
}

async function performRequest(path, options) {
  const config = await getBackendConfig();
  if (!config.apiBaseUrl) {
    return { ok: false, error: "api_base_url_not_set" };
  }

  const url = `${config.apiBaseUrl}${normalizePath(path)}`;
  const requestOptions = {
    method: options?.method || "GET",
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers || {}),
    },
  };

  if (config.token) {
    requestOptions.headers.Authorization = `Bearer ${config.token}`;
  }

  if (options?.body !== undefined) {
    requestOptions.body =
      typeof options.body === "string" ? options.body : JSON.stringify(options.body);
  }

  try {
    const response = await fetch(url, requestOptions);
    const raw = await response.text();
    let data = raw;
    try {
      data = raw ? JSON.parse(raw) : null;
    } catch (_error) {
      data = raw;
    }

    return {
      ok: response.ok,
      status: response.status,
      data,
      error: response.ok ? null : `http_${response.status}`,
    };
  } catch (error) {
    return toResponseError(error);
  }
}

chrome.runtime.onInstalled.addListener(async () => {
  const data = await getStorage([
    STORAGE_KEYS.apiBaseUrl,
    STORAGE_KEYS.siteUrl,
    STORAGE_KEYS.token,
    STORAGE_KEYS.authState,
    STORAGE_KEYS.authProvider,
  ]);
  const values = {};
  if (!data[STORAGE_KEYS.apiBaseUrl]) {
    values[STORAGE_KEYS.apiBaseUrl] = DEFAULTS.apiBaseUrl;
  }
  if (!data[STORAGE_KEYS.token]) {
    values[STORAGE_KEYS.token] = DEFAULTS.token;
  }
  if (!data[STORAGE_KEYS.siteUrl]) {
    values[STORAGE_KEYS.siteUrl] = DEFAULTS.siteUrl;
  }
  if (!data[STORAGE_KEYS.authState]) {
    values[STORAGE_KEYS.authState] = DEFAULTS.authState;
  }
  if (!data[STORAGE_KEYS.authProvider]) {
    values[STORAGE_KEYS.authProvider] = DEFAULTS.authProvider;
  }
  if (Object.keys(values).length > 0) {
    await setStorage(values);
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    try {
      switch (message?.type) {
        case "backend:getConfig": {
          const config = await getBackendConfig();
          sendResponse({ ok: true, ...config });
          return;
        }

        case "backend:setApiBaseUrl": {
          await setStorage({ [STORAGE_KEYS.apiBaseUrl]: message.apiBaseUrl || "" });
          sendResponse({ ok: true });
          return;
        }

        case "backend:setSiteUrl": {
          await setStorage({ [STORAGE_KEYS.siteUrl]: message.siteUrl || "" });
          sendResponse({ ok: true });
          return;
        }

        case "backend:getToken": {
          const data = await getStorage([STORAGE_KEYS.token]);
          sendResponse({ ok: true, token: data[STORAGE_KEYS.token] || "" });
          return;
        }

        case "backend:setToken": {
          await setStorage({ [STORAGE_KEYS.token]: message.token || "" });
          sendResponse({ ok: true });
          return;
        }

        case "backend:clearToken": {
          await setStorage({ [STORAGE_KEYS.token]: "" });
          sendResponse({ ok: true });
          return;
        }

        case "auth:getState": {
          const data = await getStorage([STORAGE_KEYS.authState, STORAGE_KEYS.authProvider]);
          sendResponse({
            ok: true,
            state: data[STORAGE_KEYS.authState] || DEFAULTS.authState,
            provider: data[STORAGE_KEYS.authProvider] || DEFAULTS.authProvider,
          });
          return;
        }

        case "auth:setState": {
          const state = message.state || DEFAULTS.authState;
          const provider = message.provider || DEFAULTS.authProvider;
          await setStorage({
            [STORAGE_KEYS.authState]: state,
            [STORAGE_KEYS.authProvider]: provider,
          });
          sendResponse({ ok: true });
          return;
        }

        case "auth:signOut": {
          await setStorage({
            [STORAGE_KEYS.authState]: "signed_out",
            [STORAGE_KEYS.authProvider]: "none",
            [STORAGE_KEYS.token]: "",
          });
          sendResponse({ ok: true });
          return;
        }

        case "backend:request": {
          const result = await performRequest(message.path, message.options);
          sendResponse(result);
          return;
        }

        case "backend:healthcheck": {
          const result = await performRequest("/health", { method: "GET" });
          sendResponse(result);
          return;
        }

        case "content:selectionAction": {
          sendResponse({ ok: true, accepted: true });
          return;
        }

        case "assistant:getStorage": {
          const keys = Array.isArray(message.keys) ? message.keys : [];
          const data = await getStorage(keys);
          sendResponse({ ok: true, data: data || {} });
          return;
        }

        case "assistant:setStorage": {
          const values = message.values && typeof message.values === "object" ? message.values : {};
          await setStorage(values);
          sendResponse({ ok: true });
          return;
        }

        case "assistant:navigateTab": {
          const { url } = message;
          if (!url) { sendResponse({ ok: false, error: "no_url" }); return; }
          try {
            const origin = new URL(url).origin;
            const tabs = await chrome.tabs.query({});
            const existing = tabs.find((t) => t.url && t.url.startsWith(origin));
            if (existing) {
              await chrome.tabs.update(existing.id, { active: true, url });
              if (existing.windowId) await chrome.windows.update(existing.windowId, { focused: true });
              sendResponse({ ok: true, tabId: existing.id, reused: true });
            } else {
              const tab = await chrome.tabs.create({ url });
              sendResponse({ ok: true, tabId: tab.id, reused: false });
            }
          } catch (navErr) {
            sendResponse({ ok: false, error: String(navErr && navErr.message ? navErr.message : navErr) });
          }
          return;
        }

        default:
          sendResponse({ ok: false, error: "unknown_message_type" });
      }
    } catch (error) {
      sendResponse(toResponseError(error));
    }
  })();

  return true;
});
