# End-to-End Test Plan - Whiteboarding Interview Tool

## Summary of Fixed Issues

We fixed 6 critical bugs identified by QA testing:
1. **Audio memory leak** - Now revoking old blob URLs
2. **Whiteboard not resetting** - Added reset() method to clear canvas
3. **Mute not stopping audio** - toggleMute() now pauses active audio
4. **TTS overlap** - New audio stops previous before playing
5. **Timer phase advance race condition** - Using functional updates
6. **Canvas capture hanging** - Added 5-second timeout

## Test Scenarios

### 1. SESSION INITIALIZATION FLOW
**Test Case 1.1: First Session Start**
- [ ] Go to landing page
- [ ] Enter custom prompt OR click "Surprise me"
- [ ] Verify amber "Setting up..." banner appears with bouncing dots
- [ ] Verify welcome message appears in transcript immediately
- [ ] Wait for TTS to speak welcome message (may take 10-30 seconds on cold start)
- [ ] Verify green "Listening..." banner appears after TTS
- [ ] Verify amber banner changes to "Say I'm ready to begin"
- [ ] Say "I'm ready"
- [ ] Verify coach gives the actual design prompt
- [ ] Verify session is now active

**Test Case 1.2: Browser Without STT Support**
- [ ] Open in Firefox or Safari
- [ ] Click "Start STT" button
- [ ] Verify alert appears about Chrome requirement
- [ ] Verify manual text input still works

### 2. SPEECH-TO-TEXT FLOW
**Test Case 2.1: Live Transcription**
- [ ] Start session and say "I'm ready"
- [ ] Begin speaking about the design problem
- [ ] Verify green "Listening..." banner shows at top
- [ ] Verify interim text appears in transcript as "Speaking..." bubble
- [ ] Verify final text appears as your message when you pause
- [ ] Verify coach responds after ~1.5 seconds with contextual response

**Test Case 2.2: Toggle Listening**
- [ ] Click "Stop STT" button
- [ ] Verify green banner disappears
- [ ] Verify STT stops capturing audio
- [ ] Click "Start STT" again
- [ ] Verify listening resumes

### 3. COACH RESPONSE & AUDIO
**Test Case 3.1: Coach Thinking Indicator**
- [ ] Type or speak a message
- [ ] Verify "Coach is thinking..." purple bubble appears
- [ ] Verify bouncing dots animation
- [ ] Verify indicator disappears when coach responds

**Test Case 3.2: Audio Playback**
- [ ] Verify coach response is spoken aloud (if not muted)
- [ ] Verify "Speaking..." status in sidebar
- [ ] Test Pause button - audio should pause
- [ ] Test Resume button - audio should continue
- [ ] Test Replay button - audio should start from beginning

**Test Case 3.3: Mute Functionality**
- [ ] Click Mute while coach is speaking
- [ ] Verify audio stops immediately (FIXED BUG)
- [ ] Verify future responses are not spoken
- [ ] Unmute and trigger new response
- [ ] Verify audio resumes for new responses

**Test Case 3.4: No Audio Overlap**
- [ ] Trigger coach response
- [ ] While speaking, quickly trigger another response
- [ ] Verify first audio stops cleanly
- [ ] Verify second audio plays without overlap (FIXED BUG)

### 4. WHITEBOARD INTEGRATION
**Test Case 4.1: Drawing Tools**
- [ ] Select Rectangle tool (R key) - draw a box
- [ ] Select Text tool (T key) - add text label
- [ ] Select Arrow tool (A key) - connect elements
- [ ] Select Ellipse tool - draw oval
- [ ] Verify all elements render correctly

**Test Case 4.2: Canvas Capture with Coach**
- [ ] Draw some elements on whiteboard
- [ ] Type a message about your design
- [ ] Verify coach's response references your whiteboard
  - Example: "I see you have X connected to Y..."
- [ ] This confirms screenshot is sent to Gemini

**Test Case 4.3: Selection and Manipulation**
- [ ] Click element to select (blue handles appear)
- [ ] Drag to move element
- [ ] Resize using corner handles
- [ ] Multi-select with marquee drag
- [ ] Undo (Cmd+Z) / Redo (Cmd+Shift+Z)

**Test Case 4.4: Keyboard Shortcuts**
- [ ] V - Select tool
- [ ] R - Rectangle tool
- [ ] T - Text tool
- [ ] A - Arrow tool
- [ ] Ctrl/Cmd + Z - Undo
- [ ] Ctrl/Cmd + Shift + Z - Redo
- [ ] Spacebar + drag - Pan canvas

