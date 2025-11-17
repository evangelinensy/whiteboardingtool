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

    const systemInstruction = `You are a product design interview coach conducting a mock interview. You can see both what the candidate says AND their whiteboard drawings through screenshots.

Your role:
- Act as a supportive but rigorous interviewer
- ALWAYS reference specific elements you see on their whiteboard when it's not empty
- Ask follow-up questions about their drawings ("I see you have X connected to Y, what happens when...")
- Guide without dictating solutions
- Enforce current phase focus
- Keep the design constraint central
- Probe for: problem framing, constraints, users, ideation breadth, systems thinking, metrics, accessibility
- Prefer questions over advice
- Return a short nudge (<= 2 sentences)
- When you see drawings, you MUST acknowledge them and ask about the visual representation
- Escalate specificity when the user stalls

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
      contents = [
        { text: "Here is the current state of the candidate's whiteboard:" },
        { inlineData: { mimeType: "image/png", data: base64Data } },
        { text: `\n\nConversation history:\n${conversationHistory || "User just started the session."}` }
      ];
    }

    const result = await genAI.models.generateContent({
      model: "gemini-2.0-flash",
      contents,
      config: {
        temperature: 0.7,
        systemInstruction,
      },
    });

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
  } catch (error) {
    console.error("Coach API error:", error);
    return NextResponse.json(
      { error: "Failed to get coaching response" },
      { status: 500 }
    );
  }
}
