import Feed from "../feed";
import { Suspense } from "react";

export default function FeedPage() {
    return <Suspense fallback={<main className="app-shell" />}><Feed /></Suspense>;
}
