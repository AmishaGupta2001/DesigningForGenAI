#!/usr/bin/env node

/**
 * One-time HEIC/HEIF repair for public.images.
 *
 * This program is deliberately dry-run unless both --apply and the confirmation
 * phrase are supplied. It uses a server-only Supabase service-role key because
 * public.images has no client update policy and Storage writes must not be made
 * with the publishable key.
 */
import { createClient } from "@supabase/supabase-js";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";

const executeFile = promisify(execFile);
const BUCKET = "generation-images";
const CONFIRMATION = "REPAIR_HEIC_IMAGES";
const args = new Set(process.argv.slice(2));
const shouldApply = args.has("--apply");
const confirmed = args.has(`--confirm=${CONFIRMATION}`);
const runId = new Date().toISOString().replace(/[:.]/g, "-");
const report = {
  run_id: runId,
  mode: shouldApply ? "apply" : "dry-run",
  started_at: new Date().toISOString(),
  candidates: [],
  successful: [],
  failed: [],
  skipped: [],
};

function fail(message) {
  console.error(message);
  process.exitCode = 1;
  throw new Error(message);
}

function isServiceRoleKey(key) {
  if (key.startsWith("sb_secret_")) return true;
  const [, payload] = key.split(".");
  if (!payload) return false;
  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")).role === "service_role";
  } catch {
    return false;
  }
}

function requireServiceRoleConfiguration() {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    fail("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required. Do not use NEXT_PUBLIC_SUPABASE_ANON_KEY.");
  }
  if (!isServiceRoleKey(serviceRoleKey)) {
    fail("SUPABASE_SERVICE_ROLE_KEY is not a Supabase service-role/secret key; refusing to run.");
  }
  return { url, serviceRoleKey };
}

function storagePathFromPublicUrl(imageUrl, supabaseUrl) {
  try {
    const source = new URL(imageUrl);
    const expectedOrigin = new URL(supabaseUrl).origin;
    const prefix = `/storage/v1/object/public/${BUCKET}/`;
    if (source.origin !== expectedOrigin || !source.pathname.startsWith(prefix)) return null;
    return decodeURIComponent(source.pathname.slice(prefix.length));
  } catch {
    return null;
  }
}

function heifSignature(bytes) {
  if (bytes.length < 16 || Buffer.from(bytes.subarray(4, 8)).toString("ascii") !== "ftyp") return null;
  const brands = [];
  for (let index = 8; index + 4 <= bytes.length; index += 4) {
    brands.push(Buffer.from(bytes.subarray(index, index + 4)).toString("ascii"));
  }
  const heifBrands = new Set(["heic", "heix", "hevc", "hevx", "heim", "heis", "hevm", "hevs"]);
  return brands.find((brand) => heifBrands.has(brand)) ?? null;
}

