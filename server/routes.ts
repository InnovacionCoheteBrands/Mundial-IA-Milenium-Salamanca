import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { GoogleGenAI, Modality } from "@google/genai";
import { teamInfo, type TeamId } from "@shared/schema";
import sharp from "sharp";
import path from "path";
import fs from "fs";

const WATERMARK_PATH = path.join(process.cwd(), "attached_assets", "logo_milenium__1767829210784.png");

async function addWatermarkToImage(imageBase64: string): Promise<string> {
  try {
    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");
    const imageBuffer = Buffer.from(base64Data, "base64");
    
    const mainImage = sharp(imageBuffer);
    const metadata = await mainImage.metadata();
    
    if (!metadata.width || !metadata.height) {
      console.log("Could not get image metadata, returning original");
      return imageBase64;
    }

    const logoBuffer = fs.readFileSync(WATERMARK_PATH);
    const logoMaxWidth = Math.floor(metadata.width * 0.2);
    const logoMaxHeight = Math.floor(metadata.height * 0.15);
    
    const resizedLogo = await sharp(logoBuffer)
      .resize(logoMaxWidth, logoMaxHeight, { fit: "inside" })
      .toBuffer();
    
    const logoMeta = await sharp(resizedLogo).metadata();
    const logoWidth = logoMeta.width || logoMaxWidth;
    const logoHeight = logoMeta.height || logoMaxHeight;
    
    const padding = Math.floor(Math.min(metadata.width, metadata.height) * 0.03);
    const left = metadata.width - logoWidth - padding;
    const top = metadata.height - logoHeight - padding;

    const watermarkedBuffer = await mainImage
      .composite([
        {
          input: resizedLogo,
          left,
          top,
        },
      ])
      .jpeg({ quality: 92 })
      .toBuffer();

    return `data:image/jpeg;base64,${watermarkedBuffer.toString("base64")}`;
  } catch (error) {
    console.error("Watermark error:", error);
    return imageBase64;
  }
}

function getAIClient() {
  const apiKey = process.env.AI_INTEGRATIONS_GEMINI_API_KEY;
  const baseUrl = process.env.AI_INTEGRATIONS_GEMINI_BASE_URL;
  
  if (!apiKey || !baseUrl) {
    throw new Error("AI integration not configured. Please ensure Gemini AI integration is set up.");
  }
  
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      apiVersion: "",
      baseUrl,
    },
  });
}

function getTransformationPrompt(team: TeamId): string {
  const teamData = teamInfo[team];
  
  return `You are a professional photo retoucher. Edit this real photograph to create a World Cup celebration scene. The result MUST look like a genuine photograph taken by a press photographer — NOT a digital painting, illustration, or CGI render.

=== RENDERING STYLE — NON-NEGOTIABLE ===
REQUIRED:
- 100% photorealistic output — indistinguishable from a real DSLR photo
- Photojournalism quality: sharp, natural lighting, authentic skin texture, real fabric wrinkles
- Cinematic depth of field, realistic stadium lighting (floodlights, lens flare)
- Natural shadows and highlights consistent with real-world physics
- Film-like grain and sharpness — looks like it was shot with a Canon EOS R5 or Sony A1

STRICTLY FORBIDDEN (these make it look fake or cartoon):
- NO cartoon, comic, anime, or illustration style — ever
- NO cel shading, flat colors, or painterly brush strokes
- NO 3D CGI rendering or Pixar/game-engine look
- NO digital art, concept art, or fantasy illustration aesthetics
- NO over-saturated "hyper-stylized" post-processing
- NO artificial smoothing of skin (keep real pores, stubble, imperfections)
- If the output looks like an illustration or video game character, REJECT and redo

The photo may contain 1, 2, 3, 4, 5 or more people - ALL must be preserved and transformed.

=== ABSOLUTE PROHIBITIONS - NEVER DO ANY OF THESE ===
PEOPLE:
- NEVER remove, delete, hide, or crop out ANY person
- NEVER add new people that weren't in the original
- NEVER reduce the count of people in the image

FACES (CRITICAL - DO NOT MODIFY):
- NEVER change, replace, alter, or regenerate ANY face
- NEVER modify facial features, bone structure, jaw, nose, eyes, mouth
- NEVER change skin tone, skin texture, or complexion
- NEVER change eye color or eye shape
- NEVER remove or add facial hair (beard, mustache, stubble)
- NEVER generate synthetic or AI faces - use ONLY the original faces
- NEVER swap faces between people

BODIES (CRITICAL - DO NOT MODIFY):
- NEVER change body type, body shape, or body size
- NEVER change height proportions between people
- NEVER change weight or build (thin, average, heavy)
- NEVER change shoulder width or body frame
- NEVER alter arms, hands, or body posture significantly

=== WHAT TO PRESERVE FOR EACH PERSON ===
For EVERY person (whether 1 person or 5+ people), keep EXACTLY:
- Their EXACT face pixel-for-pixel from the input photo
- Their exact body type, size, and proportions
- Their exact skin tone and complexion
- Their exact hairstyle, hair color, hair length
- Their exact pose and body position
- Their glasses, jewelry, or accessories if visible
- Their relative positions to each other

=== ONLY THESE CHANGES ARE ALLOWED ===
1. CLOTHING ONLY:
   - Replace ONLY the clothing with ${teamData.name} national team jersey
   - Every single person gets the jersey - NO EXCEPTIONS
   - Jersey must fit naturally on each person's actual body

2. ONE TROPHY:
   - Add FIFA World Cup Trophy held by ONE person
   - Other people celebrate around naturally

3. BACKGROUND ONLY:
   - Replace background with World Cup stadium
   - Stadium, green pitch, lights, confetti

=== VERIFICATION CHECKLIST ===
Count people in input → Output must have SAME count
Each face → Must be IDENTICAL to input (not similar - IDENTICAL)
Each body → Same type/size as input
Each person → Wearing ${teamData.name} jersey
Original clothing → None visible

PRIORITY: If anything conflicts, preserve faces and bodies EXACTLY as they appear in the input photo.`;
}

