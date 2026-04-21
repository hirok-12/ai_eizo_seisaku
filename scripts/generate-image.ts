import { GoogleGenAI } from "@google/genai";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve, extname } from "node:path";
import { parseArgs } from "node:util";

const VALID_SIZES = ["512", "1K", "2K", "4K"];

const MIME_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

async function main() {
  const { values } = parseArgs({
    options: {
      prompt: { type: "string" },
      output: { type: "string" },
      "aspect-ratio": { type: "string", default: "9:16" },
      size: { type: "string", default: "1K" },
      reference: { type: "string", multiple: true },
    },
    strict: true,
  });

  if (!values.prompt) {
    console.error("Error: --prompt is required");
    process.exit(1);
  }
  if (!values.output) {
    console.error("Error: --output is required");
    process.exit(1);
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("Error: GEMINI_API_KEY environment variable is not set");
    process.exit(1);
  }

  const aspectRatio = values["aspect-ratio"]!;
  const size = values.size!;

  if (!VALID_SIZES.includes(size)) {
    console.error(`Error: Invalid size: ${size}. Choose from: ${VALID_SIZES.join(", ")}`);
    process.exit(1);
  }

  const ai = new GoogleGenAI({ apiKey });

  // Build content parts: reference images + text prompt
  const requestParts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];

  const referenceFiles = values.reference ?? [];
  for (const refPath of referenceFiles) {
    const ext = extname(refPath).toLowerCase();
    const mimeType = MIME_TYPES[ext];
    if (!mimeType) {
      console.error(`Error: Unsupported image format: ${ext} (${refPath})`);
      process.exit(1);
    }
    const data = await readFile(resolve(refPath));
    requestParts.push({ inlineData: { mimeType, data: data.toString("base64") } });
    console.error(`Reference: ${refPath}`);
  }

  requestParts.push({ text: values.prompt });

  console.error(`Generating image (${size}, ${aspectRatio})...`);

  const response = await ai.models.generateContent({
    model: "gemini-3.1-flash-image-preview",
    contents: [{ role: "user", parts: requestParts }],
    config: {
      responseModalities: ["TEXT", "IMAGE"],
      imageConfig: {
        aspectRatio,
        imageSize: size,
      },
    },
  });

  const responseParts = response.candidates?.[0]?.content?.parts;
  if (!responseParts) {
    console.error("Error: No response from Gemini API");
    process.exit(1);
  }

  const imagePart = responseParts.find((p: any) => p.inlineData?.mimeType?.startsWith("image/"));
  if (!imagePart?.inlineData) {
    const textPart = responseParts.find((p: any) => p.text);
    console.error(
      "Error: No image in response." +
        (textPart?.text ? ` Model said: ${textPart.text}` : "")
    );
    process.exit(1);
  }

  const outputPath = resolve(values.output);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, Buffer.from(imagePart.inlineData.data!, "base64"));

  // Success: print the output path to stdout
  console.log(outputPath);
  console.error("Done!");
}

main().catch((err) => {
  console.error(`Error: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
