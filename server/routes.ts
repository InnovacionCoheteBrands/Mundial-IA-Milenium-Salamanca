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
  { key: "trophy", maxWidthRatio: 0.08, maxHeightRatio: 0.9 },
  { key: "salamanca", maxWidthRatio: 0.36, maxHeightRatio: 0.58 },
  { key: "milenium", maxWidthRatio: 0.15, maxHeightRatio: 0.94 },
];

const TARGET_OUTPUT_ASPECT_RATIO = 16 / 9;
const brandingSourceBufferCache = new Map<BrandingAssetKey, Buffer>();
const brandingPlacementCache = new Map<string, Promise<BrandingAssetPlacement>>();

function getBrandingPlacementCacheKey(asset: BrandingAssetConfig, imageWidth: number, contentHeight: number) {
  return `${asset.key}:${imageWidth}:${contentHeight}`;
}

function getBrandingSourceBuffer(assetKey: BrandingAssetKey): Buffer {
  const cachedBuffer = brandingSourceBufferCache.get(assetKey);

  if (cachedBuffer) {
    return cachedBuffer;
  }

  const sourceBuffer = fs.readFileSync(BRANDING_ASSETS[assetKey]);
  brandingSourceBufferCache.set(assetKey, sourceBuffer);
  return sourceBuffer;
}

async function loadBrandingAsset(
  asset: BrandingAssetConfig,
  imageWidth: number,
  contentHeight: number,
): Promise<BrandingAssetPlacement> {
  const cacheKey = getBrandingPlacementCacheKey(asset, imageWidth, contentHeight);
  const cachedPlacement = brandingPlacementCache.get(cacheKey);

  if (cachedPlacement) {
    return cachedPlacement;
  }

  const placementPromise = (async () => {
    const assetBuffer = getBrandingSourceBuffer(asset.key);
    let resizedAsset = sharp(assetBuffer).resize(
      Math.max(1, Math.round(imageWidth * asset.maxWidthRatio)),
      Math.max(1, Math.round(contentHeight * asset.maxHeightRatio)),
      {
        fit: "inside",
        withoutEnlargement: true,
      },
    );

    if (asset.key === "salamanca") {
      resizedAsset = resizedAsset.tint({ r: 255, g: 255, b: 255 });
    }

    const resizedBuffer = await resizedAsset
      .png()
      .toBuffer();

    const resizedMetadata = await sharp(resizedBuffer).metadata();

    return {
      buffer: resizedBuffer,
      width: resizedMetadata.width || 0,
      height: resizedMetadata.height || 0,
    };
  })().catch((error) => {
    brandingPlacementCache.delete(cacheKey);
    throw error;
  });

  brandingPlacementCache.set(cacheKey, placementPromise);
  return placementPromise;
}

async function createBrandingShadowBuffer(assetBuffer: Buffer, width: number, height: number): Promise<Buffer> {
  return sharp(assetBuffer)
    .resize(width, height, {
      fit: "inside",
      withoutEnlargement: true,
    })
    .ensureAlpha()
    .linear([0, 0, 0, 0.28], [0, 0, 0, 0])
    .blur(5)
    .png()
    .toBuffer();
}

function createBrandingSeparator(height: number): Buffer {
  const separatorWidth = 2;

  return Buffer.from(
    `<svg width="${separatorWidth}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="0" width="1" height="${height}" fill="rgba(255,255,255,0.42)"/>
    </svg>`,
  );
}

function createBrandingPanel(width: number, height: number): Buffer {
  const radius = Math.max(6, Math.round(height * 0.12));

  return Buffer.from(
    `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="panelGradient" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stop-color="#070707" stop-opacity="0.78"/>
          <stop offset="0.52" stop-color="#14100b" stop-opacity="0.7"/>
          <stop offset="1" stop-color="#070707" stop-opacity="0.78"/>
        </linearGradient>
        <radialGradient id="softLight" cx="50%" cy="40%" r="70%">
          <stop offset="0" stop-color="#ffffff" stop-opacity="0.08"/>
          <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
        </radialGradient>
        <filter id="panelShadow" x="-5%" y="-35%" width="110%" height="170%">
          <feDropShadow dx="0" dy="6" stdDeviation="6" flood-color="#000000" flood-opacity="0.28"/>
        </filter>
      </defs>
      <rect width="${width}" height="${height}" rx="${radius}" ry="${radius}" fill="url(#panelGradient)" filter="url(#panelShadow)"/>
      <rect width="${width}" height="${height}" rx="${radius}" ry="${radius}" fill="url(#softLight)"/>
      <rect x="1" y="1" width="${Math.max(0, width - 2)}" height="${Math.max(0, height - 2)}" rx="${Math.max(0, radius - 1)}" ry="${Math.max(0, radius - 1)}" fill="none" stroke="#ffffff" stroke-opacity="0.08"/>
    </svg>`,
  );
}

