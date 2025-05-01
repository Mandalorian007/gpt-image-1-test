import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenAI, createUserContent } from '@google/genai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

const BATTLEMAP_PROMPT_TEMPLATE = `Generate a high-resolution, hand-drawn style top-down 2D dungeon battlemap optimized for virtual tabletops (e.g., Roll20, FoundryVTT).

Theme/Setting: [insert your setting here]

Design constraints:
	• The map must be completely flat and top-down, with no isometric or side-view elements.
	• Do not include visible grid lines, but ensure all layout respects an invisible 5-ft square grid system.
	• Internal scale guidelines:
	• Corridors or paths: 2–3 squares wide (10–15 ft)
	• Chambers or open areas: Minimum 6x6 squares (30x30 ft)
	• All doors, furniture, and features should align naturally to this scale.
	• Structure should include:
	• Multiple interconnected rooms or areas with non-linear pathways
	• Clearly defined transitions (doors, arches, gates, or natural equivalents)
	• At least one secret or locked area appropriate to the setting

Aesthetic and storytelling goals:
	• Emphasize visual drama, atmosphere, and immersion
	• Include at least one major visual focal point, such as:
	• Magical symbols, ancient artifacts, glowing flora, elevated platforms, strange monuments, or thematic centerpiece terrain
	• Use lighting, shading, and detail to reinforce the tone and story of the space
	• Do not include visible gridlines, text labels, characters, monsters, or tokens — focus purely on the environmental and architectural design`;

// More robust JSON extraction function
function extractJsonFromText(text: string): any[] {
  // Try direct parsing first
  try {
    const parsed = JSON.parse(text.trim());
    if (Array.isArray(parsed)) {
      return parsed;
    }
  } catch (e) {
    // Continue to regex methods if direct parsing fails
  }
  
  // Try to find JSON array with regex
  try {
    // Look for text that starts with [ and ends with ]
    const jsonRegex = /\[\s*{[\s\S]*}\s*\]/;
    const match = text.match(jsonRegex);
    
    if (match && match[0]) {
      return JSON.parse(match[0]);
    }
  } catch (e) {
    // Continue if this method fails
  }
  
  // Try a more permissive approach - look for anything between brackets
  try {
    const startIdx = text.indexOf('[');
    const endIdx = text.lastIndexOf(']');
    
    if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
      const jsonText = text.substring(startIdx, endIdx + 1);
      return JSON.parse(jsonText);
    }
  } catch (e) {
    // If all methods fail, return empty array
  }
  
  return [];
}

/**
 * Generate an enhanced prompt using GPT-4o
 */
async function generateEnhancedPrompt(userPrompt: string): Promise<string> {
  const generatedPromptResponse = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: "You are a specialized assistant that creates detailed prompts for generating D&D battlemap images. Given a base template and a user's scene description, create a comprehensive, tailored prompt for image generation that incorporates all the requirements from the template but adapts them to the specific environment and theme described by the user."
      },
      {
        role: "user",
        content: `I need you to generate a customized battlemap prompt based on this template:

${BATTLEMAP_PROMPT_TEMPLATE}

And this is the user's scene description: "${userPrompt}"

Please create a comprehensive, detailed prompt that adapts the template for this specific scene. Make any necessary adjustments based on whether it's indoors, outdoors, or has other special environmental factors. Return ONLY the complete prompt text with no additional explanations.`
      }
    ],
  });
  
  return generatedPromptResponse.choices[0].message.content || userPrompt;
}

/**
 * Generate image using GPT-Image-1
 */
async function generateImage(prompt: string): Promise<string | null> {
  const result = await openai.images.generate({
    model: "gpt-image-1",
    prompt,
    quality: "medium",
    size: "1024x1024"
  });
  
  // Extract base64 image data
  const b64Image = result.data?.[0]?.b64_json;
  return b64Image ? `data:image/png;base64,${b64Image}` : null;
}

/**
 * Detect light sources in an image using Gemini
 */
