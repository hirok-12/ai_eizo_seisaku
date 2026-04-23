import OpenAI, { toFile } from "openai";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve, extname, basename } from "node:path";
import { parseArgs } from "node:util";

const VALID_SIZES = ["1024x1024", "1536x1024", "1024x1536", "auto"];
const VALID_QUALITIES = ["low", "medium", "high"];

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
      size: { type: "string", default: "1024x1536" },
      quality: { type: "string", default: "medium" },
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

  const size = values.size!;
  const quality = values.quality!;

  if (!VALID_SIZES.includes(size)) {
    console.error(`Error: Invalid size: ${size}. Choose from: ${VALID_SIZES.join(", ")}`);
    process.exit(1);
  }
  if (!VALID_QUALITIES.includes(quality)) {
    console.error(`Error: Invalid quality: ${quality}. Choose from: ${VALID_QUALITIES.join(", ")}`);
    process.exit(1);
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error("Error: OPENAI_API_KEY environment variable is not set");
    process.exit(1);
  }

  const client = new OpenAI({ apiKey });

  const referenceFiles = values.reference ?? [];

  const MAX_RETRIES = 3;

  let b64Image: string;

  if (referenceFiles.length === 0) {
    // Text-to-image: images.generate()
    console.error(`Generating image (${size}, quality=${quality})...`);

    let response;
    for (let attempt = 0; ; attempt++) {
      try {
        response = await client.images.generate({
          model: "gpt-image-2",
          prompt: values.prompt,
          size: size as "1024x1024" | "1536x1024" | "1024x1536" | "auto",
          quality: quality as "low" | "medium" | "high",
          n: 1,
        });
        break;
      } catch (err: any) {
        if (err?.status === 429 && attempt < MAX_RETRIES) {
          const wait = 2 ** attempt * 5;
          console.error(`Rate limited (429). Retrying in ${wait}s... (${attempt + 1}/${MAX_RETRIES})`);
          await new Promise((r) => setTimeout(r, wait * 1000));
          continue;
        }
        throw err;
      }
    }

    const imageData = response.data?.[0]?.b64_json;
    if (!imageData) {
      console.error("Error: No image in response");
      process.exit(1);
    }
    b64Image = imageData;
  } else {
    // Reference images: images.edit()
    console.error(`References: ${referenceFiles.join(", ")}`);
    console.error(`Generating image with references (${size}, quality=${quality})...`);

    const imageFiles = await Promise.all(
      referenceFiles.map(async (refPath) => {
        const absPath = resolve(refPath);
        const ext = extname(absPath).toLowerCase();
        const mimeType = MIME_TYPES[ext];
        if (!mimeType) {
          console.error(`Error: Unsupported image format: ${ext} (${refPath})`);
          process.exit(1);
        }
        const buf = await readFile(absPath);
        return toFile(buf, basename(absPath), { type: mimeType });
      })
    );

    let response;
    for (let attempt = 0; ; attempt++) {
      try {
        response = await client.images.edit({
          model: "gpt-image-2",
          image: imageFiles,
          prompt: values.prompt,
          size: size as "1024x1024" | "1536x1024" | "1024x1536" | "auto",
          quality: quality as "low" | "medium" | "high",
          n: 1,
        });
        break;
      } catch (err: any) {
        if (err?.status === 429 && attempt < MAX_RETRIES) {
          const wait = 2 ** attempt * 5;
          console.error(`Rate limited (429). Retrying in ${wait}s... (${attempt + 1}/${MAX_RETRIES})`);
          await new Promise((r) => setTimeout(r, wait * 1000));
          continue;
        }
        throw err;
      }
    }

    const imageData = response.data?.[0]?.b64_json;
    if (!imageData) {
      console.error("Error: No image in response");
      process.exit(1);
    }
    b64Image = imageData;
  }

  const outputPath = resolve(values.output);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, Buffer.from(b64Image, "base64"));

  // Success: print the output path to stdout
  console.log(outputPath);
  console.error("Done!");
}

main().catch((err) => {
  console.error(`Error: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