function getBrandingSlotCenterX(assetKey: BrandingAssetKey, panelLeft: number, panelWidth: number): number {
  const slotCenters: Record<BrandingAssetKey, number> = {
    trophy: 0.1,
    salamanca: 0.5,
    milenium: 0.88,
  };

  return Math.round(panelLeft + panelWidth * slotCenters[assetKey]);
}

async function normalizeImageToAspectRatio(
  imageBase64: string,
  targetAspectRatio: number,
): Promise<string> {
  const mimeMatch = imageBase64.match(/^data:(image\/[\w.+-]+);base64,/);
  const mimeType = mimeMatch?.[1] || "image/jpeg";
  const base64Data = imageBase64.replace(/^data:image\/[\w.+-]+;base64,/, "");
  const imageBuffer = Buffer.from(base64Data, "base64");
  const image = sharp(imageBuffer);
  const metadata = await image.metadata();

  if (!metadata.width || !metadata.height) {
    return imageBase64;
  }

  const imageWidth = metadata.width;
  const imageHeight = metadata.height;
  const currentAspectRatio = imageWidth / imageHeight;
  const ratioDelta = Math.abs(currentAspectRatio - targetAspectRatio);

  if (ratioDelta < 0.02) {
    return imageBase64;
  }

  let canvasWidth = imageWidth;
  let canvasHeight = imageHeight;

  if (currentAspectRatio < targetAspectRatio) {
    canvasWidth = Math.max(imageWidth, Math.round(imageHeight * targetAspectRatio));
  } else {
    canvasHeight = Math.max(imageHeight, Math.round(imageWidth / targetAspectRatio));
  }

  const blurredBackground = await sharp(imageBuffer)
    .resize(canvasWidth, canvasHeight, { fit: "cover" })
    .blur(18)
    .modulate({ brightness: 0.82, saturation: 0.95 })
    .jpeg({ quality: 90 })
    .toBuffer();

  const foreground = await sharp(imageBuffer)
    .resize(canvasWidth, canvasHeight, { fit: "contain", withoutEnlargement: true })
    .jpeg({ quality: 92 })
    .toBuffer();

  const normalizedBuffer = await sharp(blurredBackground)
    .composite([{ input: foreground, gravity: "center" }])
    .jpeg({ quality: 92 })
    .toBuffer();

  return `data:${mimeType};base64,${normalizedBuffer.toString("base64")}`;
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
    const panelWidth = Math.min(Math.round(imageWidth * 0.6), imageWidth - Math.max(32, Math.round(imageWidth * 0.08)));
    const panelHeight = Math.max(72, Math.round(imageHeight * 0.115));
    const panelLeft = Math.max(0, Math.round((imageWidth - panelWidth) / 2));
    const bottomMargin = Math.max(18, Math.round(imageHeight * 0.047));
    const panelTop = Math.max(0, imageHeight - panelHeight - bottomMargin);
    const paddingX = Math.max(14, Math.round(panelWidth * 0.026));
    const paddingY = Math.max(10, Math.round(panelHeight * 0.13));
    const contentHeight = Math.max(1, panelHeight - paddingY * 2);

    const assets = await Promise.all(
      BRANDING_LAYOUT.map((asset) => loadBrandingAsset(asset, panelWidth, contentHeight)),
    );

    if (assets.some((asset) => !asset.width || !asset.height)) {
      console.log("Could not size branding assets, returning original");
      return imageBase64;
    }

    const separatorHeight = Math.max(28, Math.round(contentHeight * 0.7));
    const separatorBuffer = createBrandingSeparator(separatorHeight);
    const shadowOffset = Math.max(3, Math.round(imageWidth * 0.004));
    const overlays: OverlayOptions[] = [
      {
        input: createBrandingPanel(panelWidth, panelHeight),
        left: panelLeft,
        top: panelTop,
      },
    ];

    for (const separatorXRatio of [0.18, 0.74]) {
      overlays.push({
        input: separatorBuffer,
        left: Math.round(panelLeft + panelWidth * separatorXRatio),
        top: panelTop + paddingY + Math.max(0, Math.round((contentHeight - separatorHeight) / 2)),
      });
    }

    for (let index = 0; index < assets.length; index += 1) {
      const asset = assets[index];
      const assetKey = BRANDING_LAYOUT[index].key;
      const slotCenterX = getBrandingSlotCenterX(assetKey, panelLeft, panelWidth);
      const minLeft = panelLeft + paddingX;
      const maxLeft = panelLeft + panelWidth - paddingX - asset.width;
      const left = Math.max(minLeft, Math.min(maxLeft, Math.round(slotCenterX - asset.width / 2)));
      const top = panelTop + paddingY + Math.max(0, Math.round((contentHeight - asset.height) / 2));
      const shadowBuffer = await createBrandingShadowBuffer(asset.buffer, asset.width, asset.height);

      overlays.push({
        input: shadowBuffer,
        left: Math.min(panelLeft + panelWidth - paddingX - asset.width, left + shadowOffset),
        top: Math.min(panelTop + panelHeight - paddingY - asset.height, top + shadowOffset),
      });
      overlays.push({
        input: asset.buffer,
        left,
        top,
      });
    }

    const brandedBuffer = await mainImage
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
  const normalizedInputImage = await normalizeImageToAspectRatio(originalImageBase64, TARGET_OUTPUT_ASPECT_RATIO);
  const base64Data = normalizedInputImage.replace(/^data:image\/\w+;base64,/, "");
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
  return normalizeImageToAspectRatio(`data:${mimeType};base64,${imagePart.inlineData.data}`, TARGET_OUTPUT_ASPECT_RATIO);
}

