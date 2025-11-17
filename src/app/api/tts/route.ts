import { GoogleGenAI } from "@google/genai";
import { NextRequest, NextResponse } from "next/server";

const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

interface TTSRequest {
  text: string;
}

// Fallback to Deepgram TTS when Gemini quota is exceeded
async function generateDeepgramTTS(text: string): Promise<Buffer> {
  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) {
    throw new Error("Deepgram API key not configured");
  }

  const response = await fetch("https://api.deepgram.com/v1/speak?model=aura-asteria-en", {
    method: "POST",
    headers: {
      "Authorization": `Token ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Deepgram TTS failed: ${response.status} ${errorText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

async function generateGeminiTTS(text: string): Promise<{ buffer: Buffer; mimeType: string }> {
  const result = await genAI.models.generateContent({
    model: "gemini-2.5-flash-preview-tts",
    contents: text,
    config: {
      responseModalities: ["AUDIO"],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: {
            voiceName: "Kore",
          },
        },
      },
    },
  });

  const candidates = result.candidates;
  if (!candidates || candidates.length === 0) {
    throw new Error("No audio response generated");
  }

  const candidate = candidates[0];
  if (!candidate.content || !candidate.content.parts) {
    throw new Error("No content in response");
  }

  const audioPart = candidate.content.parts.find(
    (part) => part.inlineData && part.inlineData.mimeType?.includes("audio")
  );

  if (!audioPart || !audioPart.inlineData) {
    throw new Error("No audio data in response");
  }

  const audioData = audioPart.inlineData.data;
  const mimeType = audioPart.inlineData.mimeType || "audio/wav";

  if (!audioData) {
    throw new Error("No audio data found");
  }

  return { buffer: Buffer.from(audioData, "base64"), mimeType };
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as TTSRequest;

    if (!body.text) {
      return NextResponse.json(
        { error: "Missing text field" },
        { status: 400 }
      );
    }

    let audioBuffer: Buffer;
    let mimeType = "audio/wav";
    let usedFallback = false;

    // Try Gemini first, fall back to Deepgram on quota errors
    try {
      const geminiResult = await generateGeminiTTS(body.text);
      audioBuffer = geminiResult.buffer;
      mimeType = geminiResult.mimeType;

      // If it's PCM data, convert to WAV
      if (mimeType.includes("pcm") || mimeType.includes("raw")) {
        audioBuffer = pcmToWav(audioBuffer);
        mimeType = "audio/wav";
      }
    } catch (geminiError) {
      const errorMessage = geminiError instanceof Error ? geminiError.message : String(geminiError);

      // Check if it's a quota/rate limit error - fall back to Deepgram
      if (errorMessage.includes("429") || errorMessage.includes("RESOURCE_EXHAUSTED") || errorMessage.includes("quota")) {
        console.log("Gemini TTS quota exceeded, falling back to Deepgram");
        audioBuffer = await generateDeepgramTTS(body.text);
        mimeType = "audio/mpeg"; // Deepgram returns MP3
        usedFallback = true;
      } else {
        throw geminiError;
      }
    }

    const response = new NextResponse(new Uint8Array(audioBuffer), {
      headers: {
        "Content-Type": mimeType,
      },
    });

    if (usedFallback) {
      response.headers.set("X-TTS-Provider", "deepgram");
    }

    return response;
  } catch (error) {
    console.error("TTS API error:", error);

    const errorMessage = error instanceof Error ? error.message : String(error);

    // If both providers failed
    if (errorMessage.includes("Deepgram")) {
      return NextResponse.json(
        { error: "All TTS providers failed", code: "TTS_UNAVAILABLE" },
        { status: 503 }
      );
    }

    return NextResponse.json(
      { error: "Failed to generate speech" },
      { status: 500 }
    );
  }
}

// Convert PCM to WAV format
function pcmToWav(pcmData: Buffer): Buffer {
  const sampleRate = 24000;
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;

  const headerSize = 44;
  const wavBuffer = Buffer.alloc(headerSize + pcmData.length);

  // RIFF header
  wavBuffer.write("RIFF", 0);
  wavBuffer.writeUInt32LE(36 + pcmData.length, 4);
  wavBuffer.write("WAVE", 8);

  // fmt chunk
  wavBuffer.write("fmt ", 12);
  wavBuffer.writeUInt32LE(16, 16); // chunk size
  wavBuffer.writeUInt16LE(1, 20); // PCM format
  wavBuffer.writeUInt16LE(numChannels, 22);
  wavBuffer.writeUInt32LE(sampleRate, 24);
  wavBuffer.writeUInt32LE(byteRate, 28);
  wavBuffer.writeUInt16LE(blockAlign, 32);
  wavBuffer.writeUInt16LE(bitsPerSample, 34);

  // data chunk
  wavBuffer.write("data", 36);
  wavBuffer.writeUInt32LE(pcmData.length, 40);
  pcmData.copy(wavBuffer, 44);

  return wavBuffer;
}
