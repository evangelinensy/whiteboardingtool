import { GoogleGenAI } from "@google/genai";
import { NextRequest, NextResponse } from "next/server";

const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

interface Message {
  role: "coach" | "user";
  content: string;
}

interface EvaluateRequest {
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
  canvasPngBase64?: string;
}

interface RubricCategory {
  id: string;
  name: string;
  weight: number;
  description: string;
  levels: Record<string, string>;
  signal_keywords?: string[];
  negative_signals?: string[];
  visual_signals?: string[];
}

interface RubricConfig {
  rubric_version: string;
  rubric_name: string;
  categories: RubricCategory[];
  scoring: {
    method: string;
    passing_threshold: number;
    exceptional_threshold: number;
  };
  feedback_instructions: {
    strengths: string;
    improvements: string;
    drills: string;
  };
}

interface EvaluationResult {
  rubric: Record<string, number>;
  strengths: string[];
  weaknesses: string[];
  drills: Array<{
    title: string;
    time: number;
    description: string;
  }>;
  narrative: string;
}

// Hardcoded rubric configuration (can't use fs in Edge runtime)
function loadRubricConfig(): RubricConfig {
  return {
    rubric_version: "1.0",
    rubric_name: "Product Design Interview Evaluation",
    categories: [
      {
        id: "problem_framing",
        name: "Problem Framing",
        weight: 1.5,
        description: "How well the candidate defines and scopes the problem",
        levels: {
          "1": "No clear problem definition; jumps straight to solutions",
          "2": "Vague problem statement; misses key constraints or context",
          "3": "Basic problem definition with some constraints identified",
          "4": "Clear problem statement with constraints, users, and scope defined",
          "5": "Exceptional framing with comprehensive problem analysis, stakeholder mapping, and success criteria"
        },
        signal_keywords: ["goal", "objective", "scope", "constraint", "problem", "define", "clarify"],
        negative_signals: ["I'll just build", "let me start designing", "the solution is"]
      },
      {
        id: "idea_breadth",
        name: "Ideation Breadth",
        weight: 1.0,
        description: "Ability to generate multiple diverse solutions before converging",
        levels: {
          "1": "Single solution proposed without exploring alternatives",
          "2": "Two solutions considered but superficially",
          "3": "Three or more solutions with basic trade-off analysis",
          "4": "Diverse solution space explored with clear selection criteria",
          "5": "Creative ideation with unique approaches, systematic evaluation, and principled convergence"
        },
        signal_keywords: ["alternative", "another approach", "we could also", "trade-off", "pros and cons"],
        negative_signals: ["this is the only way", "obviously we should"]
      },
      {
        id: "systems_thinking",
        name: "Systems Thinking",
        weight: 1.2,
        description: "Understanding of user flows, edge cases, and error states",
        levels: {
          "1": "Only considers happy path; no edge cases",
          "2": "Acknowledges edge cases exist but doesn't address them",
          "3": "Identifies some edge cases and basic error states",
          "4": "Comprehensive flow mapping with error handling and recovery",
          "5": "Deep systems analysis including state management, failure modes, and scalability"
        },
        signal_keywords: ["what if", "edge case", "error", "failure", "state", "flow", "recovery"],
        negative_signals: ["assume everything works", "users won't do that"]
      },
      {
        id: "visual_design",
        name: "Low-Fidelity Wireframing",
        weight: 1.0,
        description: "Quality and clarity of visual representations",
        levels: {
          "1": "No visual artifacts or illegible sketches",
          "2": "Basic shapes with no hierarchy or labels",
          "3": "Recognizable UI elements with some labeling",
          "4": "Clear wireframes with information hierarchy and component annotations",
          "5": "Professional-quality wireframes with interaction annotations, responsive considerations, and clear flow"
        },
        visual_signals: ["labeled boxes", "arrows showing flow", "component names", "state indicators"]
      },
      {
        id: "component_vocabulary",
        name: "UI/UX Pattern Knowledge",
        weight: 0.8,
        description: "Familiarity with standard design patterns and components",
        levels: {
          "1": "Uses vague terms like 'box' or 'thing'",
          "2": "Knows basic components (button, input) but limited vocabulary",
          "3": "Uses proper component names (modal, dropdown, toast, accordion)",
          "4": "References advanced patterns (lazy loading, infinite scroll, skeleton screens)",
          "5": "Expert vocabulary including interaction patterns, accessibility considerations, and platform-specific conventions"
        },
        signal_keywords: ["modal", "toast", "accordion", "carousel", "breadcrumb", "skeleton", "progressive disclosure", "infinite scroll", "lazy load"],
        negative_signals: ["that popup thing", "the box that appears"]
      },
      {
        id: "prioritization",
        name: "Prioritization & Scoping",
        weight: 1.0,
        description: "Making trade-offs and MVP decisions",
        levels: {
          "1": "No prioritization; tries to solve everything",
          "2": "Mentions priority but no clear framework",
          "3": "Basic MVP definition with some rationale",
          "4": "Clear prioritization with impact/effort analysis",
          "5": "Strategic scoping with phased rollout plan and success metrics"
        },
        signal_keywords: ["MVP", "priority", "must-have", "nice-to-have", "phase", "impact", "effort"],
        negative_signals: ["we need all of this", "can't ship without"]
      },
      {
        id: "metrics_discipline",
        name: "Metrics & Success Definition",
        weight: 0.8,
        description: "Ability to define and measure success",
        levels: {
          "1": "No mention of metrics or success criteria",
          "2": "Vague success statements like 'users will like it'",
          "3": "Basic metrics mentioned (DAU, conversion rate)",
          "4": "Specific KPIs with measurement approach",
          "5": "Comprehensive metrics framework with leading/lagging indicators and experimentation plan"
        },
        signal_keywords: ["KPI", "metric", "measure", "success", "experiment", "A/B test", "conversion", "retention"],
        negative_signals: ["we'll know if it works", "users will tell us"]
      },
      {
        id: "communication_clarity",
        name: "Communication Clarity",
        weight: 1.0,
        description: "How clearly the candidate articulates their thinking",
        levels: {
          "1": "Incoherent or jumbled thoughts; hard to follow",
          "2": "Some structure but frequent tangents",
          "3": "Generally clear with occasional confusion",
          "4": "Well-structured thinking with clear transitions",
          "5": "Exceptional clarity with storytelling, analogies, and logical flow"
        },
        signal_keywords: ["first", "next", "therefore", "because", "as a result", "to summarize"],
        negative_signals: ["um", "I don't know", "let me backtrack", "wait actually"]
      }
    ],
    scoring: {
      method: "weighted_average",
      passing_threshold: 3.0,
      exceptional_threshold: 4.5
    },
    feedback_instructions: {
      strengths: "Identify 2-3 specific moments where the candidate demonstrated strong skills",
      improvements: "Identify 2-3 specific areas with actionable advice for improvement",
      drills: "Suggest practice exercises tailored to the lowest-scoring categories"
    }
  };
}

