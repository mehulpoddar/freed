# Fread. — English → French Study Guide

A minimalist web app that turns pasted English text into an interactive French study guide. Zero friction: Paste text → Get interactive cards.

## Features

- **Sentence Cards** — English source + French translation side by side
- **Full Sentence Audio** — Hear the complete French sentence with natural flow
- **Tap-to-Speak Words** — Click any French word to hear its pronunciation
- **Grammar Lab** — Expandable breakdown of key grammar concepts per sentence
- **Persistent Input** — Text and settings survive page refresh via localStorage
- **Responsive** — Works on desktop and mobile

## Setup

1. Open `index.html` in a browser (or deploy to GitHub Pages)
2. Click the ⚙ gear icon and paste your [Gemini API key](https://aistudio.google.com/app/apikey)
3. Paste English text and click **Fread the Text**

## Deploy to GitHub Pages

Push this repo to GitHub, then go to **Settings → Pages → Source → main branch → / (root)** and save. Your app will be live at `https://<username>.github.io/fread/`.

## Tech Stack

- **Vanilla HTML / CSS / JS** — No build step, no framework
- **Gemini 2.5 Flash API** — Translation + grammar breakdown
- **Web Speech API** — French text-to-speech (fr-FR)