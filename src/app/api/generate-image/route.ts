import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
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
    
    // Calculate total time
    const totalTime = promptTimeTaken + imageTimeTaken;
    
    // Return results without light sources
    return NextResponse.json({ 
      imageData,
      finalPrompt,
      userDescription: prompt,
      timings: {
        promptGeneration: promptTimeTaken,
        imageGeneration: imageTimeTaken,
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