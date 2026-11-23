<div align="center">

# Qureo Solver

**Beta 2 · by Mohamed Reda (M.R.S.W)**

An AI study assistant for interactive coding lessons: it reads the lesson, explains, hints, writes the answer into the page, runs it, checks the result, and fixes it until it passes.

Built with **Expo SDK 58**, **React Native** and **React Native WebView** · Android & iOS

</div>

---

## Contents

- [How it works](#how-it-works)
- [Features](#features)
- [Getting started](#getting-started)
- [Using the app](#using-the-app)
- [AI providers](#ai-providers)
- [Project structure](#project-structure)
- [Testing](#testing)
- [Building and releasing](#building-and-releasing)
- [Privacy and security](#privacy-and-security)
- [Known limitations](#known-limitations)
- [Troubleshooting](#troubleshooting)
- [Responsible use](#responsible-use)
- [Roadmap](#roadmap)

## How it works

The app shows the lesson site in a WebView and injects a small script (the *page bridge*) that can read the page and act on it. The AI never touches the page directly; the app sits in between.

```text
 Lesson page (WebView)  ──read──►  lesson text, editable fields, run output, errors
        ▲                                         │
        │ write code / click Run                  ▼
   Page bridge  ◄────────  Solve loop  ────►  AI provider (Gemini / OpenAI-compatible / Anthropic)
                              │
                 ┌────────────┴─────────────┐
                 │ 1. generate code          │
                 │ 2. write it into the page │
                 │ 3. press Run, read output │
                 │ 4. AI checks: PASS / FAIL │
                 │ 5. FAIL → corrected code, repeat (up to N rounds)
                 └───────────────────────────┘
```

A round ends early on `PASS`. If the model answers `UNSURE`, the app stops and leaves the code alone so you can judge it yourself. Code that was already tried and failed is never sent again without a "produce something different" instruction.

## Features

**Study tools**
- **Auto-solve (⚡):** the full write → run → verify → fix loop above, with an instant **Stop** button.
- **Explain, Hint, Solution, Review:** the explanation never gives away the final answer. Hints escalate from level 1 to 3 each time you press them on the same page. Review runs your code first so it can see the real output.
- **Ask:** free-form questions about the lesson or your code.
- **Code blocks you can use:** replies render code in monospace blocks with **Copy** and **Write into page** buttons.

**Workspace**
- Three layouts: **أدوات** (tools), **متوازن** (balanced), **صفحة** (page), plus back and reload controls.
- The lesson page stays loaded when you switch tabs, so you never lose progress.
- Android hardware Back steps back inside the lesson site, with a load-progress bar and a retry screen when a page fails.

**AI**
- Gemini, Anthropic and any OpenAI-compatible service (OpenRouter, Groq, DeepSeek, local servers), with automatic provider detection from the key.
- Friendly Arabic error messages (bad key, wrong model, quota, outage), retry with backoff that honours `Retry-After`, a 60 s timeout, and abort at every step.
- **Test connection** button to validate key, model and base URL before you start.

**Look and feel**
- Four themes: **Obsidian**, **Royal Indigo**, **Crimson Guard**, **Arctic Light**. Every text/background pairing meets WCAG AA (4.5:1), and a test enforces it.
- Touch targets of at least 44 px, screen-reader labels, and reduced-motion support.

## Getting started

**Requirements:** Node.js **22.13 or newer** (required by React Native 0.88 and Expo 58), npm, and the Expo Go app or an Android/iOS emulator.

```bash
npm install
npx expo start
```

Then press `a` (Android), `i` (iOS) or scan the QR code with Expo Go.

| Script | What it does |
|---|---|
| `npm start` | Start the Expo dev server |
| `npm run android` / `npm run ios` | Start and open on a device or emulator |
| `npm test` | Run the unit tests |
| `npm run doctor` | Run `expo-doctor` to check dependencies |
| `npm run build:apk` | EAS cloud build, installable APK (preview profile) |
| `npm run build:android` | EAS production build (AAB for Google Play) |

## Using the app

1. **First launch:** read and accept the privacy policy and terms, and pick a theme.
2. Open **AI & Keys**, paste your API key, and press **Save** then **Test connection**.
3. Check the page URL (default `https://me-tp.qureo.education`). It is applied when you press Save.
4. Go to **Workspace**, open a lesson in the page, and press **⚡ حل تلقائي**, or use Explain / Hint / Solution / Review.

**Settings reference**

| Setting | Default | Notes |
|---|---|---|
| Provider | `auto` | Detected from the key prefix, then from the Base URL; otherwise treated as OpenAI-compatible |
| Model | provider default | Leave empty to use the default (below) |
| Base URL | provider default | For OpenRouter, Groq, local servers, proxies |
| Retries | 4 (1–10) | Per AI request: network errors, 429, 5xx |
| Fix rounds | 3 (1–8) | Check-and-correct rounds in auto-solve |

## AI providers

| Provider | Key looks like | Default model | Endpoint |
|---|---|---|---|
| Gemini | `AIza…` | `gemini-2.5-flash` | `generativelanguage.googleapis.com/v1beta` |
| Anthropic | `sk-ant-…` | `claude-sonnet-5-5` | `api.anthropic.com/v1/messages` |
| OpenAI-compatible | anything else | `gpt-4o-mini` | `api.openai.com/v1/chat/completions` (or your Base URL) |

Base URLs are normalised, so `…/v1`, `…/v1/` and the full path all work. You can also type any model name. The presets are only shortcuts.

## Project structure

```text
.
├── App.js                      State, persistence, ask/solve flows, tab shell
├── index.js                    Expo entry point
├── app.json                    Expo config (name, icons, splash, plugins)
├── eas.json                    EAS build profiles (preview APK, production AAB)
├── package.json
├── assets/                     Icon, adaptive-icon layers, splash, favicon, brand mark
├── src/
│   ├── aiClient.js             Providers, prompts, retries, code-block parsing
│   ├── solver.js               The write → run → verify → fix loop (no React)
│   ├── pageBridge.js           Script injected into the lesson page
│   ├── useBridge.js            React hook: request/response channel to the bridge
│   ├── storage.js              Settings + API key (secure store) + key migration
│   ├── url.js                  URL validation
│   ├── themes.js               The four themes and their colour tokens
│   ├── legalContent.js         Privacy policy and terms text
│   ├── components/
│   │   ├── ui.js               Buttons, chips, cards, inputs, brand logo/mark
│   │   └── ResultCard.js       Renders AI replies with copyable code blocks
│   └── screens/
│       ├── WelcomeScreen.js
│       ├── WorkspaceScreen.js  WebView + actions + results + log
│       ├── SettingsScreen.js   AI & Keys
│       └── LegalScreen.js      Themes, legal text, reset
├── tests/                      Unit tests (node:test + jsdom)
└── store/icon-512.png          Google Play icon
```

## Testing

```bash
npm test
```

The suite covers the page bridge (in jsdom), the solve loop (on a simulated lesson page), the AI client (mocked network), URL validation, and theme contrast. The tests don't need a device. They do **not** cover the real UI or the live lesson site, so do a quick manual run after changes: save a key → Test connection → open a lesson → ⚡.

If you edit `pageBridge.js`: it is a template literal, so backslashes that must reach the page are doubled (`\\s`) and it must not contain backticks. The bridge tests will catch most mistakes.

## Building and releasing

```bash
npm install -g eas-cli
eas login
npm run build:apk        # shareable test APK
npm run build:android    # production bundle for Google Play
```

- The Expo `slug` (`qureo-mobile`) and Android package (`com.mohamedthedev.qureomobile`) are tied to the existing EAS project. Don't change them for an app that is already registered.
- Before publishing, host the privacy policy (from `src/legalContent.js`) at a **public URL**, as Google Play requires one. Have it reviewed; it is a plain-language notice, not legal advice.
- Don't use wording in the store listing that implies the app is affiliated with the QUREO platform.

## Privacy and security

- **API key:** stored in the system keychain/keystore (`expo-secure-store`). Keys saved by older versions are moved there automatically and deleted from plain storage. If secure storage is unavailable (e.g. on web), the app tells you the key is stored locally only.
- **What leaves the device:** lesson text, field contents and run output go **directly** to the AI provider you configured, not through any server of ours. There are no accounts, ads or analytics.
- **Keys in requests:** sent in headers, never in URLs.
- **Prompt-injection guard:** page content is marked as untrusted data in the system prompt.
- **WebView:** top-level navigation is limited to `http(s)`, and typed URLs are validated.
- **Reset:** *Themes & Legal → Reset* removes the key, settings, theme and logs from the device.

## Known limitations

- Detection of editable fields and the Run button is selector-based, so it may need tuning if the lesson site changes. Plain fields and contenteditable are supported, with best-effort support for Monaco, CodeMirror and Ace.
- Editors inside an **iframe** can't be reached (WebView script injection runs in the main frame only).
- The Run button is found by its label (Arabic or English "run"/"execute"), and the app never presses submit-style buttons.
- Model output can be wrong. Auto-solve is bounded by the fix-rounds setting and can end without a pass.
- The layout is not fully right-to-left yet. Arabic text aligns correctly, but the screen structure is left-to-right.

## Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| "مفتاح API غير صالح…" | Wrong or expired key, or the key doesn't match the provider. Use **Test connection**. |
| "الموديل أو الـ Endpoint غير موجود" | Model name typo or wrong Base URL. Clear the model field to use the default. |
| "تجاوزت حد الطلبات أو الرصيد" | Quota or rate limit at the provider. Wait, or check your billing. |
| "انتهت مهلة الاتصال بالصفحة" | The lesson page hasn't finished loading. Tap ↻ and try again. |
| "الجسر غير متصل بهذه الصفحة" | The bridge didn't load on this page. Reload it. |
| "لم يتم العثور على حقول قابلة للكتابة" | No editable field is visible. Scroll the field into view or open the exercise first. |
| Code is written but not run | No recognisable Run button. Press Run yourself; the code is already in place. |

## Responsible use

Qureo Solver is meant for studying, reviewing and experimenting with learning material. You are responsible for your API key and its costs, for following the rules of the platform you use it on, and for your institution's academic-integrity policy. Always read and understand the code before relying on it.

## Roadmap

- [ ] Full RTL layout
- [ ] Iframe-aware bridge
- [ ] Streaming AI replies
- [ ] Per-site selector profiles
- [ ] Persistent history of past solves

## Credits

Created by **Mohamed Reda** · M.R.S.W

*License: not specified yet. Add a `LICENSE` file before sharing the source publicly.*