function jpegSignature(bytes) {
  return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

async function fetchPrefix(url, expectedBytes = 4096) {
  const response = await fetch(url, { headers: { Range: `bytes=0-${expectedBytes - 1}` } });
  if (!response.ok) throw new Error(`Public URL returned HTTP ${response.status}.`);
  return {
    bytes: new Uint8Array(await response.arrayBuffer()),
    contentType: response.headers.get("content-type")?.split(";", 1)[0]?.toLowerCase() ?? null,
  };
}

async function objectMetadata(storage, path) {
  const slash = path.lastIndexOf("/");
  if (slash < 0) return null;
  const { data, error } = await storage.list(path.slice(0, slash), { limit: 100, search: path.slice(slash + 1) });
  if (error) throw new Error(`Storage metadata lookup failed: ${error.message}`);
  const object = data?.find((entry) => entry.name === path.slice(slash + 1));
  return object ? { id: object.id, metadata: object.metadata ?? null } : null;
}

function isHeif({ extension, httpContentType, storageMetadata, signatureBrand }) {
  const metadataType = typeof storageMetadata?.mimetype === "string" ? storageMetadata.mimetype.toLowerCase() : null;
  const mimeSignal = [httpContentType, metadataType].some((type) => type === "image/heic" || type === "image/heif");
  const extensionSignal = extension === "heic" || extension === "heif";
  // An ISO BMFF HEIF brand is decisive. MIME and extension are recorded, but
  // extension alone only goes to manual review so mislabeled files are untouched.
  return { extensionSignal, mimeSignal, signatureBrand, confirmed: Boolean(signatureBrand || mimeSignal) };
}

async function detectCandidates(client, supabaseUrl) {
  const { data: images, error } = await client.from("images").select("id,image_url,title,owner_id").order("created_at", { ascending: true });
  if (error) throw new Error(`Could not list public.images: ${error.message}`);

  for (const image of images ?? []) {
    const path = storagePathFromPublicUrl(image.image_url, supabaseUrl);
    if (!path) continue;
    try {
      const [metadata, remote] = await Promise.all([
        objectMetadata(client.storage.from(BUCKET), path),
        fetchPrefix(image.image_url),
      ]);
      const extension = path.split(".").pop()?.toLowerCase() ?? "";
      const evidence = isHeif({
        extension,
        httpContentType: remote.contentType,
        storageMetadata: metadata?.metadata,
        signatureBrand: heifSignature(remote.bytes),
      });
      const record = {
        image_id: image.id,
        title: image.title,
        owner_id: image.owner_id,
        source_url: image.image_url,
        source_path: path,
        source_metadata: metadata,
        http_content_type: remote.contentType,
        heif_brand: evidence.signatureBrand,
        signals: { extension: evidence.extensionSignal, mime: evidence.mimeSignal, file_signature: Boolean(evidence.signatureBrand) },
      };
      if (evidence.confirmed) report.candidates.push(record);
      else if (evidence.extensionSignal) report.skipped.push({ ...record, reason: "HEIC/HEIF extension alone was not confirmed by MIME type or file signature." });
    } catch (error) {
      report.failed.push({ image_id: image.id, source_url: image.image_url, stage: "detection", error: error instanceof Error ? error.message : String(error) });
    }
  }
}

async function convertAndUpload(client, candidate) {
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "nyc-unhinged-heic-repair-"));
  const input = join(temporaryDirectory, "source.heic");
  const output = join(temporaryDirectory, "converted.jpg");
  const destinationPath = `repairs/heic/${candidate.image_id}/${randomUUID()}.jpg`;
  try {
    const sourceResponse = await fetch(candidate.source_url);
    if (!sourceResponse.ok) throw new Error(`Source download returned HTTP ${sourceResponse.status}.`);
    await writeFile(input, Buffer.from(await sourceResponse.arrayBuffer()));
    await executeFile("/usr/bin/sips", ["-s", "format", "jpeg", "-s", "formatOptions", "90", input, "--out", output]);
    const jpeg = await readFile(output);
    if (!jpegSignature(jpeg)) throw new Error("sips did not produce a JPEG file signature.");

    const { error: uploadError } = await client.storage.from(BUCKET).upload(destinationPath, jpeg, {
      contentType: "image/jpeg",
      upsert: false,
    });
    if (uploadError) throw new Error(`JPEG upload failed: ${uploadError.message}`);
    const { data: publicUrl } = client.storage.from(BUCKET).getPublicUrl(destinationPath);
    const verification = await fetchPrefix(publicUrl.publicUrl);
    if (verification.contentType !== "image/jpeg" || !jpegSignature(verification.bytes)) {
      throw new Error("Uploaded object is not publicly readable as a JPEG; database row was not updated.");
    }

    const { data: updated, error: updateError } = await client
      .from("images")
      .update({ image_url: publicUrl.publicUrl })
      .eq("id", candidate.image_id)
      .eq("image_url", candidate.source_url)
      .select("id,image_url")
      .maybeSingle();
    if (updateError) throw new Error(`Database update failed: ${updateError.message}`);
    if (!updated) throw new Error("Database row changed since detection; leaving new JPEG as an orphan for manual review.");
    report.successful.push({ ...candidate, destination_path: destinationPath, destination_url: publicUrl.publicUrl });
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

try {
  if (shouldApply && !confirmed) fail(`Refusing --apply without --confirm=${CONFIRMATION}.`);
  const { url, serviceRoleKey } = requireServiceRoleConfiguration();
  const client = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  await detectCandidates(client, url);
  if (shouldApply) {
    for (const candidate of report.candidates) {
      try {
        await convertAndUpload(client, candidate);
      } catch (error) {
        report.failed.push({ image_id: candidate.image_id, source_url: candidate.source_url, stage: "conversion-or-update", error: error instanceof Error ? error.message : String(error) });
      }
    }
  }
} catch (error) {
  if (!report.failed.some((item) => item.stage === "startup")) {
    report.failed.push({ stage: "startup", error: error instanceof Error ? error.message : String(error) });
  }
} finally {
  report.finished_at = new Date().toISOString();
  console.log(JSON.stringify(report, null, 2));
  if (report.failed.length > 0) process.exitCode = 1;
}