async function geminiGenerateLights(b64Image: string | null): Promise<{
  lightSources: Array<{
    x: number;
    y: number;
    width: number;
    height: number;
    hexColor: string;
  }>;
  lightError: string | null;
}> {
  let lightSources: Array<{
    x: number;
    y: number;
    width: number;
    height: number;
    hexColor: string;
  }> = [];
  let lightError = null;
  
  if (!b64Image) {
    return {
      lightSources: [],
      lightError: "No image data available for light detection"
    };
  }
  
  try {
    // Make sure we have a valid base64 string
    let processedB64 = b64Image;
    // Remove any data URL prefix if it somehow got included
    if (processedB64.includes(',')) {
      processedB64 = processedB64.split(',')[1];
    }
    
    // Prompt to detect light sources and return bounding boxes
    const lightDetectionPrompt = `Analyze this image and extract all light sources (torches, magical object glows, fires, crystals, runes, etc).

Return a JSON array with each light source having:
1. A "box_2d" property with coordinates [ymin, xmin, ymax, xmax] normalized to 0-1000
2. A "label" property describing the type of light source (e.g. "torch", "magical crystal", "glowing rune")
3. A "hexColor" property with the dominant color in standard hex format (e.g. "#FF9900")

Example: [
  {"box_2d": [200, 300, 250, 350], "label": "torch", "hexColor": "#FF9900"},
  {"box_2d": [500, 600, 550, 650], "label": "magic crystal", "hexColor": "#00CCFF"}
]

IMPORTANT: Return ONLY a valid JSON array. No explanation text, no code blocks.`;

    // Using the correct structure for the @google/genai package
    const response = await genAI.models.generateContent({
      model: "gemini-2.5-flash-preview-04-17", //"gemini-2.0-flash",
      contents: createUserContent([
        {
          inlineData: {
            mimeType: "image/png",
            data: processedB64
          }
        },
        lightDetectionPrompt
      ]),
    });
    
    const responseText = response.text || '';
    
    // Extract JSON from the response text
    let parsedResult = extractJsonFromText(responseText);
    
    // Process normalized box_2d coordinates from Gemini
    if (parsedResult && Array.isArray(parsedResult) && parsedResult.length > 0) {
      lightSources = parsedResult.map(item => {
        // Check if we have the expected box_2d format
        if (Array.isArray(item.box_2d) && item.box_2d.length === 4) {
          const [ymin, xmin, ymax, xmax] = item.box_2d;
          
          // Convert from 0-1000 normalized coordinates to 0-1 normalized
          return {
            x: xmin / 1000,
            y: ymin / 1000,
            width: (xmax - xmin) / 1000,
            height: (ymax - ymin) / 1000,
            label: item.label || "Unknown light source",
            hexColor: item.hexColor || "#FFAA00" // Default to amber if no color provided
          };
        }
        
        // Handle case where we might get direct x,y,width,height format (for backward compatibility)
        if (typeof item.x === 'number' && typeof item.y === 'number' && 
            typeof item.width === 'number' && typeof item.height === 'number') {
          return {
            x: item.x / 1024, // Normalize to 0-1
            y: item.y / 1024,
            width: item.width / 1024,
            height: item.height / 1024,
            label: item.label || "Unknown light source",
            hexColor: item.hexColor || "#FFAA00"
          };
        }
        
        console.error("Invalid light source data:", item);
        return null;
      }).filter(Boolean) as Array<{
        x: number;
        y: number;
        width: number;
        height: number;
        label: string;
        hexColor: string;
      }>;
    }
    
    if (lightSources.length === 0) {
      lightError = "No light sources detected or unable to parse JSON response from Gemini";
    }
  } catch (err) {
    console.error("Error detecting lights with Gemini:", err);
    lightSources = [];
    lightError = "Gemini API error: " + (err instanceof Error ? err.message : String(err));
  }
  
  return {
    lightSources,
    lightError
  };
}

export async function POST(request: NextRequest) {
  try {
    const data = await request.json();
    const { prompt } = data;
    
    // Step 1: Generate enhanced prompt
    const promptStartTime = Date.now();
    const finalPrompt = await generateEnhancedPrompt(prompt);
    const promptEndTime = Date.now();
    const promptTimeTaken = promptEndTime - promptStartTime;
    
    // Step 2: Generate image
    const imageStartTime = Date.now();
    const imageData = await generateImage(finalPrompt);
    const imageEndTime = Date.now();
    const imageTimeTaken = imageEndTime - imageStartTime;
    
    // Step 3: Detect light sources
    const lightsStartTime = Date.now();
    // Choose which light detection method to use (Claude or Gemini)
    
    // Use Gemini for light detection by default
    const lightResult = await geminiGenerateLights(imageData?.split(',')[1] || null);
    
    const lightsEndTime = Date.now();
    const lightsTimeTaken = lightsEndTime - lightsStartTime;
    
    // Calculate total time
    const totalTime = promptTimeTaken + imageTimeTaken + lightsTimeTaken;
    
    // Return all results
    return NextResponse.json({ 
      imageData,
      finalPrompt,
      userDescription: prompt,
      lightSources: lightResult.lightSources,
      lightError: lightResult.lightError,
      timings: {
        promptGeneration: promptTimeTaken,
        imageGeneration: imageTimeTaken,
        lightDetection: lightsTimeTaken,
        total: totalTime
      }
    });
  } catch (error) {
    console.error('Error generating image:', error);
    return NextResponse.json(
      { error: 'Failed to generate image' },
      { status: 500 }
    );
  }
} 