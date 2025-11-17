"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import TldrawWhiteboard, { WhiteboardRef } from "./components/TldrawWhiteboard";
import {
  Stepper,
  StepperIndicator,
  StepperItem,
  StepperTitle,
  StepperTrigger,
} from "@/components/ui/stepper";

interface Message {
  role: "coach" | "user";
  content: string;
}

interface CanvasSummary {
  elementsCount: number;
  rectanglesCount: number;
  textCount: number;
  arrowsCount: number;
  titles: string[];
}

const PHASES = [
  { name: "Discovery", duration: 20 * 60 },
  { name: "Heads-down", duration: 25 * 60 },
  { name: "Presentation", duration: 15 * 60 },
];

const COVERAGE_KEYWORDS: Record<string, string[]> = {
  framing: ["goal", "problem", "objective", "challenge", "scope"],
  constraints: ["constraint", "limit", "restriction", "boundary", "requirement"],
  users: ["user", "persona", "customer", "audience", "stakeholder"],
  ideation: ["idea", "approach", "solution", "concept", "brainstorm"],
  systems: ["state", "flow", "error", "edge case", "architecture", "system"],
  metrics: ["metric", "kpi", "experiment", "measure", "success", "data"],
  accessibility: ["accessibility", "wcag", "a11y", "inclusive", "screen reader"],
};

const DEFAULT_PROMPT = `Design a feature for a food delivery app that helps users with dietary restrictions easily find and order safe meals. The app currently has 10M MAU. Key constraint: Must work within existing restaurant partnerships (no new onboarding).`;

const SAMPLE_PROMPTS = [
  `Design a feature for a food delivery app that helps users with dietary restrictions easily find and order safe meals. The app currently has 10M MAU. Key constraint: Must work within existing restaurant partnerships (no new onboarding).`,
  `Design a notification system for a project management tool that helps teams stay informed without causing notification fatigue. The tool has 500K DAU. Key constraint: Must integrate with existing notification infrastructure.`,
  `Design a feature for a music streaming app that helps users discover new music based on their mood. The app has 20M MAU. Key constraint: Cannot use additional ML models beyond what's already deployed.`,
  `Design an onboarding flow for a personal finance app that helps users set up their first budget. The app targets young professionals (25-35). Key constraint: Must complete in under 5 minutes.`,
  `Design a feature for an e-commerce app that helps users compare products more effectively. The platform has 15M MAU. Key constraint: Must not slow down page load times.`,
  `Design a collaboration feature for a document editing tool that helps remote teams review documents asynchronously. The tool has 2M DAU. Key constraint: Must work offline.`,
];

