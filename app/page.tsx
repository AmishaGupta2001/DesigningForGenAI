import Feed from "./feed";
import { Suspense } from "react";

export default function Home() {
  return <Suspense fallback={<main className="app-shell" />}><Feed /></Suspense>;
}