### 5. PHASE TRANSITIONS
**Test Case 5.1: Manual Phase Switch**
- [ ] Click "Heads-down" button in sidebar
- [ ] Verify timer resets to 25:00
- [ ] Verify phase indicator updates
- [ ] Click "Presentation" button
- [ ] Verify timer resets to 15:00

**Test Case 5.2: Auto Phase Advance (Wait or set timer low)**
- [ ] Let timer count down to 0:00
- [ ] Verify phase automatically advances (FIXED BUG)
- [ ] Verify timer shows correct duration for new phase
- [ ] Verify no flickering or incorrect duration

### 6. NEW SESSION RESET
**Test Case 6.1: Complete Reset**
- [ ] Start session, draw on whiteboard, chat with coach
- [ ] Click "New Session" button in sidebar
- [ ] Verify returns to landing page
- [ ] Verify whiteboard is cleared (FIXED BUG)
- [ ] Start new session
- [ ] Verify messages are empty
- [ ] Verify timer resets to 20:00
- [ ] Verify coverage tags are cleared
- [ ] Verify no memory warnings in console (FIXED BUG)

**Test Case 6.2: Audio Cleanup**
- [ ] Trigger coach response, let it speak
- [ ] Click "New Session"
- [ ] Verify audio stops
- [ ] Open browser DevTools > Memory
- [ ] Take heap snapshot
- [ ] Start another session, trigger more audio
- [ ] Verify no blob URL accumulation (FIXED BUG)

### 7. EVALUATION & DEBRIEF
**Test Case 7.1: End Session**
- [ ] Have a conversation with at least 5 messages
- [ ] Draw some elements on whiteboard
- [ ] Click "End & Debrief" button
- [ ] Verify loading state appears
- [ ] Verify evaluation modal opens

**Test Case 7.2: Rubric Scores**
- [ ] Check that rubric categories appear (from rubrics/sample-rubric.json):
  - Problem Framing
  - Ideation Breadth
  - Systems Thinking
  - Low-Fidelity Wireframing
  - UI/UX Pattern Knowledge
  - Prioritization & Scoping
  - Metrics Discipline
  - Communication Clarity
- [ ] Verify scores are 1-5
- [ ] Verify progress bars show correct colors (green ≥4, yellow ≥3, red <3)

**Test Case 7.3: Feedback Quality**
- [ ] Verify strengths list with specific observations
- [ ] Verify improvements list with actionable advice
- [ ] Verify practice drills with time estimates
- [ ] Verify narrative assessment is coherent
- [ ] Close modal and continue session if desired

### 8. ERROR HANDLING
**Test Case 8.1: API Failures**
- [ ] Disconnect internet temporarily
- [ ] Try "Ask Coach" button
- [ ] Verify error message appears gracefully
- [ ] Reconnect and try again
- [ ] Verify recovery works

**Test Case 8.2: Missing GEMINI_API_KEY**
- [ ] Remove GEMINI_API_KEY from .env.local
- [ ] Restart dev server
- [ ] Try to interact
- [ ] Verify appropriate error handling

### 9. PERFORMANCE & MEMORY
**Test Case 9.1: Long Session**
- [ ] Run session for 10+ minutes
- [ ] Send 20+ messages
- [ ] Draw 15+ elements on whiteboard
- [ ] Monitor browser memory usage
- [ ] Verify no significant memory growth

**Test Case 9.2: Rapid Interactions**
- [ ] Quickly click "Ask Coach" multiple times
- [ ] Quickly toggle STT on/off
- [ ] Rapidly draw and delete elements
- [ ] Verify no crashes or freezes

## Known Limitations

1. **STT only works in Chrome** - Uses webkit prefix
2. **TTS cold start is slow** - First API call to Gemini TTS takes time
3. **No collaborative features** - Single user only
4. **Canvas not persisted** - Refreshing page loses work
5. **No undo for deleted elements** - Only drawing operations

## Pre-Launch Checklist

- [ ] All test cases pass
- [ ] No TypeScript errors
- [ ] No console errors in production build
- [ ] Memory usage stable over long sessions
- [ ] Rubric files load correctly
- [ ] TTS/STT work in Chrome
- [ ] Evaluation produces useful feedback
- [ ] UI is responsive at different screen sizes

## Running the App

```bash
cd /Users/evangelineng/whiteboardingtool
npm run dev
# Open http://localhost:3000 in Chrome
```

Ensure `.env.local` contains:
```
GEMINI_API_KEY=your-api-key-here
```
