# Design Challenge Coach

A local Next.js web app to simulate a 60-minute product design challenge with speech-to-text, text-to-speech, Gemini AI coaching/evaluation, and a built-in whiteboard for low-fidelity wireframes.

## Features

- **Phase Timer**: 60-minute interview simulation with Discovery (20 min), Heads-down (25 min), and Presentation (15 min) phases
- **Speech-to-Text**: Capture your spoken thinking using Web Speech API (Chrome)
- **AI Coach**: Gemini-powered coaching with contextual nudges based on your progress
- **Text-to-Speech**: Spoken coach feedback using Gemini TTS
- **Whiteboard**: Professional infinite canvas powered by tldraw for sketching wireframes:
  - **Drawing Tools**: Rectangles, ellipses, triangles, arrows, lines, freehand pen
  - **Text & Labels**: Rich text editing with formatting options
  - **Image Support**: Paste images from clipboard (Ctrl/Cmd+V), drag & drop, or upload
  - **Auto-Persistence**: Canvas automatically saves to IndexedDB - survives page refresh!
  - **Advanced Features**: Multi-select, grouping, alignment guides, snapping
  - **Full History**: Unlimited undo/redo
  - **Infinite Canvas**: Pan and zoom anywhere
  - **Export**: PNG export with transparent or white background
  - **Keyboard Shortcuts**: V=select, R=rect, T=text, A=arrow, D=draw, E=eraser, Del=delete
- **Coverage Tracking**: Monitor which design areas you've covered (framing, constraints, users, ideation, systems, metrics, accessibility)
- **Evaluation**: Structured scorecard with rubric scores, strengths, weaknesses, and practice drills

## Installation

```bash
npm install
```

## Configuration

Create a `.env.local` file in the project root:

```
GEMINI_API_KEY=your_gemini_api_key_here
```

Get your API key from [Google AI Studio](https://aistudio.google.com/).

## Running

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in Chrome.

## Usage

1. **Start STT**: Click "Start STT" to begin speech recognition
2. **Speak your thinking**: Talk through your design process - coverage tags will turn green as you mention key concepts
3. **Sketch in Whiteboard**: Switch to the Whiteboard tab to draw wireframes
   - Use toolbar tools or keyboard shortcuts (V, R, T, A, D, E)
   - Drag to create shapes, arrows, and freehand drawings
   - Double-click text to edit
   - **Paste images**: Copy any image, click canvas, press Ctrl/Cmd+V
   - **Drag & drop**: Drag image files directly onto canvas
   - Multi-select with marquee or Shift+Click
   - Canvas auto-saves - refresh page to see persistence!
   - Export PNG when done
4. **Ask Coach**: Get contextual guidance during Discovery/Heads-down phases
5. **End & Debrief**: Generate a structured evaluation scorecard

## Tech Stack

- **Framework**: Next.js 16 (App Router), React 19, TypeScript
- **Styling**: Tailwind CSS, shadcn/ui components
- **AI**: Gemini via @google/genai
  - Coaching: gemini-2.0-flash
  - Evaluation: gemini-2.0-flash
  - TTS: gemini-2.5-flash-preview-tts (voice: Kore) + Deepgram fallback
- **Canvas**: tldraw v4 - Professional infinite canvas SDK
  - Auto-persistence via IndexedDB
  - Native image support (paste, drag & drop)
  - Full undo/redo, multi-select, grouping
- **Speech**: Web Speech API (Chrome)

## Project Structure

```
src/
├── app/
│   ├── api/
│   │   ├── coach/route.ts      # Coaching endpoint
│   │   ├── tts/route.ts        # Text-to-speech endpoint
│   │   └── evaluate/route.ts   # Evaluation endpoint
│   ├── components/
│   │   └── Whiteboard.tsx      # Canvas component
│   ├── layout.tsx
│   ├── page.tsx                # Main UI
│   └── globals.css
├── types/
│   └── speech.d.ts             # Web Speech API types
```

## Keyboard Shortcuts (Whiteboard)

- `V` - Select tool
- `R` - Rectangle tool
- `T` - Text tool
- `A` - Arrow tool
- `Delete/Backspace` - Delete selected
- `Ctrl/Cmd + Z` - Undo
- `Ctrl/Cmd + Shift + Z` - Redo
- `Space` (hold) - Pan mode
- `Ctrl/Cmd + Mouse Wheel` - Zoom

## Security

- GEMINI_API_KEY is read server-side only from .env.local
- All Gemini API calls are made from API routes, never client-side
- Request bodies are validated before processing

## Browser Requirements

- Chrome (for Web Speech API support)
- Other browsers will have limited functionality (no speech recognition)
