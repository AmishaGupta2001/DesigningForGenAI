"use client";
/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import NycUnhingedNav from "../nyc-unhinged-nav";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";

type ImageInput = { id: string; image_url: string; title: string; tags: string[] };

export default function CreateForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const fileInput = useRef<HTMLInputElement>(null);
  const [images, setImages] = useState<ImageInput[]>([]);
  const [query, setQuery] = useState("");
  const [selectedImage, setSelectedImage] = useState<ImageInput | null>(null);
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
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Unable to load the image library.");
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
  }

  async function uploadFile(file: File) {
    if (!file.type.startsWith("image/")) throw new Error("Please choose an image file.");
    if (file.size > 10 * 1024 * 1024) throw new Error("Please choose an image smaller than 10 MB.");
    setIsUploading(true);
    setMessage(null);
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
      const { data, error } = await supabase.from("images").insert({ image_url: urlData.publicUrl, title: file.name.replace(/\.[^.]+$/, "") || "Uploaded image", tags: ["uploaded"], owner_id: user.id }).select("id, image_url, title, tags").single();
      if (error) throw error;
      const image = data as ImageInput;
      setImages((current) => [image, ...current]);
      selectImage(image);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to upload that image.");
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
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to generate a caption.");
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
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to publish your generation.");
    } finally {
      setIsPublishing(false);
    }
  }

  return <main className="unhinged-shell">
    <NycUnhingedNav active="create" />
    <section className="create-heading" aria-labelledby="create-title"><p className="unhinged-kicker"><span aria-hidden="true">✦</span> YOUR IMAGE, AI-POWERED</p><h1 id="create-title">Create your NYC moment.</h1><p>{remixOf ? "Remix this image with a fresh AI-generated caption." : "Choose an image, guide the AI if you want, and publish the caption you like."}</p></section>
    <section className="create-grid">
      <form className="create-workbench" onSubmit={(event) => { event.preventDefault(); void generateCaption(); }}>
        <fieldset><legend><span>01</span> Choose an image</legend>
          <input accept="image/*" className="sr-only" id="image-upload" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadFile(file); }} ref={fileInput} type="file" />
          <label className="upload-dropzone" htmlFor="image-upload" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); const file = event.dataTransfer.files?.[0]; if (file) void uploadFile(file); }}><strong>{isUploading ? "Uploading…" : "Drop an image here or click to upload"}</strong><span>JPG, PNG, WebP, or GIF · up to 10 MB</span></label>
          <label className="search-field" htmlFor="gallery-search"><span aria-hidden="true">⌕</span><input id="gallery-search" onChange={(event) => setQuery(event.target.value)} placeholder="Search the curated image library…" type="search" value={query} /></label>
          <div className="gallery-grid" aria-live="polite">{filteredImages.map((image) => <button aria-pressed={selectedImage?.id === image.id} className={`gallery-card ${selectedImage?.id === image.id ? "is-selected" : ""}`} key={image.id} onClick={() => selectImage(image)} type="button"><img alt="" src={image.image_url} /><span>{image.title}</span>{selectedImage?.id === image.id && <i aria-label="Selected">✓</i>}</button>)}{!isLoading && filteredImages.length === 0 && <p className="gallery-empty">No images yet. Upload one or apply the curated-image migration.</p>}</div>
        </fieldset>
        <fieldset><legend><span>02</span> Give the AI direction <em>optional</em></legend><label className="sr-only" htmlFor="caption-instruction">Direction for the AI</label><textarea id="caption-instruction" maxLength={500} onChange={(event) => { setDirection(event.target.value); setCaption(null); }} placeholder="e.g. Make this funny for Columbia students, or make it extremely sarcastic." value={direction} /></fieldset>
        <button className="generate-button" disabled={!selectedImage || isGenerating} type="submit">{isGenerating ? "AI is analyzing the image…" : caption ? "Generate another caption" : "Generate AI caption"}<span aria-hidden="true">✦</span></button>
      </form>
      <aside className="caption-preview" aria-live="polite"><p className="caption-preview__label">AI-GENERATED PREVIEW</p>{selectedImage ? <div className="preview-image"><img alt={selectedImage.title} src={selectedImage.image_url} />{caption && <p className="preview-image__caption">{caption}</p>}<small>{selectedImage.title}</small></div> : <div className="preview-image preview-image--empty">Choose a scene to begin</div>}{caption ? <div className="caption-result"><p>Generated from this image and your direction. Nothing is published yet.</p><div><button disabled={isGenerating} onClick={() => void generateCaption()} type="button">↻ Regenerate</button><button className="publish-button" disabled={isPublishing} onClick={() => void publish()} type="button">{isPublishing ? "Publishing…" : "Publish"} <span aria-hidden="true">↗</span></button></div></div> : <div className="caption-empty"><span aria-hidden="true">✦</span><p>The AI-generated caption will appear here.</p></div>}{message && <p className="create-message" role="status">{message}</p>}</aside>
    </section>
  </main>;
}
