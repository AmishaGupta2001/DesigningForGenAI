"use client";

import { createBrowserClient } from "@supabase/ssr";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type ProfileFormProps = {
  userId: string;
  initialFirstName: string | null;
  initialLastName: string | null;
  initialAvatarUrl: string | null;
  completionOnly?: boolean;
};

function getSupabaseBrowserClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Supabase environment variables are not configured.");
  }

  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}

export default function ProfileForm({
  userId,
  initialFirstName,
  initialLastName,
  initialAvatarUrl,
  completionOnly = false,
}: ProfileFormProps) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [firstName, setFirstName] = useState(initialFirstName ?? "");
  const [lastName, setLastName] = useState(initialLastName ?? "");
  const [avatarUrl, setAvatarUrl] = useState(initialAvatarUrl);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (avatarPreviewUrl) {
        URL.revokeObjectURL(avatarPreviewUrl);
      }
    };
  }, [avatarPreviewUrl]);

  function handleAvatarChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      setAvatarPreviewUrl(null);
      return;
    }

    if (!file.type.startsWith("image/")) {
      setMessage("Please choose an image file.");
      setAvatarPreviewUrl(null);
      return;
    }

    setMessage(null);
    setAvatarPreviewUrl(URL.createObjectURL(file));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedFirstName = firstName.trim();
    const trimmedLastName = lastName.trim();

    if (!trimmedFirstName || !trimmedLastName) {
      setMessage("Please enter both your first and last name.");
      return;
    }

    setIsSaving(true);
    setMessage(null);

    try {
      const supabase = getSupabaseBrowserClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user || user.id !== userId) {
        throw new Error("Your session has expired. Please sign in again.");
      }

      let nextAvatarUrl = avatarUrl;
      const file = fileInput.current?.files?.[0];

      if (file) {
        if (!file.type.startsWith("image/")) {
          throw new Error("Please choose an image file.");
        }

        if (file.size > 5 * 1024 * 1024) {
          throw new Error("Please choose an image smaller than 5 MB.");
        }

        const extension = file.name.split(".").pop() || "jpg";
        const filePath = `${user.id}/${crypto.randomUUID()}.${extension}`;
        const { error: uploadError } = await supabase.storage
          .from("avatars")
          .upload(filePath, file, { contentType: file.type, upsert: false });

        if (uploadError) {
          throw uploadError;
        }

        const { data } = supabase.storage.from("avatars").getPublicUrl(filePath);
        nextAvatarUrl = data.publicUrl;
        setAvatarUrl(nextAvatarUrl);
        setAvatarPreviewUrl(null);
      }

      const { error } = await supabase
  	.from("profiles")
  	.update({
    	first_name: trimmedFirstName,
    	last_name: trimmedLastName,
    	avatar_url: nextAvatarUrl,
 	 })
  	.eq("id", user.id);

      if (error) {
        throw error;
      }

      setMessage("Profile saved.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save your profile.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form className={completionOnly ? "profile-completion" : "profile-form"} onSubmit={handleSubmit}>
      {completionOnly && (
        <>
          <h2>Finish setting up your profile</h2>
          <p>Add your first and last name to personalize your meal planner.</p>
        </>
      )}

      {!completionOnly && (
        <div className="profile-photo">
          {avatarPreviewUrl || avatarUrl ? (
            <>
              {/* The Supabase project URL is configured at runtime. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                alt="Your profile"
                className="profile-photo__image"
                src={avatarPreviewUrl ?? avatarUrl ?? undefined}
              />
            </>
          ) : (
            <div aria-hidden="true" className="profile-photo__placeholder">
              {firstName.slice(0, 1).toUpperCase() || "?"}
            </div>
          )}
          <div>
            <label htmlFor="avatar">Profile photo</label>
            <input
              accept="image/*"
              id="avatar"
              onChange={handleAvatarChange}
              ref={fileInput}
              type="file"
            />
            <p className="profile-form__hint">Choose a JPG, PNG, or other image under 5 MB.</p>
          </div>
        </div>
      )}

      <div className="profile-form__fields">
        <label htmlFor={completionOnly ? "completion-first-name" : "first-name"}>
          First name
          <input
            id={completionOnly ? "completion-first-name" : "first-name"}
            onChange={(event) => setFirstName(event.target.value)}
            required
            value={firstName}
          />
        </label>
        <label htmlFor={completionOnly ? "completion-last-name" : "last-name"}>
          Last name
          <input
            id={completionOnly ? "completion-last-name" : "last-name"}
            onChange={(event) => setLastName(event.target.value)}
            required
            value={lastName}
          />
        </label>
      </div>

      {message && <p className="profile-form__message" role="status">{message}</p>}
      <button className="profile-save-button" disabled={isSaving} type="submit">
        {isSaving ? "Saving…" : completionOnly ? "Save and continue" : "Save profile"}
      </button>
    </form>
  );
}
