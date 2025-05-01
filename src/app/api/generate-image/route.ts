import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const anthropic = new Anthropic({
  apiKey: process.env.CLAUDE_API_KEY || '',
});

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
 * Detect light sources in an image using Claude
 */
async function detectLightSources(b64Image: string | null): Promise<{
  lightSources: any[];
  lightError: string | null;
}> {
  let lightSources = [];
  let lightError = null;
  
  if (!b64Image) {
    return {
      lightSources: [],
      lightError: "No image data available for light detection"
    };
  }
  
  try {
    // Light detection prompt
    const lightDetectionPrompt = `Analyze this image and identify all light sources.

You MUST respond ONLY with a valid JSON array and nothing else. No explanations, no markdown.

For each light source, provide:
1. A bounding box with coordinates (x, y, width, height) where x and y are the top-left corner IN PIXELS.
2. The hexadecimal color code of the light source.

The image is 1024x1024 pixels.

JSON format:
[
  { "x": 100, "y": 200, "width": 50, "height": 50, "hexColor": "#FFAA00" }
]

Include magical glows, torches, lanterns, glowing crystals, runes, and any bright objects.
Your ENTIRE response must be ONLY valid JSON.`;

    // Make sure we have a valid base64 string for Claude
    let processedB64 = b64Image;
    // Remove any data URL prefix if it somehow got included
    if (processedB64.includes(',')) {
      processedB64 = processedB64.split(',')[1];
    }
    
    // Claude doesn't support data URLs directly, so send base64 in the content directly
    const lightDetectionResponse = await anthropic.messages.create({
      model: "claude-3-7-sonnet-20250219",
      max_tokens: 1000,
      system: "You are an AI specialized in detecting light sources in images. You MUST respond with ONLY a valid JSON array in the exact format requested, with no additional text.",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: "image/png",
                data: processedB64,
              },
            },
            {
              type: "text",
              text: lightDetectionPrompt,
            },
          ],
        },
      ],
    });
    
    // Extract the text content from Claude's response
    let claudeResponseText = '';
    for (const contentBlock of lightDetectionResponse.content) {
      if (contentBlock.type === 'text') {
        claudeResponseText = contentBlock.text;
        break;
      }
    }
    
    // Use our robust JSON extraction function
    lightSources = extractJsonFromText(claudeResponseText);
    if (lightSources.length === 0) {
      lightError = "No light sources detected or unable to parse JSON response";
    }
  } catch (err) {
    console.error("Error detecting lights with Claude:", err);
    lightSources = [];
    lightError = "Claude API error: " + (err instanceof Error ? err.message : String(err));
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
    const lightResult = { lightSources: [], lightError: null };//await detectLightSources(imageData?.split(',')[1] || null);
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