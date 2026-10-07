import type { Metadata } from "next";
import { Suspense } from "react";
import CreateForm from "./create-form";

export const metadata: Metadata = {
  title: "Create | NYC Unhinged",
  description: "Turn an NYC moment into an AI-generated caption.",
};

export default function CreatePage() {
  return <Suspense fallback={<main className="unhinged-shell" /> }><CreateForm /></Suspense>;
}
