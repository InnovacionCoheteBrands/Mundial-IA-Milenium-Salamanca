import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { GoogleGenAI, Modality } from "@google/genai";
import { teamInfo, type TeamId } from "@shared/schema";
import sharp, { type OverlayOptions } from "sharp";
import path from "path";
import fs from "fs";

const BRANDING_ASSETS = {
  milenium: path.join(process.cwd(), "attached_assets", "logo_milenium__1767829210784.png"),
  salamanca: path.join(process.cwd(), "attached_assets", "image_1781286515533.png"),
  trophy: path.join(process.cwd(), "attached_assets", "ChatGPT_Image_6_ene_2026,_15_32_44_1767829210783.png"),
} as const;

type BrandingAssetKey = keyof typeof BRANDING_ASSETS;

type BrandingAssetConfig = {
  key: BrandingAssetKey;
  maxWidthRatio: number;
  maxHeightRatio: number;
};

type BrandingAssetPlacement = {
  buffer: Buffer;
  width: number;
  height: number;
};

const BRANDING_LAYOUT: BrandingAssetConfig[] = [
  { key: "milenium", maxWidthRatio: 0.28, maxHeightRatio: 0.5 },
  { key: "salamanca", maxWidthRatio: 0.24, maxHeightRatio: 0.46 },
  { key: "trophy", maxWidthRatio: 0.14, maxHeightRatio: 0.68 },
];

async function loadBrandingAsset(
  asset: BrandingAssetConfig,
  imageWidth: number,
  contentHeight: number,
): Promise<BrandingAssetPlacement> {
  const assetBuffer = fs.readFileSync(BRANDING_ASSETS[asset.key]);
  const resizedBuffer = await sharp(assetBuffer)
    .resize(Math.max(1, Math.round(imageWidth * asset.maxWidthRatio)), Math.max(1, Math.round(contentHeight * asset.maxHeightRatio)), {
      fit: "inside",
      withoutEnlargement: true,
    })
    .png()
    .toBuffer();

  const resizedMetadata = await sharp(resizedBuffer).metadata();

  return {
    buffer: resizedBuffer,
    width: resizedMetadata.width || 0,
    height: resizedMetadata.height || 0,
  };
}

