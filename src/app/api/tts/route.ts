import { GoogleGenAI } from "@google/genai";
import { NextRequest, NextResponse } from "next/server";

const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

interface TTSRequest {
  text: string;
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

    const result = await genAI.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: body.text,
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

    // Extract audio data from response - the result itself contains candidates
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

    // If it's PCM data, convert to WAV
    if (mimeType.includes("pcm") || mimeType.includes("raw")) {
      const pcmBuffer = Buffer.from(audioData, "base64");
      const wavBuffer = pcmToWav(pcmBuffer);
      return new NextResponse(new Uint8Array(wavBuffer), {
        headers: {
          "Content-Type": "audio/wav",
        },
      });
    }

    // Return audio directly
    const audioBuffer = Buffer.from(audioData, "base64");
    return new NextResponse(new Uint8Array(audioBuffer), {
      headers: {
        "Content-Type": mimeType,
      },
    });
  } catch (error) {
    console.error("TTS API error:", error);

    // Check for quota/rate limit errors
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes("429") || errorMessage.includes("RESOURCE_EXHAUSTED") || errorMessage.includes("quota")) {
      return NextResponse.json(
        { error: "TTS quota exceeded. Audio disabled temporarily.", code: "QUOTA_EXCEEDED" },
        { status: 429 }
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
