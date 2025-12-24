import { useEffect, useState } from 'react';

interface Snowflake {
  id: number;
  left: number;
  fallDuration: number;
  swayDuration: number;
  animationDelay: number;
  size: number;
  opacity: number;
}

export function Snowfall() {
  const [snowflakes, setSnowflakes] = useState<Snowflake[]>([]);

  useEffect(() => {
    const flakes: Snowflake[] = [];
    const flakeCount = 50;

    for (let i = 0; i < flakeCount; i++) {
      flakes.push({
        id: i,
        left: Math.random() * 100,
        fallDuration: 10 + Math.random() * 15,
        swayDuration: 3 + Math.random() * 4,
        animationDelay: Math.random() * -20,
        size: 2 + Math.random() * 4,
        opacity: 0.4 + Math.random() * 0.6,
      });
    }
    setSnowflakes(flakes);
  }, []);

  return (
    <div className="snowfall-container">
      {snowflakes.map((flake) => (
        <div
          key={flake.id}
          className="snowflake"
          style={{
            left: `${flake.left}%`,
            width: `${flake.size}px`,
            height: `${flake.size}px`,
            opacity: flake.opacity,
            animationDuration: `${flake.fallDuration}s, ${flake.swayDuration}s`,
            animationDelay: `${flake.animationDelay}s, 0s`,
          }}
        />
      ))}
    </div>
  );
}
