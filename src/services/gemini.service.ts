
import { Injectable } from '@angular/core';
import { GoogleGenAI, GenerateContentResponse, Type } from '@google/genai';

export interface ReplyOption {
  title: string;
  reply: string;
}

export interface ApiResponse {
  options: ReplyOption[];
}

@Injectable({
  providedIn: 'root',
})
export class GeminiService {
  private ai: GoogleGenAI;

  constructor() {
    const apiKey = process.env.API_KEY;
    if (!apiKey) {
      // In a real app, you'd have a more robust way to handle this,
      // but for this environment, we throw an error to indicate a fatal misconfiguration.
      throw new Error("API_KEY environment variable not set.");
    }
    this.ai = new GoogleGenAI({ apiKey });
  }

  private async fileToGenerativePart(file: File) {
    const base64EncodedDataPromise = new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
      reader.readAsDataURL(file);
    });
    return {
      inlineData: { data: await base64EncodedDataPromise, mimeType: file.type },
    };
  }

  async getTextFromImage(image: File): Promise<string> {
    const model = 'gemini-2.5-flash';
    const imagePart = await this.fileToGenerativePart(image);
    const prompt = "Extract all text from the provided image, which is a screenshot of a chat. Focus on transcribing the last message sent by the other person. Return only the transcribed text, without any additional comments, labels, or explanations.";

    try {
      const response = await this.ai.models.generateContent({
        model,
        contents: { parts: [imagePart, { text: prompt }] },
      });
      return response.text.trim();
    } catch (error) {
      console.error('Error extracting text from image:', error);
      throw new Error('Could not read the text from the screenshot. Please try again or type it manually.');
    }
  }

  async generateReplies(userInput: string, image?: File | null): Promise<ApiResponse> {
    const model = 'gemini-2.5-flash';

    const systemPrompt = `You are "Desi Wingman," an expert dating coach for the modern Bangladeshi dating scene. You are witty, culturally aware, and act as a supportive friend. Your goal is to help the user with replies for Tinder, Bumble, etc.

PRIME DIRECTIVE: LANGUAGE & SCRIPT MATCHING
Your reply MUST match the linguistic style of the "Girl's" message provided by the user.
1. Banglish (Bengali in English script): If she writes "Ki koro?", you reply in Banglish like "Chill kortesi, tumi?". Use BD slang (Pera, Joss, Chill).
2. Bengali (বাংলা script): If she writes "কি করো?", you reply in pure Bengali script.
3. English: If she writes "What's up?", you reply in casual, modern English.

VISION/SCREENSHOT ANALYSIS PROTOCOL:
If a screenshot is provided, perform a deep analysis:
1.  **Identify her Messages:** Focus on the messages from her (typically gray/white bubbles).
2.  **Analyze Timestamps & Pauses:** Scrutinize the timestamps. A long delay in her reply (e.g., several hours) could mean she's busy or has lower interest. A quick reply suggests higher interest. Adjust the tone of your suggestions accordingly.
3.  **Analyze Message Length:** Is she writing paragraphs (high interest) or one-word answers (low interest)? Match her investment level.
4.  **Look for Engagement Cues:**
    - **Typing Indicators:** If a "typing..." bubble is visible, it's a strong sign of engagement. Your suggested replies can be more immediate and engaging.
    - **Read Receipts:** Check for read receipts ('Seen', blue ticks). If she read your message long ago but hasn't replied, this indicates low interest. The 'Cool/Casual' option should be prioritized.
5.  **Understand the Context:** Read the last few messages to grasp the conversation's topic and emotional tone.

RESPONSE STRATEGY:
For EVERY input, you MUST provide exactly 3 distinct options.
1. Option 1: The Playful/Funny ("Rizz" Option) - Tease her, be sarcastic, make her laugh.
2. Option 2: The Sweet/Charming ("Lover Boy" Option) - Show genuine interest, compliment, escalate slightly.
3. Option 3: The Cool/Casual ("Mystery" Option) - Match her energy, play it cool, be brief.

GUARDRAILS:
- NO harassment, creepy, or overly sexual replies.
- NO desperate replies. Suggest a dignified exit if she's ghosting.

The user has provided the following context. Analyze it and generate the 3 reply options.`;
    
    const contents: any[] = [{ text: systemPrompt }];
    
    if (image) {
      const imagePart = await this.fileToGenerativePart(image);
      contents.push(imagePart);
    }

    if (userInput) {
      contents.push({ text: `Her message text: "${userInput}"`});
    }

    if (image && !userInput) {
        contents.push({ text: "Analyze the screenshot and provide replies to the last message from her."});
    }

    try {
      const response: GenerateContentResponse = await this.ai.models.generateContent({
        model,
        contents: { parts: contents },
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              options: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    title: { type: Type.STRING },
                    reply: { type: Type.STRING }
                  },
                  required: ["title", "reply"]
                }
              }
            },
            required: ["options"]
          }
        }
      });
      
      const jsonText = response.text.trim();
      const parsedResponse = JSON.parse(jsonText);

      if (!parsedResponse.options || parsedResponse.options.length < 1) {
        throw new Error('Wingman is speechless... Try rephrasing or a different screenshot.');
      }
      return parsedResponse as ApiResponse;

    } catch (error) {
      console.error('Error calling Gemini API:', error);
      throw new Error('Failed to get advice from Wingman. The model might be busy, please try again.');
    }
  }
}
