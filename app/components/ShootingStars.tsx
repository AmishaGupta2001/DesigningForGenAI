
"use client";

import { useEffect, useState } from "react";

const stars = [
    { top: "12%", left: "15%", delay: "0s" },
    { top: "25%", left: "85%", delay: "2.5s" },
    { top: "5%", left: "55%", delay: "10s" },
    { top: "18%", left: "100%", delay: "18s" },
    { top: "55%", left: "20%", delay: "20" },
];

export default function ShootingStars() {
    const [reducedMotion, setReducedMotion] = useState(false);

    useEffect(() => {
        setReducedMotion(
            window.matchMedia("(prefers-reduced-motion: reduce)").matches
        );
    }, []);

    if (reducedMotion) return null;

    return (
        <div className="shooting-stars" aria-hidden="true">
            {stars.map((star, index) => (
                <span
                    key={index}
                    className="shooting-star"
                    style={{
                        top: star.top,
                        left: star.left,
                        animationDelay: star.delay,
                    }}
                />
            ))}
        </div>
    );
}
