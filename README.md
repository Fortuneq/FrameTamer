# FrameTamer

A desktop video editor in the spirit of Descript: edit video by editing its transcript. Videos are transcribed locally, and Claude handles the tedious parts — finding filler words, generating chapters and applying edits described in plain language.

## Features

- **Transcript-based editing** — cut and rearrange video by editing text
- **Local transcription** — faster-whisper, no audio leaves the machine
- **Filler-word detection** — finds filler words in Russian and English speech so they can be cut
- **Chapters** — automatic chapter generation from the transcript
- **Smart edit** — describe an edit in natural language and let Claude apply it
- **Waveform timeline** — wavesurfer.js waveform with precise range selection
- **Export** — renders the edited timeline with ffmpeg
- **Desktop app** — Electron shell with native open/save dialogs

## Architecture

```
frontend/       — React 19, Vite, TypeScript, Tailwind CSS v4, TanStack Query, wavesurfer.js
backend/        — FastAPI: projects, media, transcription, editor, AI and export routers
backend-node/   — Node/TypeScript service that runs Claude agent tasks for projects
electron-app/   — Electron wrapper; builds the frontend and the Node backend into a desktop app (electron-builder)
```

**Backend stack:** FastAPI, faster-whisper, Anthropic SDK, ffmpeg-python, librosa, soundfile.

## Getting started

Requirements: Python 3, Node.js, ffmpeg in `PATH`, an Anthropic API key.

```bash
# backend
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env          # set ANTHROPIC_API_KEY, choose WHISPER_MODEL / WHISPER_DEVICE
python run.py --reload        # http://localhost:8000

# frontend
cd ../frontend
npm install
npm run dev

# desktop app (dev mode)
cd ../electron-app
npm install
npm run dev

# build a distributable
npm run build
```

## AI endpoints

| Endpoint | Purpose |
|---|---|
| `POST /api/projects/{id}/ai/filler-words` | detect filler words |
| `POST /api/projects/{id}/ai/chapters` | generate chapters |
| `POST /api/projects/{id}/ai/smart-edit` | apply an edit described in natural language |