export default function Home() {
  const [hasStarted, setHasStarted] = useState(false);
  const [customPrompt, setCustomPrompt] = useState("");
  const [phaseIndex, setPhaseIndex] = useState(0);
  const [timeLeft, setTimeLeft] = useState(PHASES[0].duration);
  const [messages, setMessages] = useState<Message[]>([]);
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [coverage, setCoverage] = useState<Set<string>>(new Set());
  const [canvasSummary, setCanvasSummary] = useState<CanvasSummary>({
    elementsCount: 0,
    rectanglesCount: 0,
    textCount: 0,
    arrowsCount: 0,
    titles: [],
  });
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [userInput, setUserInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [canvasPng, setCanvasPng] = useState<string>("");
  const [lastAudioUrl, setLastAudioUrl] = useState<string>("");
  const [isAudioPaused, setIsAudioPaused] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState("");
  const [showEvalModal, setShowEvalModal] = useState(false);
  const [lastCanvasUpdate, setLastCanvasUpdate] = useState(0);
  const [isAnalyzingCanvas, setIsAnalyzingCanvas] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [isLoadingAudio, setIsLoadingAudio] = useState(false);
  const [isCapturingCanvas, setIsCapturingCanvas] = useState(false);
  const [lastCanvasCaptureTime, setLastCanvasCaptureTime] = useState<Date | null>(null);
  const [ttsQuotaExceeded, setTtsQuotaExceeded] = useState(false);
  const [isTimerPaused, setIsTimerPaused] = useState(false);
  const [leftPanelWidth, setLeftPanelWidth] = useState(320);
  const [rightPanelWidth, setRightPanelWidth] = useState(400);
  const [isDraggingLeft, setIsDraggingLeft] = useState(false);
  const [isDraggingRight, setIsDraggingRight] = useState(false);
  const [evalResults, setEvalResults] = useState<{
    rubric?: Record<string, number>;
    strengths?: string[];
    weaknesses?: string[];
    drills?: Array<{ title: string; time: number; description: string }>;
    narrative?: string;
    error?: string;
  } | null>(null);

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const addUserMessageRef = useRef<(text: string) => void>(() => {});
  const isListeningRef = useRef(isListening);
  const canvasCoachTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const prevCanvasSummaryRef = useRef<CanvasSummary>(canvasSummary);
  const whiteboardRef = useRef<WhiteboardRef>(null);
  const sessionReadyRef = useRef(sessionReady);
  const isLoadingRef = useRef(isLoading);
  const accumulatedTranscriptRef = useRef<string>("");

  // Initialize speech recognition
  useEffect(() => {
    if (typeof window !== "undefined" && "webkitSpeechRecognition" in window) {
      const SpeechRecognitionConstructor = window.webkitSpeechRecognition;
      if (!SpeechRecognitionConstructor) return;
      const recognition = new SpeechRecognitionConstructor();
      recognition.continuous = true;
      recognition.interimResults = true; // Enable interim results for live feedback
      recognition.lang = "en-US";

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        let interim = "";
        let final = "";

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            final += transcript;
          } else {
            interim += transcript;
          }
        }

        // Update interim transcript for live display
        setInterimTranscript(interim);

        // Process final transcript
        if (final) {
          console.log("STT final result:", final);
          // Accumulate final results instead of immediately sending to coach
          accumulatedTranscriptRef.current += final + " ";
          setInterimTranscript(""); // Clear interim when we get final
          // Don't call addUserMessage here - wait for user to click "Stop"
        }
      };

      recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        // "no-speech" is expected when user pauses - don't treat as error
        if (event.error === "no-speech") {
          // Silently ignore - this is normal behavior
          return;
        }

        // Log actual errors (but not no-speech)
        console.error("Speech recognition error:", event.error);
        setIsListening(false);
        setInterimTranscript("");

        // Show user-friendly error messages for real issues
        if (event.error === "not-allowed") {
          alert("Microphone access denied. Please:\n1. Click the lock/camera icon in your browser's address bar\n2. Allow microphone access\n3. Refresh the page and try again\n\nNote: You can still type your responses in the text box below.");
        } else if (event.error === "audio-capture") {
          alert("No microphone found. Please check your microphone is connected and not in use by another app.");
        } else if (event.error === "network") {
          alert("Network error during speech recognition. Please check your internet connection.");
        } else if (event.error === "aborted") {
          // Silently ignore - recognition was intentionally stopped
        }
      };

      recognition.onend = () => {
        console.log("Recognition ended, isListening:", isListeningRef.current);
        setInterimTranscript("");
        if (isListeningRef.current) {
          try {
            recognition.start();
          } catch (e) {
            console.error("Failed to restart recognition:", e);
          }
        }
      };

      recognitionRef.current = recognition;
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, []);

  // Timer countdown
  useEffect(() => {
    if (!hasStarted || isTimerPaused) return;

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          // Auto-advance to next phase using functional update to avoid stale closure
          setPhaseIndex((currentPhaseIndex) => {
            if (currentPhaseIndex < PHASES.length - 1) {
              const nextPhaseIndex = currentPhaseIndex + 1;
              // Schedule time reset for next tick to avoid nested setState
              setTimeout(() => setTimeLeft(PHASES[nextPhaseIndex].duration), 0);
              return nextPhaseIndex;
            }
            return currentPhaseIndex;
          });
          return 0; // Will be immediately replaced by setTimeout above
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [hasStarted, isTimerPaused]);

  // Scroll transcript to bottom
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Coach intro when challenge starts - with ready check flow
  useEffect(() => {
    if (!hasStarted || messages.length > 0 || isInitializing) return;

    let cancelled = false;
    setIsInitializing(true);

    // Show immediate welcome message
    const welcomeMessage = "Welcome to your mock whiteboarding interview session! Click 'Start Talking' to enable your microphone, then say 'I'm ready' to begin. Or type 'ready' below.";
    setMessages([{ role: "coach", content: welcomeMessage }]);

    // Try to speak the welcome (this warms up the TTS)
    const initializeSession = async () => {
      if (!isMuted) {
        try {
          await speakText(welcomeMessage);
        } catch (error) {
          console.error("Initial TTS failed:", error);
        }
      }

      if (cancelled) return;

      // Don't auto-start STT - browsers require user gesture for microphone access
      // User needs to click "Start STT" button manually
      setIsInitializing(false);
    };

    initializeSession();

    return () => {
      cancelled = true;
    };
  }, [hasStarted]); // Only depend on hasStarted - run once when session starts

  // Track if we've already started the interview (prevent duplicate starts)
  const hasStartedInterviewRef = useRef(false);

  // Check for "ready" in user messages to start actual interview
  useEffect(() => {
    if (!hasStarted || sessionReady || hasStartedInterviewRef.current) return;
    if (messages.length === 0) return;

    const lastUserMessage = [...messages].reverse().find(m => m.role === "user");
    if (!lastUserMessage) return;

    const readyKeywords = ["ready", "i'm ready", "im ready", "let's go", "lets go", "start", "begin", "yes"];
    const isReady = readyKeywords.some(keyword =>
      lastUserMessage.content.toLowerCase().includes(keyword)
    );

    if (isReady) {
      hasStartedInterviewRef.current = true;
      setSessionReady(true);

      // Now give the actual interview prompt
      const promptMessage = `Great! Let's begin. Your design challenge is: "${prompt}". You have 60 minutes total, broken into three phases. We're starting with the Discovery phase - you have 20 minutes. What's your initial take on this problem?`;
      setMessages(prev => [...prev, { role: "coach", content: promptMessage }]);

      if (!isMuted) {
        speakText(promptMessage);
      }
    }
  }, [hasStarted, sessionReady, messages, prompt, isMuted]);

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const addUserMessage = useCallback(
    (text: string) => {
      const newMessage: Message = { role: "user", content: text };
      setMessages((prev) => [...prev, newMessage]);

      // Update coverage based on keywords
      const lowerText = text.toLowerCase();
      const newCoverage = new Set(coverage);
      Object.entries(COVERAGE_KEYWORDS).forEach(([tag, keywords]) => {
        if (keywords.some((kw) => lowerText.includes(kw))) {
          newCoverage.add(tag);
        }
      });
      setCoverage(newCoverage);

      // Auto-respond from coach after user speaks (simulate real interview)
      setTimeout(() => {
        autoCoachResponse(text, newCoverage);
      }, 1500);
    },
    [coverage]
  );

  const autoCoachResponse = async (userText: string, currentCoverage: Set<string>) => {
    // Only auto-respond if session is ready and not already loading
    // Use refs to get current values, not stale closures
    if (!sessionReadyRef.current || isLoadingRef.current || userText.length < 10) return;

    setIsLoading(true);
    isLoadingRef.current = true;
    try {
      // Capture current canvas state before responding
      setIsCapturingCanvas(true);
      let canvasImageBase64 = "";
      if (whiteboardRef.current) {
        canvasImageBase64 = await whiteboardRef.current.getCanvasImage();
        setLastCanvasCaptureTime(new Date());
      }
      setIsCapturingCanvas(false);

      const response = await fetch("/api/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phase: PHASES[phaseIndex].name,
          prompt,
          messages: [...messages, { role: "user", content: userText }],
          coverage: Array.from(currentCoverage),
          canvasSummary,
          canvasImageBase64, // Include screenshot for visual analysis
        }),
      });

      if (!response.ok) {
        console.error("Coach API returned error:", response.status);
        return;
      }

      const data = await response.json();
      const coachMessage: Message = { role: "coach", content: data.nudge };
      setMessages((prev) => [...prev, coachMessage]);

      if (!isMuted) {
        speakText(data.nudge);
      }
    } catch (error) {
      console.error("Auto coach error:", error);
      setIsCapturingCanvas(false);
    } finally {
      setIsLoading(false);
      isLoadingRef.current = false;
    }
  };

  const canvasCoachResponse = async (summary: CanvasSummary) => {
    // Don't respond if already loading or analyzing
    if (isLoading || isAnalyzingCanvas) return;

    setIsAnalyzingCanvas(true);
    try {
      // Capture current canvas state
      let canvasImageBase64 = "";
      if (whiteboardRef.current) {
        canvasImageBase64 = await whiteboardRef.current.getCanvasImage();
      }

      // Create a system message describing the canvas activity
      const activityDescription = `[User updated whiteboard: ${summary.elementsCount} total elements - ${summary.rectanglesCount} shapes, ${summary.textCount} text labels, ${summary.arrowsCount} arrows. Labels: ${summary.titles.slice(0, 5).join(", ") || "none yet"}]`;

      const response = await fetch("/api/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phase: PHASES[phaseIndex].name,
          prompt,
          messages: [...messages, { role: "user", content: activityDescription }],
          coverage: Array.from(coverage),
          canvasSummary: summary,
          canvasImageBase64,
        }),
      });

      if (!response.ok) return;

      const data = await response.json();
      const coachMessage: Message = { role: "coach", content: data.nudge };
      setMessages((prev) => [...prev, coachMessage]);

      if (!isMuted) {
        speakText(data.nudge);
      }
    } catch (error) {
      console.error("Canvas coach error:", error);
    } finally {
      setIsAnalyzingCanvas(false);
    }
  };

  // Keep refs updated for speech recognition callbacks
  useEffect(() => {
    addUserMessageRef.current = addUserMessage;
  }, [addUserMessage]);

  useEffect(() => {
    isListeningRef.current = isListening;
  }, [isListening]);

  useEffect(() => {
    sessionReadyRef.current = sessionReady;
  }, [sessionReady]);

  useEffect(() => {
    isLoadingRef.current = isLoading;
  }, [isLoading]);

  const speakText = async (text: string) => {
    if (isMuted) return;

    try {
      setIsLoadingAudio(true);
      setIsSpeaking(false);
      setIsAudioPaused(false);

      const response = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });

      if (!response.ok) {
        // Check if it's a quota error
        if (response.status === 429) {
          const errorData = await response.json().catch(() => ({}));
          console.warn("TTS quota exceeded:", errorData.error || "Rate limited");
          // Mark quota as exceeded and disable audio
          setTtsQuotaExceeded(true);
          setIsLoadingAudio(false);
          return;
        }
        throw new Error("TTS failed");
      }

      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);

      // Revoke previous URL to prevent memory leak
      if (lastAudioUrl) {
        URL.revokeObjectURL(lastAudioUrl);
      }
      setLastAudioUrl(audioUrl);
      setIsLoadingAudio(false);

      if (audioRef.current) {
        // Stop any currently playing audio
        audioRef.current.pause();
        audioRef.current.currentTime = 0;

        audioRef.current.src = audioUrl;
        audioRef.current.onended = () => {
          setIsSpeaking(false);
          setIsAudioPaused(false);
        };
        audioRef.current.onpause = () => {
          if (audioRef.current && audioRef.current.currentTime < audioRef.current.duration) {
            setIsAudioPaused(true);
          }
        };
        audioRef.current.onplay = () => {
          setIsSpeaking(true);
          setIsAudioPaused(false);
        };
        await audioRef.current.play();
      }
    } catch (error) {
      console.error("TTS error:", error);
      setIsLoadingAudio(false);
      setIsSpeaking(false);
    }
  };

  const pauseAudio = () => {
    if (audioRef.current && isSpeaking) {
      audioRef.current.pause();
    }
  };

  const resumeAudio = () => {
    if (audioRef.current && isAudioPaused) {
      audioRef.current.play();
    }
  };

  const replayAudio = () => {
    if (audioRef.current && lastAudioUrl) {
      audioRef.current.currentTime = 0;
      audioRef.current.play();
    }
  };

  const toggleMute = () => {
    const newMutedState = !isMuted;
    setIsMuted(newMutedState);
    // If muting, stop any active audio
    if (newMutedState && audioRef.current) {
      audioRef.current.pause();
      setIsSpeaking(false);
      setIsAudioPaused(false);
    }
  };

  const askCoach = async () => {
    setIsLoading(true);
    try {
      // Capture current canvas state
      let canvasImageBase64 = "";
      if (whiteboardRef.current) {
        canvasImageBase64 = await whiteboardRef.current.getCanvasImage();
      }

      const response = await fetch("/api/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phase: PHASES[phaseIndex].name,
          prompt,
          messages,
          coverage: Array.from(coverage),
          canvasSummary,
          canvasImageBase64,
        }),
      });

      if (!response.ok) {
        throw new Error("Coach API failed");
      }

      const data = await response.json();
      const coachMessage: Message = { role: "coach", content: data.nudge };
      setMessages((prev) => [...prev, coachMessage]);

      if (!isMuted) {
        speakText(data.nudge);
      }

      if (data.coverageNudge) {
        setTimeout(() => {
          const coverageMessage: Message = {
            role: "coach",
            content: data.coverageNudge,
          };
          setMessages((prev) => [...prev, coverageMessage]);
        }, 1000);
      }
    } catch (error) {
      console.error("Coach error:", error);
      const errorMessage: Message = {
        role: "coach",
        content: "Sorry, I encountered an error. Please try again.",
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const endAndDebrief = async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phase: PHASES[phaseIndex].name,
          prompt,
          messages,
          coverage: Array.from(coverage),
          canvasSummary,
          canvasPngBase64: canvasPng || undefined,
        }),
      });

      if (!response.ok) {
        throw new Error("Evaluate API failed");
      }

      const data = await response.json();
      setEvalResults(data);
      setShowEvalModal(true);

      const debriefMessage: Message = {
        role: "coach",
        content: "Debrief ready. Check the evaluation scorecard in the popup.",
      };
      setMessages((prev) => [...prev, debriefMessage]);
    } catch (error) {
      console.error("Evaluate error:", error);
      setEvalResults({ error: "Failed to generate evaluation. Please try again." });
      setShowEvalModal(true);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleListening = () => {
    if (!recognitionRef.current) {
      alert("Speech recognition not supported in this browser. Please use Chrome.");
      return;
    }

    if (isListening) {
      // Stop listening
      recognitionRef.current.stop();
      setIsListening(false);

      // Send accumulated transcript to coach
      const fullTranscript = accumulatedTranscriptRef.current.trim();
      if (fullTranscript) {
        console.log("Sending accumulated transcript:", fullTranscript);
        addUserMessage(fullTranscript);
        accumulatedTranscriptRef.current = ""; // Clear for next session
      }
    } else {
      // Start listening
      accumulatedTranscriptRef.current = ""; // Clear any old transcript
      recognitionRef.current.start();
      setIsListening(true);
    }
  };

  const handleManualInput = () => {
    if (userInput.trim()) {
      addUserMessage(userInput.trim());
      setUserInput("");
    }
  };

  const setPhase = (index: number) => {
    setPhaseIndex(index);
    setTimeLeft(PHASES[index].duration);
  };

  const handleCanvasSummaryChange = useCallback((summary: CanvasSummary) => {
    setCanvasSummary(summary);
  }, []);

  const handleCanvasExport = useCallback((base64: string) => {
    setCanvasPng(base64);
  }, []);

  const startWithCustomPrompt = () => {
    if (customPrompt.trim()) {
      setPrompt(customPrompt.trim());
      setHasStarted(true);
    }
  };

  const startWithRandomPrompt = () => {
    const randomPrompt = SAMPLE_PROMPTS[Math.floor(Math.random() * SAMPLE_PROMPTS.length)];
    setPrompt(randomPrompt);
    setHasStarted(true);
  };

  // Panel resize handlers
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDraggingLeft) {
        const newWidth = Math.max(200, Math.min(500, e.clientX));
        setLeftPanelWidth(newWidth);
      }
      if (isDraggingRight) {
        const newWidth = Math.max(250, Math.min(600, window.innerWidth - e.clientX));
        setRightPanelWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsDraggingLeft(false);
      setIsDraggingRight(false);
    };

    if (isDraggingLeft || isDraggingRight) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isDraggingLeft, isDraggingRight]);

  const startNewSession = () => {
    // Stop listening if active
    if (isListening && recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
    }
    // Stop audio if playing and revoke URL
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
    }
    if (lastAudioUrl) {
      URL.revokeObjectURL(lastAudioUrl);
    }
    // Reset whiteboard
    if (whiteboardRef.current) {
      whiteboardRef.current.reset();
    }
    // Reset all state
    setHasStarted(false);
    setCustomPrompt("");
    setPhaseIndex(0);
    setTimeLeft(PHASES[0].duration);
    setMessages([]);
    setPrompt(DEFAULT_PROMPT);
    setCoverage(new Set());
    setCanvasSummary({
      elementsCount: 0,
      rectanglesCount: 0,
      textCount: 0,
      arrowsCount: 0,
      titles: [],
    });
    setIsSpeaking(false);
    setIsMuted(false);
    setUserInput("");
    setIsLoading(false);
    setCanvasPng("");
    setLastAudioUrl("");
    setIsAudioPaused(false);
    setInterimTranscript("");
    setShowEvalModal(false);
    setEvalResults(null);
    setIsAnalyzingCanvas(false);
    setSessionReady(false);
    setIsInitializing(false);
    setIsCapturingCanvas(false);
    setLastCanvasCaptureTime(null);
    setTtsQuotaExceeded(false);
    setIsTimerPaused(false);
    hasStartedInterviewRef.current = false;
  };

  // Landing page
  if (!hasStarted) {
    return (
      <div className="min-h-screen bg-white">
        {/* Hero Section */}
        <div className="max-w-5xl mx-auto px-6 pt-20 pb-16">
          <div className="text-center mb-16">
            <h1 className="text-5xl md:text-6xl font-semibold text-gray-900 tracking-tight mb-6 leading-tight">
              Practice product design interviews.
              <br />
              <span className="text-gray-400">On your terms.</span>
            </h1>
            <p className="text-xl text-gray-500 max-w-2xl mx-auto leading-relaxed">
              Solo or together, challenge yourself with timed simulations, AI feedback, and a smart whiteboard—no practice partner required.
            </p>
          </div>

          {/* Features - Linear style */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-8 mb-20 max-w-3xl mx-auto">
            <div className="flex items-start gap-4">
              <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <h3 className="font-medium text-gray-900 mb-1">Timed design exercises</h3>
                <p className="text-sm text-gray-500">Just like an interview. 60 minutes across Discovery, Heads-down, and Presentation phases.</p>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              </div>
              <div>
                <h3 className="font-medium text-gray-900 mb-1">AI coaching</h3>
                <p className="text-sm text-gray-500">Learn what matters, as you go. Get nudges on coverage gaps and structured evaluation.</p>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                </svg>
              </div>
              <div>
                <h3 className="font-medium text-gray-900 mb-1">Voice + sketch</h3>
                <p className="text-sm text-gray-500">Aligns with true whiteboarding sessions. Speak your thinking, draw your ideas.</p>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16m-7 6h7" />
                </svg>
              </div>
              <div>
                <h3 className="font-medium text-gray-900 mb-1">Curated & custom prompts</h3>
                <p className="text-sm text-gray-500">Surprise yourself or control your practice. Real-world scenarios with constraints.</p>
              </div>
            </div>
          </div>

          {/* CTA Section */}
          <div className="max-w-2xl mx-auto">
            <div className="bg-gray-50 rounded-2xl p-8">
              <h2 className="text-xl font-medium text-gray-900 mb-6">Try your first challenge</h2>

              {/* Custom Prompt */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Your own prompt
                </label>
                <textarea
                  value={customPrompt}
                  onChange={(e) => setCustomPrompt(e.target.value)}
                  placeholder="Design a feature for... The app has X MAU. Key constraint: ..."
                  className="w-full h-28 p-4 bg-white border border-gray-200 rounded-lg text-gray-900 text-sm resize-none focus:ring-2 focus:ring-gray-900 focus:border-gray-900 placeholder-gray-400"
                />
                <button
                  onClick={startWithCustomPrompt}
                  disabled={!customPrompt.trim()}
                  className="mt-3 w-full py-3 bg-gray-900 text-white rounded-lg font-medium hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  Start challenge
                </button>
              </div>

              {/* Divider */}
              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-200"></div>
                </div>
                <div className="relative flex justify-center">
                  <span className="bg-gray-50 px-3 text-sm text-gray-400">or</span>
                </div>
              </div>

              {/* Random Prompt */}
              <button
                onClick={startWithRandomPrompt}
                className="w-full py-3 bg-white border border-gray-200 text-gray-700 rounded-lg font-medium hover:bg-gray-100 hover:border-gray-300 transition-colors"
              >
                Surprise me with a random challenge
              </button>
            </div>

            {/* Footer note */}
            <p className="text-center text-xs text-gray-400 mt-6">
              Best experienced in Chrome for speech-to-text features
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-50 flex-col">
      {/* Session Initializing Banner */}
      {!sessionReady && (
        <div className="bg-amber-500 text-white px-4 py-3 flex items-center justify-center">
          <div className="flex items-center gap-3">
            {isInitializing ? (
              <>
                <div className="flex gap-1">
                  <div className="w-2 h-2 bg-white rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                  <div className="w-2 h-2 bg-white rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                  <div className="w-2 h-2 bg-white rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
                <span className="font-semibold">
                  {isLoadingAudio ? "Loading coach audio (may take 10-30s on first load)..." : "Setting up your session..."}
                </span>
              </>
            ) : (
              <>
                <div className="w-3 h-3 bg-white rounded-full animate-pulse" />
                <span className="font-semibold">Click &ldquo;Start Talking&rdquo; then say &ldquo;I&apos;m ready&rdquo; (or type &ldquo;ready&rdquo; below)</span>
              </>
            )}
          </div>
        </div>
      )}

      {/* Listening Indicator Banner */}
      {isListening && (
        <div className="bg-green-500 text-white px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-white rounded-full animate-pulse" />
              <span className="font-semibold">Listening...</span>
            </div>
            {interimTranscript && (
              <div className="text-green-100 text-sm italic max-w-2xl truncate">
                &ldquo;{interimTranscript}&rdquo;
              </div>
            )}
          </div>
          <button
            onClick={toggleListening}
            className="text-sm bg-green-600 hover:bg-green-700 px-3 py-1 rounded font-medium"
          >
            Stop Listening
          </button>
        </div>
      )}

      <div className="flex flex-1 min-h-0">
      {/* Left Sidebar */}
      <div
        className="bg-white border-r flex flex-col flex-shrink-0"
        style={{ width: `${leftPanelWidth}px` }}
      >
        <div className="p-4 border-b flex items-center justify-between">
          <h1 className="text-lg font-bold text-gray-800">Design Challenge</h1>
          <button
            onClick={startNewSession}
            className="text-xs px-2 py-1 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded font-medium transition-colors"
          >
            New Session
          </button>
        </div>

        {/* Phase and Timer */}
        <div className="p-4 border-b">
          <div className="text-sm text-gray-600 mb-1">Current Phase</div>
          <div className="text-2xl font-bold text-blue-600 mb-2">
            {PHASES[phaseIndex].name}
          </div>
          <div className="text-4xl font-mono font-bold text-gray-800 mb-3 flex items-center gap-2">
            {formatTime(timeLeft)}
            <button
              onClick={() => setIsTimerPaused(!isTimerPaused)}
              className={`text-sm px-2 py-1 rounded font-medium transition-colors ${
                isTimerPaused
                  ? "bg-green-500 text-white hover:bg-green-600"
                  : "bg-yellow-500 text-white hover:bg-yellow-600"
              }`}
              title={isTimerPaused ? "Resume timer" : "Pause timer"}
            >
              {isTimerPaused ? "▶" : "⏸"}
            </button>
          </div>
          {isTimerPaused && (
            <div className="text-xs text-yellow-600 bg-yellow-50 px-2 py-1 rounded mb-2">
              Timer paused
            </div>
          )}
          <Stepper value={phaseIndex} onValueChange={setPhase} className="items-start gap-2">
            {PHASES.map((phase, idx) => (
              <StepperItem key={phase.name} step={idx} className="flex-1">
                <StepperTrigger className="w-full flex-col items-start gap-2">
                  <StepperIndicator asChild className="h-1.5 w-full bg-gray-200 rounded-full data-[state=active]:bg-blue-500 data-[state=completed]:bg-blue-500">
                    <span className="sr-only">{idx + 1}</span>
                  </StepperIndicator>
                  <div className="w-full">
                    <StepperTitle className="text-xs text-gray-700 data-[state=active]:text-blue-600 data-[state=active]:font-semibold">
                      {phase.name}
                    </StepperTitle>
                  </div>
                </StepperTrigger>
              </StepperItem>
            ))}
          </Stepper>
        </div>

        {/* Mic Controls */}
        <div className="p-4 border-b">
          <div className="flex items-center gap-2 mb-2">
            <button
              onClick={toggleListening}
              className={`flex-1 py-2 px-4 rounded font-medium ${
                isListening
                  ? "bg-red-500 text-white"
                  : "bg-green-500 text-white hover:bg-green-600"
              }`}
            >
              {isListening ? "Stop Talking" : "Start Talking"}
            </button>
            <div
              className={`w-3 h-3 rounded-full ${
                isListening ? "bg-green-500 animate-pulse" : "bg-gray-300"
              }`}
            />
          </div>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-sm text-gray-700 font-medium">
              Coach: {ttsQuotaExceeded ? "Audio unavailable (quota)" : isLoadingAudio ? "Loading audio..." : isSpeaking ? (isAudioPaused ? "Paused" : "Speaking...") : "Silent"}
            </span>
            <button
              onClick={toggleMute}
              className={`text-xs py-1 px-2 rounded font-medium ${
                isMuted ? "bg-red-100 text-red-700" : "bg-gray-100 hover:bg-gray-200 text-gray-700"
              }`}
            >
              {isMuted ? "Unmute" : "Mute"}
            </button>
          </div>
          {ttsQuotaExceeded && (
            <div className="text-xs text-amber-600 bg-amber-50 p-2 rounded mb-2">
              TTS quota exceeded (15 req/day on free tier). Text still works.
            </div>
          )}
          {/* Audio playback controls */}
          <div className="flex items-center gap-1">
            {isSpeaking && !isAudioPaused && (
              <button
                onClick={pauseAudio}
                className="flex-1 py-1.5 px-3 bg-yellow-100 text-yellow-800 rounded text-xs font-medium hover:bg-yellow-200 transition-colors"
              >
                ⏸ Pause
              </button>
            )}
            {isAudioPaused && (
              <button
                onClick={resumeAudio}
                className="flex-1 py-1.5 px-3 bg-green-100 text-green-800 rounded text-xs font-medium hover:bg-green-200 transition-colors"
              >
                ▶ Resume
              </button>
            )}
            {lastAudioUrl && (
              <button
                onClick={replayAudio}
                className="flex-1 py-1.5 px-3 bg-blue-100 text-blue-800 rounded text-xs font-medium hover:bg-blue-200 transition-colors"
              >
                🔄 Replay
              </button>
            )}
          </div>
        </div>

        {/* Prompt */}
        <div className="p-4 border-b">
          <label className="text-sm font-medium text-gray-700 block mb-1">Design Prompt</label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            className="w-full h-24 text-sm p-2 border border-gray-300 rounded resize-none text-gray-900 bg-white placeholder-gray-500"
            readOnly
          />
        </div>

        {/* Coverage Tags */}
        <div className="p-4 border-b flex-1 overflow-y-auto">
          <div className="text-sm text-gray-600 mb-2">Coverage</div>
          <div className="flex flex-wrap gap-1">
            {Object.keys(COVERAGE_KEYWORDS).map((tag) => (
              <span
                key={tag}
                className={`text-xs py-1 px-2 rounded ${
                  coverage.has(tag)
                    ? "bg-green-100 text-green-700 border border-green-300"
                    : "bg-gray-100 text-gray-500 border border-gray-200"
                }`}
              >
                {tag}
              </span>
            ))}
          </div>
        </div>

        {/* End & Debrief */}
        <div className="p-4">
          <button
            onClick={endAndDebrief}
            disabled={isLoading}
            className="w-full py-2 bg-purple-500 text-white rounded font-medium hover:bg-purple-600 disabled:opacity-50"
          >
            End & Debrief
          </button>
        </div>
      </div>

      {/* Left Resize Handle */}
      <div
        className="w-1 bg-gray-200 hover:bg-blue-400 cursor-col-resize transition-colors flex-shrink-0"
        onMouseDown={() => setIsDraggingLeft(true)}
        title="Drag to resize"
      />

      {/* Center Panel - Whiteboard (takes most space) */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="bg-white border-b px-4 py-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700">Whiteboard</h2>
          <div className="flex items-center gap-2">
            {isCapturingCanvas && (
              <div className="flex items-center gap-2 text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded">
                <div className="w-2 h-2 bg-amber-500 rounded-full animate-pulse" />
                <span>Capturing canvas...</span>
              </div>
            )}
            {lastCanvasCaptureTime && !isCapturingCanvas && (
              <div className="text-xs text-green-600 bg-green-50 px-2 py-1 rounded">
                Last captured: {lastCanvasCaptureTime.toLocaleTimeString()}
              </div>
            )}
          </div>
        </div>
        <div className="flex-1 overflow-hidden">
          <TldrawWhiteboard
            ref={whiteboardRef}
            onSummaryChange={handleCanvasSummaryChange}
            onExport={handleCanvasExport}
          />
        </div>
      </div>

      {/* Right Resize Handle */}
      <div
        className="w-1 bg-gray-200 hover:bg-blue-400 cursor-col-resize transition-colors flex-shrink-0"
        onMouseDown={() => setIsDraggingRight(true)}
        title="Drag to resize"
      />

      {/* Right Panel - Transcript */}
      <div
        className="bg-white border-l flex flex-col flex-shrink-0"
        style={{ width: `${rightPanelWidth}px` }}
      >
        <div className="px-4 py-3 border-b">
          <h2 className="text-sm font-semibold text-gray-700">Transcript</h2>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50">
          {messages.map((msg, idx) => {
            const isLastCoachMessage = msg.role === "coach" && idx === messages.length - 1;
            const showAudioLoading = isLastCoachMessage && isLoadingAudio && !isMuted;
            const showAudioPlaying = isLastCoachMessage && isSpeaking && !isMuted;

            return (
              <div
                key={idx}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div className="max-w-[90%]">
                  <div
                    className={`rounded-lg p-3 ${
                      msg.role === "user"
                        ? "bg-blue-600 text-white"
                        : "bg-white border border-gray-200 shadow-sm"
                    }`}
                  >
                    <div className={`text-xs font-semibold mb-1 ${
                      msg.role === "user" ? "text-blue-100" : "text-blue-600"
                    }`}>
                      {msg.role === "user" ? "You" : "Coach"}
                    </div>
                    <div className={`text-sm leading-relaxed ${
                      msg.role === "user" ? "text-white" : "text-gray-900"
                    }`}>
                      {msg.content}
                    </div>
                  </div>
                  {/* Audio status indicator for last coach message */}
                  {showAudioLoading && (
                    <div className="mt-1 flex items-center gap-2 text-xs text-amber-600">
                      <div className="flex gap-1">
                        <div className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                        <div className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                        <div className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                      </div>
                      <span>Loading audio...</span>
                    </div>
                  )}
                  {showAudioPlaying && (
                    <div className="mt-1 flex items-center gap-2 text-xs text-green-600">
                      <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                      <span>Playing audio...</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          {/* Live transcription indicator in transcript */}
          {isListening && interimTranscript && (
            <div className="flex justify-end">
              <div className="max-w-[90%] rounded-lg p-3 bg-blue-100 border-2 border-blue-300 border-dashed">
                <div className="text-xs font-semibold mb-1 text-blue-600 flex items-center gap-2">
                  <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
                  Speaking...
                </div>
                <div className="text-sm leading-relaxed text-blue-800 italic">
                  {interimTranscript}
                </div>
              </div>
            </div>
          )}
          {/* Coach thinking indicator */}
          {(isLoading || isAnalyzingCanvas) && (
            <div className="flex justify-start">
              <div className="max-w-[90%] rounded-lg p-3 bg-purple-50 border border-purple-200">
                <div className="text-xs font-semibold mb-1 text-purple-600 flex items-center gap-2">
                  <div className="flex gap-1">
                    <div className="w-2 h-2 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                    <div className="w-2 h-2 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                    <div className="w-2 h-2 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                  </div>
                  Coach is thinking...
                </div>
                <div className="text-xs text-purple-500">
                  {isAnalyzingCanvas ? "Analyzing your whiteboard..." : "Processing your input..."}
                </div>
              </div>
            </div>
          )}
          <div ref={transcriptEndRef} />
        </div>

        {/* Manual Input */}
        <div className="p-3 bg-white border-t">
          <div className="flex gap-2">
            <input
              type="text"
              value={userInput}
              onChange={(e) => setUserInput(e.target.value)}
              onKeyDown={(e) => {
                e.stopPropagation(); // Prevent whiteboard shortcuts from firing
                if (e.key === "Enter") handleManualInput();
              }}
              placeholder="Type your thinking..."
              className="flex-1 px-3 py-2 border border-gray-300 rounded text-sm text-gray-900 placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            <button
              onClick={handleManualInput}
              className="px-3 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 text-sm font-medium"
            >
              Send
            </button>
          </div>
        </div>
      </div>
      </div>

      {/* Hidden audio element */}
      <audio ref={audioRef} className="hidden" />

      {/* Evaluation Modal */}
      {showEvalModal && evalResults && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-purple-600 to-blue-600 p-6 text-white">
              <h2 className="text-2xl font-bold">Evaluation Scorecard</h2>
              <p className="text-purple-100 mt-1">Your design challenge performance review</p>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {evalResults.error ? (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-800">
                  {evalResults.error}
                </div>
              ) : (
                <>
                  {/* Rubric Scores */}
                  {evalResults.rubric && (
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900 mb-3">Performance Rubric</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {Object.entries(evalResults.rubric).map(([key, value]) => (
                          <div key={key} className="bg-gray-50 rounded-lg p-3">
                            <div className="flex justify-between items-center mb-2">
                              <span className="text-sm font-medium text-gray-700 capitalize">
                                {key.replace(/_/g, " ")}
                              </span>
                              <span className="text-sm font-bold text-gray-900">{value}/5</span>
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-2">
                              <div
                                className={`h-2 rounded-full ${
                                  value >= 4
                                    ? "bg-green-500"
                                    : value >= 3
                                    ? "bg-yellow-500"
                                    : "bg-red-500"
                                }`}
                                style={{ width: `${(value / 5) * 100}%` }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Strengths */}
                  {evalResults.strengths && evalResults.strengths.length > 0 && (
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
                        <span className="text-green-600">✓</span> Strengths
                      </h3>
                      <ul className="space-y-2">
                        {evalResults.strengths.map((strength, idx) => (
                          <li key={idx} className="bg-green-50 border border-green-200 rounded-lg p-3 text-green-800 text-sm">
                            {strength}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Weaknesses */}
                  {evalResults.weaknesses && evalResults.weaknesses.length > 0 && (
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
                        <span className="text-red-600">✗</span> Areas for Improvement
                      </h3>
                      <ul className="space-y-2">
                        {evalResults.weaknesses.map((weakness, idx) => (
                          <li key={idx} className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-800 text-sm">
                            {weakness}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Drills */}
                  {evalResults.drills && evalResults.drills.length > 0 && (
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
                        <span className="text-blue-600">📝</span> Recommended Practice Drills
                      </h3>
                      <div className="space-y-3">
                        {evalResults.drills.map((drill, idx) => (
                          <div key={idx} className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                            <div className="flex justify-between items-start mb-2">
                              <h4 className="font-medium text-blue-900">{drill.title}</h4>
                              <span className="text-xs bg-blue-200 text-blue-800 px-2 py-1 rounded-full">
                                {drill.time} min
                              </span>
                            </div>
                            <p className="text-sm text-blue-800">{drill.description}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Narrative */}
                  {evalResults.narrative && (
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900 mb-3">Overall Assessment</h3>
                      <div className="bg-gray-50 rounded-lg p-4 text-gray-800 text-sm leading-relaxed">
                        {evalResults.narrative}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Modal Footer */}
            <div className="border-t p-4 bg-gray-50">
              <button
                onClick={() => setShowEvalModal(false)}
                className="w-full py-3 bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700 transition-colors"
              >
                Close Scorecard
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