// Build evaluation prompt from rubric config
function buildEvaluationPrompt(rubricConfig: RubricConfig | null): string {
  if (!rubricConfig) {
    // Fallback to default rubric
    return `{
  "rubric": {
    "problem_framing": 1-5,
    "idea_breadth": 1-5,
    "systems_thinking": 1-5,
    "prioritization": 1-5,
    "metrics_discipline": 1-5,
    "communication": 1-5,
    "velocity_with_rigor": 1-5
  },
  "strengths": [string],
  "weaknesses": [string],
  "drills": [{"title": string, "time": number, "description": string}],
  "narrative": string
}`;
  }

  // Build rubric schema from config
  const rubricSchema = rubricConfig.categories.reduce((acc, cat) => {
    acc[cat.id] = "1-5";
    return acc;
  }, {} as Record<string, string>);

  // Build detailed scoring criteria
  const scoringCriteria = rubricConfig.categories
    .map((cat) => {
      let criteria = `\n${cat.name} (${cat.id}) - Weight: ${cat.weight}\n`;
      criteria += `Description: ${cat.description}\n`;
      criteria += "Scoring Levels:\n";
      for (const [level, desc] of Object.entries(cat.levels)) {
        criteria += `  ${level}: ${desc}\n`;
      }
      if (cat.signal_keywords && cat.signal_keywords.length > 0) {
        criteria += `Positive signals: ${cat.signal_keywords.join(", ")}\n`;
      }
      if (cat.negative_signals && cat.negative_signals.length > 0) {
        criteria += `Negative signals: ${cat.negative_signals.join(", ")}\n`;
      }
      if (cat.visual_signals && cat.visual_signals.length > 0) {
        criteria += `Visual signals to look for: ${cat.visual_signals.join(", ")}\n`;
      }
      return criteria;
    })
    .join("\n");

  return `{
  "rubric": ${JSON.stringify(rubricSchema, null, 2).replace(/"/g, "").replace(/1-5/g, '"1-5"')},
  "strengths": [string],
  "weaknesses": [string],
  "drills": [{"title": string, "time": number, "description": string}],
  "narrative": string
}

DETAILED SCORING CRITERIA:
${scoringCriteria}

FEEDBACK INSTRUCTIONS:
- ${rubricConfig.feedback_instructions.strengths}
- ${rubricConfig.feedback_instructions.improvements}
- ${rubricConfig.feedback_instructions.drills}

SCORING METHOD: ${rubricConfig.scoring.method}
- Passing threshold: ${rubricConfig.scoring.passing_threshold}
- Exceptional threshold: ${rubricConfig.scoring.exceptional_threshold}`;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as EvaluateRequest;

    if (!body.prompt || !body.messages || !body.coverage) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Load rubric configuration
    const rubricConfig = loadRubricConfig();
    const evaluationSchema = buildEvaluationPrompt(rubricConfig);

    const systemInstruction = `You are evaluating a product design challenge session. You are an expert interviewer assessing the candidate's design skills, communication, and thinking process.

Produce compact JSON adhering exactly to this schema:
${evaluationSchema}

Evaluate based on:
- Design prompt: ${body.prompt}
- Coverage areas touched: ${body.coverage.join(", ") || "none"}
- Canvas artifacts: ${body.canvasSummary?.elementsCount || 0} elements (${body.canvasSummary?.rectanglesCount || 0} rectangles, ${body.canvasSummary?.textCount || 0} text labels, ${body.canvasSummary?.arrowsCount || 0} arrows)
- Text labels on canvas: ${body.canvasSummary?.titles?.slice(0, 5).join(", ") || "none"}

Return ONLY valid JSON, no markdown formatting or code blocks.`;

    const conversationHistory = body.messages
      .map((m) => `${m.role === "coach" ? "Coach" : "User"}: ${m.content}`)
      .join("\n");

    const result = await genAI.models.generateContent({
      model: "gemini-2.0-flash",
      contents: `Evaluate this design challenge session:\n\n${conversationHistory}`,
      config: {
        temperature: 0.2,
        systemInstruction,
      },
    });

    const responseText = result.text || "";

    // Try to parse the JSON response
    try {
      // Clean up potential markdown code blocks
      let jsonText = responseText.trim();
      if (jsonText.startsWith("```json")) {
        jsonText = jsonText.slice(7);
      } else if (jsonText.startsWith("```")) {
        jsonText = jsonText.slice(3);
      }
      if (jsonText.endsWith("```")) {
        jsonText = jsonText.slice(0, -3);
      }
      jsonText = jsonText.trim();

      const evaluation = JSON.parse(jsonText) as EvaluationResult;
      return NextResponse.json(evaluation);
    } catch {
      return NextResponse.json({
        error: "Failed to parse evaluation response",
        raw: responseText,
      });
    }
  } catch (error) {
    console.error("Evaluate API error:", error);
    return NextResponse.json(
      { error: "Failed to generate evaluation" },
      { status: 500 }
    );
  }
}
