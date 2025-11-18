import { GoogleGenAI } from "@google/genai";
import { NextRequest, NextResponse } from "next/server";

const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

interface Message {
  role: "coach" | "user";
  content: string;
}

interface CoachRequest {
  phase: string;
  prompt: string;
  messages: Message[];
  coverage: string[];
  canvasSummary: {
    elementsCount: number;
    rectanglesCount: number;
    textCount: number;
    arrowsCount: number;
    titles: string[];
  };
  canvasImageBase64?: string; // Optional canvas screenshot
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as CoachRequest;

    if (!body.phase || !body.prompt || !body.messages || !body.coverage) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const hasCanvasContent = body.canvasSummary.elementsCount > 0;
    const canvasContext = hasCanvasContent
      ? `\n\nIMPORTANT - WHITEBOARD CONTEXT:
The candidate has drawn ${body.canvasSummary.elementsCount} elements on their whiteboard:
- ${body.canvasSummary.rectanglesCount} shapes/boxes
- ${body.canvasSummary.textCount} text labels: ${body.canvasSummary.titles.slice(0, 8).join(", ") || "unlabeled"}
- ${body.canvasSummary.arrowsCount} arrows/connections

YOU MUST reference their whiteboard in your response. Specifically mention what you see (boxes, labels, connections) and ask about it. Example responses:
- "I see you've drawn [X] connected to [Y]. What happens when..."
- "Your diagram shows [concept]. How does this handle..."
- "I notice you have [label] as a separate component. Why did you..."
- "Looking at your flow from [A] to [B], what about edge cases like..."`
      : "";

    const systemInstruction = `You are a product design interviewer conducting a 60-minute live design exercise. You can see both what the candidate says AND their whiteboard drawings through screenshots.

INTERVIEW FORMAT (based on real design interview structure):
- Discovery (20 min): Ask questions, define the problem, break it down
- Heads-down (25 min): Low-fidelity wireframes, cameras off simulation
- Presentation (15 min): Solution walkthrough and Q&A

WHAT YOU'RE EVALUATING:
- Strategic thinking and product sense
- Creativity and originality
- Comfort navigating ambiguity
- Ability to collaborate and communicate design decisions

PHASE-SPECIFIC COACHING:

Discovery Phase:
- Encourage asking questions to clarify the prompt
- Push them to identify business goals and key users
- Prompt exploration of a wide range of ideas
- Encourage taking risks and thinking aloud like a PM
- Ask: "What's the business goal here?" "Who are the key users?" "What constraints matter most?"
- When they mention ideas, ask them to explore trade-offs

Heads-down Phase:
- Remind them this is for LOW-FIDELITY wireframes only, not polished designs
- When they draw, reference specific elements: "I see you have X connected to Y, what happens when..."
- Challenge edge cases: "What if the user doesn't have X?" "How does this scale?"
- Push systems thinking: "What states can this be in?" "What errors could occur?"
- Focus on structure and flow, not visual polish

Presentation Phase:
- Ask why they made certain decisions
- Probe trade-offs: "What did you consider but decide against?"
- Ask about areas for improvement or expansion
- Challenge assumptions: "What would happen if [constraint] changed?"
- Ask about metrics: "How would you measure success?"

YOUR COACHING STYLE:
- Be supportive but rigorous (like a real interviewer)
- ALWAYS reference their whiteboard drawings when present
- Prefer probing questions over giving advice
- Keep responses SHORT (<= 2 sentences) to keep momentum
- Push them to think strategically, not just tactically
- Don't accept surface-level answers—dig deeper
- Guide without dictating solutions

Current phase: ${body.phase}
Design prompt: ${body.prompt}
Coverage so far: ${body.coverage.join(", ") || "none"}${canvasContext}`;

    const conversationHistory = body.messages
      .map((m) => `${m.role === "coach" ? "Coach" : "User"}: ${m.content}`)
      .join("\n");

    // Build content array - include image if provided
    let contents: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [
      { text: conversationHistory || "User just started the session." }
    ];

    // If canvas image is provided, include it for visual analysis
    if (body.canvasImageBase64) {
      // Remove data URL prefix if present
      const base64Data = body.canvasImageBase64.replace(/^data:image\/\w+;base64,/, "");

      // Check image size - skip if too large (> 4MB base64 ≈ 3MB original)
      const imageSizeMB = (base64Data.length * 0.75) / (1024 * 1024);
      if (imageSizeMB > 4) {
        console.warn(`Canvas image too large (${imageSizeMB.toFixed(2)}MB), skipping image analysis`);
      } else {
        contents = [
          { text: "Here is the current state of the candidate's whiteboard:" },
          { inlineData: { mimeType: "image/png", data: base64Data } },
          { text: `\n\nConversation history:\n${conversationHistory || "User just started the session."}` }
        ];
      }
    }

    // Add timeout wrapper for Gemini API call (60 seconds)
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("Gemini API timeout after 60s")), 60000);
    });

    const result = await Promise.race([
      genAI.models.generateContent({
        model: "gemini-2.0-flash",
        contents,
        config: {
          temperature: 0.7,
          systemInstruction,
        },
      }),
      timeoutPromise
    ]);

    const nudge = result.text || "Keep going! What are you thinking about?";

    // Check if we should nudge about coverage
    let coverageNudge: string | undefined;
    if (body.coverage.length < 3 && body.messages.length > 5) {
      const missing = [
        "framing",
        "constraints",
        "users",
        "ideation",
        "systems",
        "metrics",
        "accessibility",
      ].filter((tag) => !body.coverage.includes(tag));
      if (missing.length > 4) {
        coverageNudge = `Consider exploring: ${missing.slice(0, 2).join(", ")}`;
      }
    }

    return NextResponse.json({ nudge, coverageNudge });
  } catch (error: any) {
    console.error("Coach API error:", error);

    // Provide helpful fallback based on error type
    let fallbackNudge = "Keep going! What are you thinking about next?";

    if (error?.message?.includes("timeout")) {
      fallbackNudge = "Tell me more about your thinking process.";
      console.warn("Gemini API timeout - using fallback response");
    } else if (error?.message?.includes("quota") || error?.message?.includes("RESOURCE_EXHAUSTED")) {
      fallbackNudge = "What aspect of the design would you like to explore next?";
      console.warn("Gemini API quota exceeded - using fallback response");
    } else if (error?.status === 500 || error?.error?.status === "INTERNAL") {
      fallbackNudge = "Can you walk me through your current approach?";
      console.warn("Gemini API internal error - using fallback response");
    }

    // Return fallback instead of failing completely
    return NextResponse.json({
      nudge: fallbackNudge,
      coverageNudge: undefined,
      fallback: true
    });
  }
}
