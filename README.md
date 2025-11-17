# Design Challenge Coach

A local Next.js web app to simulate a 60-minute product design challenge with speech-to-text, text-to-speech, Gemini AI coaching/evaluation, and a built-in whiteboard for low-fidelity wireframes.

## Features

- **Phase Timer**: 60-minute interview simulation with Discovery (20 min), Heads-down (25 min), and Presentation (15 min) phases
- **Speech-to-Text**: Capture your spoken thinking using Web Speech API (Chrome)
- **AI Coach**: Gemini-powered coaching with contextual nudges based on your progress
- **Text-to-Speech**: Spoken coach feedback using Gemini TTS
- **Whiteboard**: Built-in canvas for sketching low-fi wireframes with:
  - Rectangle/frame drawing
  - Text labels
  - Arrows/connectors with snapping
  - Ellipse shapes
  - Multi-select and marquee selection
  - Undo/redo history
  - Pan and zoom
  - PNG export
  - Keyboard shortcuts (V=select, R=rect, T=text, A=arrow, Del=delete)
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
   - Use toolbar tools or keyboard shortcuts
   - Drag to create shapes
   - Double-click text to edit
   - Multi-select with marquee
   - Export PNG when done
4. **Ask Coach**: Get contextual guidance during Discovery/Heads-down phases
5. **End & Debrief**: Generate a structured evaluation scorecard

## Tech Stack

- **Framework**: Next.js (App Router), React 18, TypeScript
- **Styling**: Tailwind CSS
- **AI**: Gemini via @google/genai
  - Coaching: gemini-2.0-flash
  - Evaluation: gemini-2.0-flash
  - TTS: gemini-2.5-flash-preview-tts (voice: Kore)
- **Canvas**: SVG-based custom implementation

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
