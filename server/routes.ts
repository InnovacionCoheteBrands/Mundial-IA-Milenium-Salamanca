import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { GoogleGenAI, Modality } from "@google/genai";
import { teamInfo, type TeamId } from "@shared/schema";

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

async function generatePrompt(team: TeamId): Promise<string> {
  const ai = getAIClient();
  const teamData = teamInfo[team];
  
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: [
      {
        role: "user",
        parts: [
          {
            text: `Genera un prompt detallado en inglés para crear una imagen de un fan de ${teamData.name} en un estadio del mundial 2026. 
            
El prompt debe describir:
- La camiseta oficial del equipo (colores: ${teamData.colors.primary} y ${teamData.colors.secondary})
- Un ambiente vibrante de estadio mundialista con multitudes celebrando
- Iluminación cinematográfica dramática
- El fan debe verse emocionado y apasionado
- CRÍTICO: Los rasgos faciales de la persona deben permanecer completamente intactos y reconocibles

Responde SOLO con el prompt en inglés, sin explicaciones adicionales. El prompt debe ser conciso (máximo 200 palabras).`,
          },
        ],
      },
    ],
  });

  return response.text || `A passionate ${teamData.name} fan celebrating in a vibrant World Cup 2026 stadium, wearing the official team jersey, dramatic cinematic lighting, enthusiastic crowd in background, preserve exact facial features`;
}

async function transformImage(originalImageBase64: string, prompt: string): Promise<string> {
  const ai = getAIClient();
  const base64Data = originalImageBase64.replace(/^data:image\/\w+;base64,/, "");
  
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
            text: `Transform this photo following these instructions. CRITICAL: You must preserve the person's exact facial features, face shape, and identity - do not alter the face in any way.

${prompt}

Only modify:
1. The clothing - change to the team jersey described
2. The background - add a World Cup stadium atmosphere
3. Lighting and atmosphere - make it cinematic and celebratory

Keep the original person's face, hair style, and body completely unchanged. The result should look like the same person is now in the stadium wearing the team colors.`,
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

      const prompt = await generatePrompt(team as TeamId);
      console.log("Generated prompt:", prompt.substring(0, 100) + "...");

      const transformedImage = await transformImage(image, prompt);
      console.log("Image transformation complete");

      const transformation = await storage.createTransformation({
        team,
        originalImageUrl: image,
        transformedImageUrl: transformedImage,
        promptUsed: prompt,
      });

      res.json({
        success: true,
        transformedImage,
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
      const transformations = await storage.getAllTransformations();
      res.json(transformations);
    } catch (error) {
      console.error("Error fetching transformations:", error);
      res.status(500).json({ error: "Failed to fetch transformations" });
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
