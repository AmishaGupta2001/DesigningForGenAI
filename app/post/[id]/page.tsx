import type { GlossaryTerm } from "@/lib/glossary";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseAdminClient, createSupabaseAnonClient } from "@/lib/supabase";
import { matchCaptionTerms, normalizeGlossaryTerms } from "@/lib/glossary";
import type { Generation } from "@/app/feed";
import ImageWithFallback from "@/app/components/ImageWithFallback";
import GlossaryDisclosure from "@/app/components/GlossaryDisclosure";

export const metadata = { title: "Post | NYC Unhinged" };
export default async function PostPage({ params }: PageProps<"/post/[id]">) {
  const { id } = await params;
  const { data, error } = await createSupabaseAnonClient().rpc("get_public_generation", { p_generation_id: id });
  if (error || !data?.[0]) notFound();
  const post = data[0] as Generation;
  let matchedTerms: GlossaryTerm[] = [];
  try {
    const { data: terms, error: termsError } = await createSupabaseAdminClient().from("terms").select("term,definition,category").eq("enabled", true).order("term").limit(100);
    if (termsError) throw termsError;
    matchedTerms = matchCaptionTerms(post.caption, normalizeGlossaryTerms(terms));
  } catch (termsError) {
    console.warn("Could not match glossary terms for public post.", termsError);
  }
  return <main className="public-post"><Link className="brand" href="/sign-in"><i>NYC</i><span>UNHINGED</span></Link><article className="public-post-card"><ImageWithFallback alt={post.image_title} src={post.image_url}/><div><p className="eyebrow">✦ A REAL NYC MOMENT</p><h1>{post.caption}</h1><GlossaryDisclosure terms={matchedTerms}/><p className="public-author">By {post.creator_name}</p><div className="public-stats"><span>LOL {post.lol_count}</span><span>NAH {post.nah_count}</span><span>RECOOK {post.remix_count}</span></div><Link className="primary-button" href="/sign-in">SIGN IN TO JOIN THE CHAOS</Link></div></article></main>;
}
