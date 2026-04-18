(function () {
  async function send(message) {
    if (typeof chrome === "undefined" || !chrome.runtime || !chrome.runtime.sendMessage) {
      return { ok: false, error: "runtime_unavailable" };
    }

    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(message, (response) => {
          if (chrome.runtime.lastError) {
            resolve({ ok: false, error: chrome.runtime.lastError.message });
            return;
          }
          resolve(response || { ok: false, error: "empty_response" });
        });
      } catch (error) {
        resolve({ ok: false, error: String(error) });
      }
    });
  }

  window.AqbobekBridge = {
    async getConfig() {
      return send({ type: "backend:getConfig" });
    },

    async setApiBaseUrl(apiBaseUrl) {
      return send({ type: "backend:setApiBaseUrl", apiBaseUrl });
    },

    async setSiteUrl(siteUrl) {
      return send({ type: "backend:setSiteUrl", siteUrl });
    },

    async getToken() {
      return send({ type: "backend:getToken" });
    },

    async setToken(token) {
      return send({ type: "backend:setToken", token });
    },

    async clearToken() {
      return send({ type: "backend:clearToken" });
    },

    async getAuthState() {
      return send({ type: "auth:getState" });
    },

    async setAuthState(state, provider) {
      return send({ type: "auth:setState", state, provider });
    },

    async signOut() {
      return send({ type: "auth:signOut" });
    },

    async request(path, options) {
      return send({ type: "backend:request", path, options: options || {} });
    },

    async healthcheck() {
      return send({ type: "backend:healthcheck" });
    },

    async reportSelectionAction(payload) {
      return send({ type: "content:selectionAction", payload: payload || {} });
    },

    async assistantGetStorage(keys) {
      return send({ type: "assistant:getStorage", keys: Array.isArray(keys) ? keys : [] });
    },

    async assistantSetStorage(values) {
      return send({ type: "assistant:setStorage", values: values || {} });
    },
  };
})();