async function addBrandingToImage(imageBase64: string): Promise<string> {
  try {
    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");
    const imageBuffer = Buffer.from(base64Data, "base64");
    const mainImage = sharp(imageBuffer);
    const metadata = await mainImage.metadata();

    if (!metadata.width || !metadata.height) {
      console.log("Could not get image metadata, returning original");
      return imageBase64;
    }

    const imageWidth = metadata.width;
    const imageHeight = metadata.height;
    const paddingX = Math.max(24, Math.round(imageWidth * 0.035));
    const paddingY = Math.max(18, Math.round(imageHeight * 0.025));
    const bandHeight = Math.max(110, Math.round(imageHeight * 0.18));
    const bandTop = imageHeight;
    const contentHeight = Math.max(1, bandHeight - paddingY * 2);

    const assets = await Promise.all(
      BRANDING_LAYOUT.map((asset) => loadBrandingAsset(asset, imageWidth, contentHeight)),
    );

    if (assets.some((asset) => !asset.width || !asset.height)) {
      console.log("Could not size branding assets, returning original");
      return imageBase64;
    }

    const availableWidth = Math.max(1, imageWidth - paddingX * 2);
    const baseGap = Math.max(16, Math.round(imageWidth * 0.02));
    const totalAssetsWidth = assets.reduce((sum, asset) => sum + asset.width, 0);
    const totalGapWidth = baseGap * (assets.length - 1);
    const scaleFactor = Math.min(1, availableWidth / (totalAssetsWidth + totalGapWidth));

    const scaledAssets = await Promise.all(
      assets.map(async (asset) => {
        if (scaleFactor === 1) return asset;

        const scaledWidth = Math.max(1, Math.round(asset.width * scaleFactor));
        const scaledHeight = Math.max(1, Math.round(asset.height * scaleFactor));
        const scaledBuffer = await sharp(asset.buffer)
          .resize(scaledWidth, scaledHeight, {
            fit: "inside",
            withoutEnlargement: true,
          })
          .png()
          .toBuffer();

        return {
          buffer: scaledBuffer,
          width: scaledWidth,
          height: scaledHeight,
        };
      }),
    );

    const finalAssetsWidth = scaledAssets.reduce((sum, asset) => sum + asset.width, 0);
    const finalGapWidth = scaledAssets.length > 1
      ? Math.max(baseGap, Math.floor((availableWidth - finalAssetsWidth) / (scaledAssets.length - 1)))
      : 0;
    const contentWidth = finalAssetsWidth + finalGapWidth * (scaledAssets.length - 1);
    const startX = Math.max(paddingX, Math.round((imageWidth - contentWidth) / 2));

    let currentX = startX;
    const overlays: OverlayOptions[] = [
      {
        input: Buffer.from(
          `<svg width="${imageWidth}" height="${bandHeight}" xmlns="http://www.w3.org/2000/svg">
            <rect width="100%" height="100%" fill="#08150f"/>
          </svg>`,
        ),
        left: 0,
        top: bandTop,
      },
    ];

    for (const asset of scaledAssets) {
      const top = bandTop + Math.max(0, Math.round((bandHeight - asset.height) / 2));
      overlays.push({
        input: asset.buffer,
        left: currentX,
        top,
      });
      currentX += asset.width + finalGapWidth;
    }

    const brandedBuffer = await mainImage
      .extend({
        bottom: bandHeight,
        background: { r: 8, g: 21, b: 15, alpha: 1 },
      })
      .composite(overlays)
      .jpeg({ quality: 92 })
      .toBuffer();

    return `data:image/jpeg;base64,${brandedBuffer.toString("base64")}`;
  } catch (error) {
    console.error("Branding composition error:", error);
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
  const prompt = getTransformationPromptV2(team);
  
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

function getTransformationPromptV2(team: TeamId): string {
  const teamData = teamInfo[team];

  return `You are editing a REAL uploaded photo, not creating a new person. Treat the uploaded image as the single source of truth for identity and anatomy. The final result must look like a realistic sports celebration photograph edited from the original photo.

=== HIGHEST PRIORITY: PRESERVE IDENTITY EXACTLY ===
The people in the uploaded photo must remain unmistakably the same real people.
- Preserve each face exactly: facial structure, eyes, nose, mouth, jawline, cheeks, eyebrows, ears, skin tone, age, expression, and likeness.
- Preserve hairstyle, hairline, glasses, jewelry, beard, makeup, and visible personal traits.
- Do NOT beautify, stylize, redraw, re-age, de-age, slim, enlarge, or improve the people.
- Do NOT replace any face, invent any face, blend faces, or make anyone look like a different person.
- The faces must stay instantly recognizable to someone who knows the original people.

=== PRESERVE BODY AND PEOPLE COUNT ===
- Keep ALL people from the original image.
- Do NOT add or remove people.
- Preserve body type, body proportions, height, hands, arms, legs, and overall anatomy.
- Preserve the original camera perspective and subject scale as much as possible.
- Do NOT turn this into a different body, different person, or different anatomy.

=== POSE FLEXIBILITY: ONLY MINIMAL AND ONLY IF NEEDED ===
You may make a very small, natural pose adjustment ONLY if necessary so ONE person can hold the FIFA World Cup Trophy convincingly.
- Allowed: slight arm reposition, slight shoulder rotation, slight hand adjustment, slight torso adjustment.
- Not allowed: dramatic new pose, different stance, dance pose, exaggerated movement, major head turn, major body rotation, or changing the group arrangement.
- If the trophy can be added without changing pose, keep the original pose unchanged.

=== WHAT TO EDIT ===
1. CLOTHING
   - Replace ONLY the clothing with realistic ${teamData.name} national team jerseys.
   - Every person should wear the jersey naturally and believably.
   - Keep natural folds, shadows, fit, and body alignment.

2. TROPHY
   - Add exactly ONE FIFA World Cup Trophy.
   - The trophy must be held naturally by one real person from the original photo.
   - The trophy must match perspective, scale, lighting, and hand placement.

3. BACKGROUND
   - Replace the background with a realistic World Cup stadium celebration scene from field level or near the edge of the pitch, not a generic flat backdrop.
   - The environment should feel like a live post-match celebration inside the stadium bowl.
   - Show real stadium depth: visible grass or sideline area, stands full of people, bright stadium lights, and atmospheric perspective.
   - Include players or team figures in the background when appropriate, but keep them secondary, believable, and not distracting.
   - Include confetti mainly in the air and across the stands, not as an overwhelming foreground wall.
   - Keep the people from the uploaded photo as the main subject, not the background spectacle.

4. COMPOSITION DIRECTION
   - Aim for a premium sports editorial look, as if this was photographed during a real World Cup celebration.
   - Prefer a more immersive stadium composition: closer to the pitch, stronger depth, more believable crowd, and more cinematic energy.
   - Avoid the feeling of a pasted subject over a generic stadium stock image.
   - Integrate the subject naturally into the environment with coherent scale, lighting, shadows, and color temperature.

=== VARIATION WITHOUT LOSING REALISM ===
For each generation, create a different but plausible celebration photo by varying ONLY these elements:
- stadium angle or section
- field-level position or sideline perspective
- visible background players or staff
- confetti density and where it appears in the stands
- lighting mood
- crop distance
- trophy placement angle
- jersey wrinkles and fabric behavior
- background energy and celebration intensity

Choose one realistic combination per generation and avoid repeating the exact same composition when another natural option is possible.

=== SCENE VARIATION RULE ===
Use a similar celebration theme every time, but do NOT repeat the exact same stadium layout, same crowd pattern, same trophy angle, same confetti placement, or same camera framing in every result.
Each image should feel like a different real photograph taken in the same kind of event, not the same template reused.

=== VISUAL STYLE ===
- Photorealistic
- Real camera photo
- Natural skin texture
- Realistic lighting and shadows
- High detail
- Cohesive stadium atmosphere
- No cartoon, painting, 3D render, plastic skin, beauty filter, or fantasy look

=== HARD FAIL CONDITIONS TO AVOID ===
- altered identity
- different face
- different body
- synthetic or generic-looking person
- extra fingers or broken anatomy
- over-stylized image
- fake smile or changed expression
- dramatic pose change
- pasted-on look
- flat or empty background
- repeated template composition

=== FINAL GOAL ===
Return a realistic, premium, celebratory World Cup photo edit where the people are still clearly the exact same people from the uploaded image, now wearing ${teamData.name} jerseys in an immersive stadium celebration scene, with one person holding the World Cup Trophy naturally. The result should feel more dynamic, more integrated, and more editorial, while identity accuracy remains more important than spectacle.`;
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

      const prompt = getTransformationPromptV2(team as TeamId);
      console.log("Using prompt for transformation");

      const transformedImage = await transformImage(image, team as TeamId);
      console.log("Image transformation complete");

      const brandedImage = await addBrandingToImage(transformedImage);
      console.log("Branding applied");

      const transformation = await storage.createTransformation({
        team,
        originalImageUrl: image,
        transformedImageUrl: brandedImage,
        promptUsed: prompt,
      });

      res.json({
        success: true,
        transformedImage: brandedImage,
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