async function transformImage(originalImageBase64: string, team: TeamId): Promise<string> {
  const ai = getAIClient();
  const base64Data = originalImageBase64.replace(/^data:image\/\w+;base64,/, "");
  const prompt = getTransformationPrompt(team);
  
  const response = await ai.models.generateContent({
    model: "gemini-3-pro-image-preview",
    contents: [
      {
        role: "user",
        parts: [
          {
            inlineData: {
              mimeType: "image/jpeg",
              data: base64Data,
            },
          },
          {
            text: prompt,
          },
        ],
      },
    ],
    config: {
      responseModalities: [Modality.TEXT, Modality.IMAGE],
    },
  });

  const candidate = response.candidates?.[0];
  const imagePart = candidate?.content?.parts?.find(
    (part: { inlineData?: { data?: string; mimeType?: string } }) => part.inlineData
  );

  if (!imagePart?.inlineData?.data) {
    throw new Error("No image data in response");
  }

  const mimeType = imagePart.inlineData.mimeType || "image/png";
  return `data:${mimeType};base64,${imagePart.inlineData.data}`;
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  app.post("/api/transform", async (req, res) => {
    try {
      const { team, image } = req.body;

      if (!team || !image) {
        return res.status(400).json({ error: "Team and image are required" });
      }

      if (!teamInfo[team as TeamId]) {
        return res.status(400).json({ error: "Invalid team selected" });
      }

      console.log(`Starting transformation for team: ${team}`);

      const prompt = getTransformationPrompt(team as TeamId);
      console.log("Using prompt for transformation");

      const transformedImage = await transformImage(image, team as TeamId);
      console.log("Image transformation complete");

      const watermarkedImage = await addWatermarkToImage(transformedImage);
      console.log("Watermark applied");

      const transformation = await storage.createTransformation({
        team,
        originalImageUrl: image,
        transformedImageUrl: watermarkedImage,
        promptUsed: prompt,
      });

      res.json({
        success: true,
        transformedImage: watermarkedImage,
        transformationId: transformation.id,
      });
    } catch (error) {
      console.error("Transformation error:", error);
      res.status(500).json({
        error: "Failed to transform image",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  app.get("/api/transformations", async (req, res) => {
    try {
      res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
      res.set("Pragma", "no-cache");
      res.set("Expires", "0");
      const transformations = await storage.getAllTransformations();
      res.json(transformations);
    } catch (error) {
      console.error("Error fetching transformations:", error);
      res.status(500).json({ error: "Failed to fetch transformations" });
    }
  });

  app.get("/api/images", async (req, res) => {
    try {
      res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
      res.set("Pragma", "no-cache");
      res.set("Expires", "0");
      res.set("Surrogate-Control", "no-store");
      const transformations = await storage.getAllTransformations();
      res.json(transformations);
    } catch (error) {
      console.error("Error fetching images:", error);
      res.status(500).json({ error: "Failed to fetch images" });
    }
  });

  app.get("/api/transformations/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const transformation = await storage.getTransformation(id);

      if (!transformation) {
        return res.status(404).json({ error: "Transformation not found" });
      }

      res.json(transformation);
    } catch (error) {
      console.error("Error fetching transformation:", error);
      res.status(500).json({ error: "Failed to fetch transformation" });
    }
  });

  return httpServer;
}
