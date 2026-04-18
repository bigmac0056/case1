# Aqbobek Extension (Frontend Prototype)

This folder contains a Chrome Extension (Manifest V3) frontend prototype prepared for backend integration.

## What is already ready

- Popup UI with screens: Home, Review, Quiz, Focus, Drive.
- Selection Action overlay on any webpage via content script.
- Backend bridge (`backend-bridge.js`) for unified messaging between UI/content and background.
- Background service worker (`background.js`) with:
  - API base URL + token storage in `chrome.storage.local`
  - Generic API request proxy (`backend:request`)
  - Healthcheck endpoint call (`backend:healthcheck` -> `/health`)
- First-run auth gate in popup:
  - "Войти"
  - "Войти через Google"
  - "Нет аккаунта? Создать"
  - Each option redirects user to your website routes.

## Files

- `manifest.json` - extension config
- `popup.html`, `popup.css`, `popup.js` - popup frontend
- `content.css`, `content.js` - in-page selection action UI
- `backend-bridge.js` - reusable bridge API for frontend scripts
- `background.js` - service worker, storage, request forwarding

## Backend integration contract

Message types accepted by `background.js`:

- `backend:getConfig`
- `backend:setApiBaseUrl` (`apiBaseUrl`)
- `backend:setSiteUrl` (`siteUrl`)
- `backend:getToken`
- `backend:setToken` (`token`)
- `backend:clearToken`
- `backend:request` (`path`, `options`)
- `backend:healthcheck`
- `auth:getState`
- `auth:setState` (`state`, `provider`)
- `auth:signOut`
- `content:selectionAction` (`payload`) - currently accepted stub

Expected response shape (generic):

- success: `{ ok: true, ... }`
- failure: `{ ok: false, error: "..." }`

## Next backend steps (when you decide)

1. Set API base URL and token from popup settings.
2. Replace mock handlers in `popup.js` with `AqbobekBridge.request(...)` calls.
3. Implement server endpoints for cards, quiz generation, analytics sync.
4. Persist user progress on backend and hydrate popup on open.

## Load in Chrome

1. Open `chrome://extensions`
2. Enable Developer mode
3. Click **Load unpacked**
4. Select this `extension` folder
