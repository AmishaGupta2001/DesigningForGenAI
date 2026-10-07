"use client";
/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import NycUnhingedNav from "./nyc-unhinged-nav";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";

type Vote = -1 | 0 | 1;
type Generation = {
  id: string;
  image_id: string;
  image_url: string;
  image_title: string;
  caption: string;
  created_at: string;
  creator_name: string;
  vote_count: number;
  remix_count: number;
  current_user_vote: Vote;
};

export default function Feed() {
  const router = useRouter();
  const [generations, setGenerations] = useState<Generation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  const loadFeed = useCallback(async () => {
    try {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase.rpc("get_feed_generations");
      if (error) throw error;
      setGenerations((data ?? []) as Generation[]);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to load the feed.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => { void loadFeed(); }, 0);
    return () => window.clearTimeout(timeout);
  }, [loadFeed]);

  async function vote(generation: Generation, requestedVote: Exclude<Vote, 0>) {
    try {
      const supabase = createSupabaseBrowserClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push("/sign-in");
        return;
      }
      if (generation.current_user_vote === requestedVote) {
        const { error } = await supabase.from("votes").delete().eq("generation_id", generation.id).eq("user_id", user.id);
        if (error) throw error;
      } else if (generation.current_user_vote === 0) {
        const { error } = await supabase.from("votes").insert({ user_id: user.id, generation_id: generation.id, vote: requestedVote });
        if (error) throw error;
      } else {
        const { error } = await supabase.from("votes").update({ vote: requestedVote }).eq("generation_id", generation.id).eq("user_id", user.id);
        if (error) throw error;
      }
      await loadFeed();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save your vote.");
    }
  }

  return <main className="unhinged-shell">
    <NycUnhingedNav active="feed" />
    <section className="unhinged-hero" aria-labelledby="feed-title"><div><p className="unhinged-kicker"><span aria-hidden="true">✦</span> NYC, UNFILTERED</p><h1 id="feed-title">Your feed. But make it city lore.</h1><p>Real AI-generated captions, published by the people who made them.</p></div></section>
    <section className="feed-layout" aria-label="Caption feed">
      {message && <p className="create-message" role="status">{message}</p>}
      {isLoading ? <p className="feed-end">Loading the latest city lore…</p> : generations.length === 0 ? <div className="feed-end"><p>No published generations yet.</p><Link className="remix-button" href="/create">Create the first one</Link></div> : <div className="generation-list">{generations.map((generation) => <article className="generation-card" key={generation.id}>
        <div className="reaction-photo"><img alt={generation.image_title} src={generation.image_url} /></div>
      <div className="generation-card__overlay"><div className="generation-card__meta"><span>{generation.creator_name}</span><span>·</span><time dateTime={generation.created_at}>{new Date(generation.created_at).toLocaleDateString()}</time></div><p className="generation-card__caption">{generation.caption}</p><span className="generation-card__location">✦ AI-generated from {generation.image_title}</span></div>
        <div className="generation-card__footer"><div className="vote-control" aria-label={`Vote on caption by ${generation.creator_name}`}><button aria-label="Upvote" aria-pressed={generation.current_user_vote === 1} className={generation.current_user_vote === 1 ? "is-selected" : ""} onClick={() => void vote(generation, 1)} type="button">↑</button><strong>{generation.vote_count}</strong><button aria-label="Downvote" aria-pressed={generation.current_user_vote === -1} className={generation.current_user_vote === -1 ? "is-selected" : ""} onClick={() => void vote(generation, -1)} type="button">↓</button></div><span className="generation-card__remix-count">✦ {generation.remix_count} {generation.remix_count === 1 ? "remix" : "remixes"}</span><Link className="remix-button" href={`/create?remix=${encodeURIComponent(generation.id)}&image=${encodeURIComponent(generation.image_id)}`}>Remix <span aria-hidden="true">↻</span></Link></div>
      </article>)}</div>}
    </section>
  </main>;
}
