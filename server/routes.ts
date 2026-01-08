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
  
  return `Transform this photo into a World Cup celebration scene.

=== ABSOLUTE PROHIBITIONS (NEVER DO THESE) ===
- DO NOT remove, delete, crop, or hide ANY person from the image
- DO NOT change, alter, replace, or modify ANY person's face
- DO NOT change ANY person's facial features, bone structure, or face shape
- DO NOT change skin tone, eye color, or facial hair of any person
- DO NOT generate new faces or swap faces between people
- DO NOT reduce the number of people in the image
- DO NOT leave any person without the team jersey

=== IDENTITY PRESERVATION (MANDATORY FOR EVERY PERSON) ===
For EACH person in the photo, preserve EXACTLY:
- Their exact face as it appears in the original photo (this is the canonical reference)
- Their exact facial expression and emotion
- Their exact skin tone and complexion
- Their exact hairstyle, hair color, and hair length
- Their exact facial hair (beard, mustache) if present
- Their exact glasses or accessories if visible
- Their exact body position and pose
The faces in the input image are the ONLY acceptable faces in the output.

=== MANDATORY EDITS (APPLY TO ALL PEOPLE) ===
1. JERSEY FOR EVERY PERSON:
   - Change the clothing of EVERY single person to the ${teamData.name} national team jersey
   - No exceptions - every person must wear the ${teamData.name} jersey
   - No person should remain in their original clothing
   - Jersey colors: ${teamData.colors.primary} primary, ${teamData.colors.secondary} secondary

2. TROPHY (ONE PERSON ONLY):
   - Add the FIFA World Cup Trophy (golden trophy with globe)
   - Only ONE person holds the trophy at chest or waist level
   - Other people celebrate naturally around the trophy holder

3. BACKGROUND:
   - Replace background with a World Cup stadium setting
   - Include packed stadium, green pitch, dramatic lighting, confetti

=== FINAL VERIFICATION ===
Before outputting, verify:
- Same number of people as input image
- Every face is IDENTICAL to the input photo
- Every person wears the ${teamData.name} jersey
- No original clothing visible on anyone

If any rule conflicts, ALWAYS prioritize preserving every person's exact face and keeping all people in the image.`;
}

async function transformImage(originalImageBase64: string, team: TeamId): Promise<string> {
  const ai = getAIClient();
  const base64Data = originalImageBase64.replace(/^data:image\/\w+;base64,/, "");
  const prompt = getTransformationPrompt(team);
  
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-image",
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
