"use client";
/* eslint-disable @next/next/no-img-element */

import { useState } from "react";

type ImageWithFallbackProps = {
  src: string;
  alt: string;
};

export default function ImageWithFallback({ src, alt }: ImageWithFallbackProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  if (failedSrc === src) {
    return (
      <span aria-label={`${alt} is unavailable`} className="image-fallback" role="img">
        Image unavailable
      </span>
    );
  }

  return <img alt={alt} onError={() => setFailedSrc(src)} src={src} />;
}
