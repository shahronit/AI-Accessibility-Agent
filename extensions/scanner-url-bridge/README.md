# Send tab URL to scanner (Chrome)

This minimal extension reads the **current tab’s URL** (after you sign in on a site) and opens your **A11yAgent** `/scan` page with `prefillUrl` set. It does not read cross-origin pages from the web app itself; it uses the extension permission model.

## Install (load unpacked)

1. Open Chrome → **Extensions** → enable **Developer mode**.
2. **Load unpacked** → choose this folder: `extensions/scanner-url-bridge`.
3. Pin the extension if you like.
4. Click the icon, set **Scanner app base URL** to your app (e.g. `http://localhost:3000` or your deployed origin), then **Open scanner with this tab’s URL**.

The base URL is remembered in extension storage.

## Alternative: bookmarklet

No install: on the scan page, open **Sign-in prep** and use **Copy bookmarklet** or drag the link to your bookmarks bar.
