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
  
  return `You are a professional photo editor. I uploaded a real photo. You must edit it like Photoshop — changing only the clothes, background, and adding a trophy. Do NOT redraw, regenerate, or "improve" the people in the photo.

=== THE ONLY RULE THAT MATTERS ===
Use the faces from the uploaded photo exactly as they are. Do NOT change the shape, size, features, expression, or skin tone of any face. Do NOT "make them look better" or "more photogenic." Keep the faces IDENTICAL to the original.

=== PEOPLE — PRESERVE COMPLETELY ===
- The photo has 1, 2, 3, 4, 5 or more people. Keep ALL of them.
- Do NOT remove, add, or change the count of people.
- Do NOT change body type, weight, height, or proportions.
- Do NOT change the pose, posture, or relative positions.
- Do NOT change hair, glasses, jewelry, or accessories.
- Do NOT smooth skin, remove wrinkles, or add makeup.
- Do NOT change eye color, nose shape, jawline, or smile.

=== FACES — EXACT COPY ===
- Use the faces from the original photo EXACTLY.
- Do NOT redraw, regenerate, or synthesize any face.
- Do NOT "enhance" or "beautify" the faces.
- Do NOT change facial expressions.
- The faces in the output must be instantly recognizable as the same people.

=== WHAT TO CHANGE ===
1. CLOTHING ONLY:
   - Replace ONLY the clothing with ${teamData.name} national team jersey
   - Every single person gets the jersey
   - Jersey must fit naturally on each person's body

2. TROPHY:
   - Add ONE FIFA World Cup Trophy held by ONE person

3. BACKGROUND ONLY:
   - Replace the background with a World Cup stadium
   - Add green pitch, stadium lights, confetti

=== QUALITY ===
- The final image should look like a professional celebration photo
- Natural lighting, clear image, no cartoon or illustration style
- But do NOT sacrifice face accuracy for "photorealism"`;
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
