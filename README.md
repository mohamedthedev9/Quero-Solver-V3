# Qureo Solver Beta 1 by Mohamed Reda

A cross-platform mobile study and interactive exercise automation workspace built with **Expo**, **React Native**, and **React Native WebView**.

## Features

- **M.R.S.W Branded Interface & Animations**: Smooth spring interactions, floating/pulsing brand badge, section transitions, keyboard avoidance, and one-tap output copying.
- **4 Switchable Themes**:
  - **M.R.S.W Obsidian** (`obsidian`) — Deep pitch-black surfaces with high-contrast silver/white accents.
  - **Royal Indigo** (`indigo`) — Dark slate surfaces with electric indigo accents.
  - **Crimson Guard** (`crimson`) — High-contrast charcoal surfaces with deep crimson accents.
  - **Arctic Light** (`light`) — Bright workspace theme for daytime reading.
- **Flexible Workspace Layout**: Switch between **أدوات** (`focus-panel`), **متوازن** (`split`), and **صفحة** (`focus-web`), plus quick WebView back and reload controls.
- **Multi-Provider AI Support**: Works with **Gemini** (`AIza...`), **OpenAI-compatible** endpoints & custom base URLs (e.g. OpenRouter, Groq, DeepSeek), and **Anthropic** (`sk-ant-...`), with automatic or manual provider detection, model presets, request timeouts, abort support, and retry backoff.
- **Automated Study & Fix Loop**: Reads lesson text, editable inputs, run output, and errors via an injected WebView bridge (`pageBridge.js`), applies code blocks cleanly, avoids repeating identical code signatures, and runs verification/correction rounds with immediate stop control.

## Project Structure

```text
.
├── App.js
├── app.json
├── eas.json
├── package.json
└── src/
    ├── aiClient.js
    ├── legalContent.js
    ├── pageBridge.js
    └── themes.js
