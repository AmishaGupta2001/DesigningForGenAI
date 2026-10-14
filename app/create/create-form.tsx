"use client";
/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import NycUnhingedNav from "../nyc-unhinged-nav";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";

type ImageInput = { id: string; image_url: string; title: string; tags: string[] };
type UploadAnalysis = { tags: string[]; failed: boolean };

const COMMON_FILTERS = ["happy", "sad", "irritated", "surprised", "confused", "nyc", "subway", "food", "college"];
const MAX_TAG_LENGTH = 32;

export default function CreateForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const fileInput = useRef<HTMLInputElement>(null);
  const [images, setImages] = useState<ImageInput[]>([]);
  const [query, setQuery] = useState("");
  const [selectedImage, setSelectedImage] = useState<ImageInput | null>(null);
  const [uploadAnalysis, setUploadAnalysis] = useState<UploadAnalysis | null>(null);
  const [isEditingTags, setIsEditingTags] = useState(false);
  const [tagDraft, setTagDraft] = useState("");
  const [direction, setDirection] = useState("");
  const [caption, setCaption] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const remixOf = searchParams.get("remix");
  const remixImageId = searchParams.get("image");

  useEffect(() => {
    async function loadImages() {
      try {
        const supabase = createSupabaseBrowserClient();
        const { data, error } = await supabase.from("images").select("id, image_url, title, tags").order("created_at", { ascending: false });
        if (error) throw error;
        const nextImages = (data ?? []) as ImageInput[];
        setImages(nextImages);
        if (remixImageId) setSelectedImage(nextImages.find((image) => image.id === remixImageId) ?? null);
    } catch {
      setMessage("Unable to load the image library right now.");
      } finally {
        setIsLoading(false);
      }
    }
    void loadImages();
  }, [remixImageId]);

  const filteredImages = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return images;
    return images.filter((image) => [image.title, ...image.tags].join(" ").toLowerCase().includes(term));
  }, [images, query]);

  function selectImage(image: ImageInput) {
    setSelectedImage(image);
    setCaption(null);
    setMessage(null);
    setUploadAnalysis(null);
    setIsEditingTags(false);
  }

  async function saveTags(tags: string[]) {
    if (!selectedImage) return;
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.from("images").update({ tags }).eq("id", selectedImage.id);
    if (error) throw error;
    const updated = { ...selectedImage, tags };
    setSelectedImage(updated);
    setImages((current) => current.map((image) => image.id === updated.id ? updated : image));
    setUploadAnalysis((current) => current ? { ...current, tags } : current);
  }

  async function removeTag(tag: string) {
    if (!selectedImage) return;
    try { await saveTags(selectedImage.tags.filter((current) => current !== tag)); }
    catch { setMessage("Couldn’t save those tags. Please try again."); }
  }

  async function addTag() {
    const tag = tagDraft.trim().toLowerCase();
    if (!selectedImage) return;
    if (!tag || tag.length > MAX_TAG_LENGTH) { setMessage(`Tags need 1–${MAX_TAG_LENGTH} characters.`); return; }
    if (selectedImage.tags.includes(tag)) { setMessage("That tag is already on this moment."); return; }
    try { await saveTags([...selectedImage.tags, tag]); setTagDraft(""); setMessage(null); }
    catch { setMessage("Couldn’t save that tag. Please try again."); }
  }

  const usefulFilters = useMemo(
    () => COMMON_FILTERS.filter((tag) => images.some((image) => image.tags.includes(tag))),
    [images],
  );

  async function uploadFile(file: File) {
    if (!file.type.startsWith("image/")) throw new Error("Please choose an image file.");
    if (file.size > 10 * 1024 * 1024) throw new Error("Please choose an image smaller than 10 MB.");
    setIsUploading(true);
    setMessage(null);
    setUploadAnalysis(null);
    try {
      const supabase = createSupabaseBrowserClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push("/sign-in");
        return;
      }
      const extension = file.name.split(".").pop()?.replace(/[^a-z0-9]/gi, "") || "jpg";
      const path = `${user.id}/${crypto.randomUUID()}.${extension}`;
      const { error: storageError } = await supabase.storage.from("generation-images").upload(path, file, { contentType: file.type, upsert: false });
      if (storageError) throw storageError;
      const { data: urlData } = supabase.storage.from("generation-images").getPublicUrl(path);
      let analysis: UploadAnalysis = { tags: [], failed: false };
      try {
        const formData = new FormData();
        formData.append("image", file);
        const response = await fetch("/api/categorize-image", { method: "POST", body: formData });
        const result = await response.json() as { tags?: unknown };
        if (!response.ok || !Array.isArray(result.tags)) throw new Error("Image analysis failed.");
        analysis = { tags: result.tags.filter((tag): tag is string => typeof tag === "string"), failed: false };
      } catch {
        analysis = { tags: [], failed: true };
      }
      const { data, error } = await supabase.from("images").insert({ image_url: urlData.publicUrl, title: "Uploaded moment", tags: analysis.tags, owner_id: user.id }).select("id, image_url, title, tags").single();
      if (error) throw error;
      const image = data as ImageInput;
      setImages((current) => [image, ...current]);
      setSelectedImage(image);
      setCaption(null);
      setUploadAnalysis(analysis);
      setIsEditingTags(false);
    } catch {
      setMessage("Unable to upload that image. Please try another file.");
    } finally {
      setIsUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function generateCaption() {
    if (!selectedImage) return;
    setIsGenerating(true);
    setMessage(null);
    try {
      const response = await fetch("/api/generate-caption", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ imageId: selectedImage.id, direction }) });
      const result = await response.json() as { caption?: string; error?: string };
      if (!response.ok || !result.caption) throw new Error(result.error || "Unable to generate a caption.");
      setCaption(result.caption);
    } catch {
      setMessage("Unable to cook a caption right now. Please try again.");
    } finally {
      setIsGenerating(false);
    }
  }

  async function publish() {
    if (!selectedImage || !caption) return;
    setIsPublishing(true);
    setMessage(null);
    try {
      const supabase = createSupabaseBrowserClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push("/sign-in");
        return;
      }
      const { error } = await supabase.from("generations").insert({ user_id: user.id, image_id: selectedImage.id, prompt: direction.trim(), caption, ...(remixOf ? { remix_of: remixOf } : {}) });
      if (error) throw error;
      router.push("/");
      router.refresh();
    } catch {
      setMessage("Unable to publish right now. Please try again.");
    } finally {
      setIsPublishing(false);
    }
  }

  return <main className="app-shell unhinged-shell">
    <NycUnhingedNav active="create" />
    <section className="create-heading" aria-labelledby="create-title"><p className="unhinged-kicker"><span aria-hidden="true">✦</span> YOUR IMAGE, AI-POWERED</p><h1 id="create-title">COOK SOMETHING</h1><p>{remixOf ? "Recook this moment with a fresh AI-generated caption." : "Turn a moment into something unhinged."}</p></section>
    <section className="create-grid">
      <form className="create-workbench" onSubmit={(event) => { event.preventDefault(); void generateCaption(); }}>
        <fieldset><legend><span>01</span> CHOOSE A MOMENT</legend>
          <input accept="image/*" className="sr-only" id="image-upload" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadFile(file); }} ref={fileInput} type="file" />
          <label className="upload-dropzone" htmlFor="image-upload" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); const file = event.dataTransfer.files?.[0]; if (file) void uploadFile(file); }}><strong>{isUploading ? "Uploading…" : "DROP A MOMENT"}</strong><span>Drag an image here or choose from your files · JPG, PNG, WebP, GIF · up to 10 MB</span></label>
          {uploadAnalysis && selectedImage && <section className="upload-analysis" role="status"><p className="create-step"><span>02</span> AI UNDERSTANDS THE MOMENT</p>{uploadAnalysis.failed ? <><p>Couldn&apos;t analyze this moment right now.</p><small>You can still use it and add tags yourself.</small></> : <p>✨ AI UNDERSTANDS THIS MOMENT</p>}<div className="editable-tags">{selectedImage.tags.map((tag) => isEditingTags ? <button aria-label={`Remove ${tag}`} className="tag-pill tag-pill--removable" key={tag} onClick={() => void removeTag(tag)} type="button">{tag} <span>×</span></button> : <span className="tag-pill" key={tag}>{tag}</span>)}</div>{isEditingTags ? <div className="tag-editor"><label htmlFor="custom-tag">ADD A TAG</label><div><input id="custom-tag" maxLength={MAX_TAG_LENGTH} onChange={(event) => setTagDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void addTag(); } }} placeholder="type a tag..." value={tagDraft} /><button onClick={() => void addTag()} type="button">+ ADD</button></div><button className="finish-tags" onClick={() => setIsEditingTags(false)} type="button">DONE</button></div> : <button className="edit-tags" onClick={() => setIsEditingTags(true)} type="button">EDIT TAGS</button>}</section>}
          <label className="search-field" htmlFor="gallery-search"><span aria-hidden="true">⌕</span><input id="gallery-search" onChange={(event) => setQuery(event.target.value)} placeholder="Find a moment by mood, place, or vibe..." type="search" value={query} /></label>
          {usefulFilters.length > 0 && <div className="tag-filters" aria-label="Filter moments by tag">{usefulFilters.map((tag) => <button className={query === tag ? "is-selected" : ""} key={tag} onClick={() => setQuery(query === tag ? "" : tag)} type="button">{tag}</button>)}</div>}
          <div className="gallery-grid" aria-live="polite">{filteredImages.map((image) => <button aria-label="Choose this moment" aria-pressed={selectedImage?.id === image.id} className={`gallery-card ${selectedImage?.id === image.id ? "is-selected" : ""}`} key={image.id} onClick={() => selectImage(image)} type="button"><img alt="" src={image.image_url} />{selectedImage?.id === image.id && <i aria-label="Selected">✓</i>}</button>)}{!isLoading && filteredImages.length === 0 && <p className="gallery-empty">No images match that mood yet.</p>}</div>
        </fieldset>
        <fieldset><legend><span>03</span> COOK IT <em>optional direction</em></legend><label className="sr-only" htmlFor="caption-instruction">Direction for the AI</label><textarea id="caption-instruction" maxLength={500} onChange={(event) => { setDirection(event.target.value); setCaption(null); }} placeholder="e.g. Make this funny for Columbia students, or make it extremely sarcastic." value={direction} /></fieldset>
        <button className="generate-button" disabled={!selectedImage || isGenerating} type="submit">{isGenerating ? "COOKING..." : caption ? "RECOOK" : "COOK IT"}<span aria-hidden="true">✦</span></button>
      </form>
      <aside className="caption-preview" aria-live="polite"><p className="caption-preview__label">AI-GENERATED PREVIEW</p>{selectedImage ? <div className="preview-image"><img alt={selectedImage.title} src={selectedImage.image_url} />{caption && <p className="preview-image__caption">{caption}</p>}</div> : <div className="preview-image preview-image--empty">Drop a moment and let&apos;s make it unhinged.</div>}{caption ? <div className="caption-result"><p>Caption cooked. Nothing is published yet.</p><div><button disabled={isGenerating} onClick={() => void generateCaption()} type="button">↻ RECOOK</button><button className="publish-button" disabled={isPublishing} onClick={() => void publish()} type="button">{isPublishing ? "PUBLISHING..." : "PUBLISH"} <span aria-hidden="true">↗</span></button></div></div> : <div className="caption-empty"><span aria-hidden="true">✦</span><p>Your generated caption will appear here.</p></div>}{message && <p className="create-message" role="status">{message}</p>}</aside>
    </section>
  </main>;
}
