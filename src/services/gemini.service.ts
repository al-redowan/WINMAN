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

  /**
   * Analyzes text for inappropriate content using a separate Gemini call.
   * Throws an error if the content is flagged as inappropriate.
   */
  private async checkForInappropriateContent(text: string): Promise<void> {
    if (!text || text.trim() === '') {
      return; // No need to check empty strings
    }

    const model = 'gemini-2.5-flash';
    const safetyPrompt = `You are a content safety moderator. Analyze the following text to determine if it contains any explicit, harassing, hateful, threatening, or otherwise inappropriate content that violates community guidelines. Respond with only a JSON object. The object must have a key "inappropriate" (boolean) and, if true, a "reason" (string).

Text to analyze: "${text}"`;

    try {
      const response = await this.ai.models.generateContent({
        model,
        contents: { parts: [{ text: safetyPrompt }] },
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              inappropriate: { type: Type.BOOLEAN },
              reason: { type: Type.STRING },
            },
            required: ['inappropriate'],
          },
        },
      });

      const jsonText = response.text.trim();
      const safetyResult = JSON.parse(jsonText);

      if (safetyResult.inappropriate) {
        console.warn(`Content flagged as inappropriate. Reason: ${safetyResult.reason}`);
        throw new Error('This content was flagged as inappropriate and cannot be processed. Please adhere to community guidelines.');
      }
    } catch (error: any) {
      // If the error is the one we threw, re-throw it.
      if (error.message.includes('inappropriate')) {
          throw error;
      }
      console.error('Error during safety check:', error);
      // Let it pass if the safety check itself fails, to not block users due to transient API issues.
    }
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
      const extractedText = response.text.trim();

      // Safety Check
      await this.checkForInappropriateContent(extractedText);
      
      return extractedText;
    } catch (error) {
      console.error('Error processing image:', error);
      if (error instanceof Error && error.message.includes('inappropriate')) {
        throw error; // Re-throw the specific safety error
      }
      throw new Error('Could not process the screenshot. It may be unreadable or contain inappropriate content.');
    }
  }

  async generateReplies(userInput: string, image?: File | null): Promise<ApiResponse> {
    // Safety Check on user's direct text input
    await this.checkForInappropriateContent(userInput);

    const model = 'gemini-2.5-flash';

    const systemPrompt = `You are "Desi Wingman," an expert dating coach for the modern Bangladeshi dating scene. You are witty, culturally aware, and act as a supportive friend. Your goal is to help the user with replies for Tinder, Bumble, etc.

PRIME DIRECTIVE: LANGUAGE & SCRIPT MATCHING
Your reply MUST match the linguistic style of the "Girl's" message provided by the user.
1. Banglish (Bengali in English script): If she writes "Ki koro?", you reply in Banglish like "Chill kortesi, tumi?". Use BD slang (Pera, Joss, Chill).
2. Bengali (বাংলা script): If she writes "কি করো?", you reply in pure Bengali script.
3. English: If she writes "What's up?", you reply in casual, modern English.

VISION/SCREENSHOT ANALYSIS PROTOCOL:
If a screenshot is provided, you MUST perform a deep, nuanced analysis. This is critical.
1.  **Identify her Messages:** Focus on the messages from her (typically gray/white bubbles).
2.  **Analyze Timestamps for Pauses:** This is very important. Scrutinize the timestamps between messages. A long delay (hours) suggests lower interest or being busy, so your replies should be more casual. A quick reply suggests higher interest, allowing for more engaging or playful responses.
3.  **Analyze Message Length & Effort:** Does she write full sentences or just one-word answers? Match her effort. Low effort from her means you should suggest cooler, less invested replies.
4.  **Detect Engagement Cues (Crucial):**
    - **Typing Indicators:** Actively look for a "typing..." bubble or animation in the screenshot. This is a very strong signal of active engagement. If you see it, the user can be more forward or playful.
    - **Read Receipts:** Look for 'Seen', 'Read', or double-tick indicators. If the user's last message was seen a long time ago with no reply, this is a sign of disinterest. Your "Cool/Casual" option should reflect this by being detached or suggesting ending the conversation.
5.  **Understand the Context:** Read the last 3-4 messages to grasp the conversation's flow, topic, and emotional tone. Use all these visual cues to refine the tone and strategy of your 3 reply options.

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
      // Check if it's our custom safety error
      if (error instanceof Error && error.message.includes('inappropriate')) {
          throw error;
      }
      throw new Error('Failed to get advice from Wingman. The model might be busy, please try again.');
    }
  }
}