function getTransformationPromptV2(team: TeamId): string {
  const teamData = teamInfo[team];

  return `You are editing a REAL uploaded photo, not creating a new person. Treat the uploaded image as the single source of truth for identity, anatomy, pose, and subject placement. The final result must look like a realistic sports celebration photograph edited from the original photo.

=== CORE RULE ===
When there is any conflict between identity fidelity and cinematic spectacle, identity fidelity wins every time.
This is an image edit task, not a face reinterpretation task.
The person must look like the original person first; the World Cup scene is secondary.

=== HIGHEST PRIORITY: PRESERVE IDENTITY EXACTLY ===
The people in the uploaded photo must remain unmistakably the same real people.
- Preserve each face exactly: facial structure, eyes, nose, mouth, jawline, cheeks, eyebrows, ears, skin tone, age, expression, and likeness.
- Preserve hairstyle, hairline, glasses, jewelry, beard, makeup, and visible personal traits.
- Preserve tattoos, moles, scars, piercings, bracelets, watches, fingernails, and all visible identifying marks.
- Preserve face width, forehead height, eye spacing, eyelid shape, nose bridge width, nostril shape, lip volume, chin shape, jaw contour, and ear shape.
- Preserve skin texture, undertones, freckles, beard density, smile lines, and all small asymmetries that make the real person recognizable.
- Do NOT beautify, stylize, redraw, re-age, de-age, slim, enlarge, or improve the people.
- Do NOT replace any face, invent any face, blend faces, or make anyone look like a different person.
- Do NOT change ethnicity presentation, facial proportions, perceived age, body fitness level, or grooming style.
- Do NOT change gaze direction, head angle, smile shape, teeth appearance, facial tension, or natural expression unless the original already shows it.
- The faces must stay instantly recognizable to someone who knows the original people.

=== IDENTITY LOCK INSTRUCTIONS ===
- Keep the exact same identity even if the input photo is imperfect, low-light, slightly blurry, compressed, close-up, or not studio quality.
- Do not "correct" the face, symmetry, skin, teeth, nose, eyes, or jaw for aesthetic reasons.
- Do not reinterpret partially visible features. If some facial or body detail is unclear, preserve the visible evidence and make the least inventive choice.
- Do not replace natural imperfections with cleaner or more generic-looking versions.
- If a tattoo, scar, mole, or accessory is visible in the reference, it must remain present in the final image in the same approximate location and scale.
- If an identifying detail is hidden by the new jersey, pose, or framing, avoid inventing a replacement version elsewhere.

=== REFERENCE MATCHING PROCESS ===
Before applying the stadium, jersey, or trophy edit, visually lock the original subjects:
- Keep each person's head, face, hair, exposed skin, tattoos, hands, and body silhouette matched to the reference.
- Keep the original subject scale, crop relationship, and camera angle as much as the horizontal output allows.
- Edit around the person instead of rebuilding the person.
- Preserve original face clarity. Do not make the face sharper, smoother, more symmetrical, younger, older, thinner, wider, happier, or more dramatic than the reference.
- Background, jersey fabric, and trophy may be generated; identity-defining human details must be preserved.

=== PRESERVE BODY AND PEOPLE COUNT ===
- Keep ALL people from the original image.
- Do NOT add or remove people.
- Preserve body type, body proportions, height, hands, arms, legs, and overall anatomy.
- Preserve exact limb proportions, shoulder width, arm size, hand size, finger count, tattoos on arms or hands, and visible body details.
- Preserve neck length, trapezius shape, torso width, waist proportion, hip proportion, and overall physical build.
- Preserve the original camera perspective and subject scale as much as possible.
- Do NOT turn this into a different body, different person, or different anatomy.

=== EDIT BOUNDARY ===
Change only these elements:
- clothing into realistic ${teamData.name} jerseys
- background into a stadium celebration scene
- one naturally held FIFA World Cup Trophy
- lighting/color integration required to make the edit believable
Do not modify identity-defining anatomy beyond what is strictly required for those edits.
Treat faces, hair, exposed skin, tattoos, scars, moles, jewelry, glasses, hands, and body build as protected subject areas.

=== POSE FLEXIBILITY: ONLY MINIMAL AND ONLY IF NEEDED ===
You may make a very small, natural pose adjustment ONLY if necessary so ONE person can hold the FIFA World Cup Trophy convincingly.
- Allowed: slight hand adjustment, slight wrist adjustment, or slight forearm contact with the trophy.
- Avoid changing shoulders, torso, neck, head, face, stance, or group arrangement.
- Not allowed: dramatic new pose, different stance, dance pose, exaggerated movement, major head turn, major body rotation, or changing the group arrangement.
- If the trophy can be added without changing pose, keep the original pose unchanged.

=== WHAT TO EDIT ===
1. CLOTHING
   - Replace ONLY the clothing with realistic ${teamData.name} national team jerseys.
   - Every person should wear the jersey naturally and believably.
   - Keep natural folds, shadows, fit, and body alignment.
   - The jersey must follow the existing body. Do not use the jersey to slim, enlarge, reshape, or athleticize the person.
   - Preserve exposed arms, neck, tattoos, bracelets, watches, and any visible skin details.

2. TROPHY
   - Add exactly ONE FIFA World Cup Trophy.
   - The trophy must be held naturally by one real person from the original photo.
   - The trophy must match perspective, scale, lighting, and hand placement.
   - The trophy must not cover faces, tattoos, scars, moles, jewelry, hands, or other identity-defining details.
   - If a convincing trophy hold would require changing the person's identity, body, or pose too much, place the trophy close to the existing hands with minimal contact instead.

3. BACKGROUND
   - Replace the background with a realistic World Cup stadium celebration scene from field level or near the edge of the pitch, not a generic flat backdrop.
   - The environment should feel like a live post-match celebration inside the stadium bowl.
   - Show real stadium depth: visible grass or sideline area, stands full of people, bright stadium lights, and atmospheric perspective.
   - Include players or team figures in the background when appropriate, but keep them secondary, believable, and not distracting.
   - Include confetti mainly in the air and across the stands, not as an overwhelming foreground wall.
   - Keep the people from the uploaded photo as the main subject, not the background spectacle.

4. COMPOSITION DIRECTION
   - Aim for a premium sports broadcast look, as if this was captured by a high-end television camera during a World Cup victory celebration.
   - Prefer a more immersive stadium composition: closer to the pitch, stronger depth, more believable crowd, and more wow-factor energy.
   - Avoid the feeling of a pasted subject over a generic stadium stock image.
   - Integrate the subject naturally into the environment with coherent scale, lighting, shadows, and color temperature.
   - Do not recompose the uploaded people as if shooting a new portrait. Preserve their original placement and proportions whenever possible.

5. BROADCAST CAMERA LOOK
   - The image should feel like a top-tier live TV sports shot: sharp subject, premium lens rendering, believable stadium lighting, and rich contrast.
   - Keep the main person crisp and clearly readable.
   - Allow the background to be slightly softer or subtly out of focus, like a professional telephoto or broadcast camera separation.
   - Use realistic depth, natural highlight rolloff, and a polished televised finish, not artificial filters.
   - The final image should feel impressive, celebratory, and visually striking without looking fake or overprocessed.
   - Do not smooth, enhance, beautify, or regenerate facial features to match the broadcast style.

6. CELEBRATION ENERGY
   - Show visible victory atmosphere: confetti bursts, crowd excitement, and players or team figures celebrating in the background when appropriate.
   - Confetti should feel dynamic and event-driven, like celebration cannons or bursts in the stadium, not random floating debris everywhere.
   - The stadium should feel alive, triumphant, and high-stakes, as if the team has just won an important match.
   - Keep this energy behind the main subject so the person remains the hero of the shot.

7. OUTPUT FRAMING
   - The final composition must be horizontal landscape, like a television broadcast frame.
   - Prefer a wide 16:9 style composition.
   - Do NOT return a portrait or vertical composition.
   - Keep all people fully and naturally framed inside this horizontal composition.

=== VARIATION WITHOUT LOSING IDENTITY ===
For each generation, vary the scene only after the original people are locked. Vary ONLY these non-identity elements:
- stadium angle or section
- field-level position or sideline perspective
- visible background players or staff
- confetti density and where it appears in the stands
- lighting mood
- amount of background blur
- lens feel or broadcast framing feel
- trophy placement angle
- jersey wrinkles and fabric behavior
- background energy and celebration intensity

Choose one realistic combination per generation and avoid repeating the exact same composition when another natural option is possible.
Do not vary face, body, expression, head direction, subject scale, subject placement, tattoos, accessories, or body build.

=== SCENE VARIATION RULE ===
Use a similar celebration theme every time, but do NOT repeat the exact same stadium layout, same crowd pattern, same trophy angle, same confetti placement, or same camera framing in every result.
Each image should feel like a different real photograph taken in the same kind of event, not the same template reused.
Only the stadium scene should feel different. The people must feel like the same reference photo subjects edited into that scene.

=== VISUAL STYLE ===
- Photorealistic
- Real camera photo
- Natural skin texture
- Realistic lighting and shadows
- High detail
- Cohesive stadium atmosphere
- Premium live-broadcast sports look
- Slight background separation when natural
- No cartoon, painting, 3D render, plastic skin, beauty filter, or fantasy look

=== HARD FAIL CONDITIONS TO AVOID ===
- altered identity
- different face
- different body
- synthetic or generic-looking person
- softened or idealized facial features
- missing tattoo, missing mole, missing scar, or changed identifying mark
- changed skin tone or changed facial proportions
- changed gaze, head angle, smile, teeth, facial expression, or hairline
- reshaped torso, arms, neck, jaw, cheeks, waist, shoulders, or hands
- trophy covering identity-defining details
- extra fingers or broken anatomy
- over-stylized image
- fake smile or changed expression
- dramatic pose change
- pasted-on look
- flat or empty background
- repeated template composition
- over-blurred fake portrait look
- unrealistic poster-style compositing
- altered tattoos or missing identifying marks
- portrait output
- cropped-out people or distorted limbs

=== FINAL GOAL ===
Return a realistic, premium, high-impact World Cup victory photo edit where the people are still clearly the exact same people from the uploaded image, now wearing ${teamData.name} jerseys in an immersive stadium celebration scene, with one person holding the World Cup Trophy naturally. The final image should feel like the original people were carefully edited into a televised sports moment, not regenerated as similar-looking people. Identity accuracy, facial fidelity, tattoos, complexion, body build, and natural expression are more important than spectacle.`;
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
