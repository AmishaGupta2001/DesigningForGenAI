import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseAnonClient } from "@/lib/supabase";
import type { Generation } from "@/app/feed";

export const metadata = { title: "Post | NYC Unhinged" };
export default async function PostPage({ params }: PageProps<"/post/[id]">) {
  const { id } = await params;
  const { data, error } = await createSupabaseAnonClient().rpc("get_public_generation", { p_generation_id: id });
  if (error || !data?.[0]) notFound();
  const post = data[0] as Generation;
  return <main className="public-post"><Link className="brand" href="/sign-in"><i>NYC</i><span>UNHINGED</span></Link><article className="public-post-card"><img alt={post.image_title} src={post.image_url}/><div><p className="eyebrow">✦ A REAL NYC MOMENT</p><h1>{post.caption}</h1><p className="public-author">By {post.creator_name}</p><div className="public-stats"><span>LOL {post.lol_count}</span><span>NAH {post.nah_count}</span><span>RECOOK {post.remix_count}</span></div><Link className="primary-button" href="/sign-in">SIGN IN TO JOIN THE CHAOS</Link></div></article></main>;
}
