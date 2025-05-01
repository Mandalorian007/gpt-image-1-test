import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI, createUserContent } from '@google/genai';

const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

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
 * Detect light sources in an image using Gemini
 */
async function geminiGenerateLights(b64Image: string | null): Promise<{
  lightSources: Array<{
    x: number;
    y: number;
    width: number;
    height: number;
    hexColor: string;
    label?: string;
  }>;
  lightError: string | null;
}> {
  let lightSources: Array<{
    x: number;
    y: number;
    width: number;
    height: number;
    hexColor: string;
    label?: string;
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
        hexColor: string;
        label?: string;
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
    const { imageData } = data;
    
    // Record start time
    const lightsStartTime = Date.now();
    
    // Detect light sources
    const lightResult = await geminiGenerateLights(imageData?.split(',')[1] || null);
    
    // Calculate time taken
    const lightsEndTime = Date.now();
    const lightsTimeTaken = lightsEndTime - lightsStartTime;
    
    // Return results
    return NextResponse.json({ 
      lightSources: lightResult.lightSources,
      lightError: lightResult.lightError,
      timeTaken: lightsTimeTaken
    });
  } catch (error) {
    console.error('Error detecting lights:', error);
    return NextResponse.json(
      { error: 'Failed to detect light sources' },
      { status: 500 }
    );
  }
} 