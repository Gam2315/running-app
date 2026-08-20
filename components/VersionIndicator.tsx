'use client';

import { useState } from 'react';

export default function VersionIndicator() {
  const [showDetails, setShowDetails] = useState(false);
  const version = 'v1.0';
  const name = 'Gamaliel Rei V. Quintos';
  const email = 'gamalielquintos725@gmail.com';

  return (
    <div
      className="relative inline-flex items-center justify-center gap-2 transition-all duration-300"
      onMouseEnter={() => setShowDetails(true)}
      onMouseLeave={() => setShowDetails(false)}
      onClick={() => setShowDetails(!showDetails)}
    >
      <span className={`text-xs font-semibold cursor-pointer transition-colors ${showDetails ? 'text-brand' : 'text-zinc-500 hover:text-brand'}`}>
        {version}
      </span>

      {showDetails && (
        <div className="absolute -top-20 left-1/2 -translate-x-1/2 z-50 rounded-lg border border-brand bg-card px-4 py-3 shadow-xl whitespace-nowrap text-xs text-foreground">
          <div className="font-semibold text-brand">{name}</div>
          <div className="text-zinc-300">{email}</div>
        </div>
      )}
    </div>
  );
}
