interface L1BeatLogoProps {
  variant?: 'header' | 'primary';
  size?: 'small' | 'medium' | 'large';
  iconOnly?: boolean;
  theme?: 'dark' | 'light';
}

export function L1BeatLogo({ 
  variant = 'primary', 
  size = 'medium',
  iconOnly = false,
  theme = 'dark'
}: L1BeatLogoProps) {
  const sizes = {
    small: { height: 24, textSize: 'text-xl', iconSize: 24, gap: 'gap-2.5' },
    medium: { height: 40, textSize: 'text-3xl', iconSize: 40, gap: 'gap-3' },
    large: { height: 56, textSize: 'text-5xl', iconSize: 56, gap: 'gap-3.5' }
  };

  const currentSize = sizes[size];
  
  // Color scheme based on theme
  const colors = {
    dark: {
      icon: '#ef4444',
      text: variant === 'header' ? '#f8fafc' : '#ffffff'
    },
    light: {
      icon: '#dc2626',
      text: '#0f172a'
    }
  };
  
  const iconColor = colors[theme].icon;
  const textColor = colors[theme].text;

  return (
    <div className={`flex items-center justify-center ${currentSize.gap}`}>
      {/* Icon - Network nodes connected by a heartbeat pulse line */}
      <div className="relative shrink-0">
        <svg
          width={currentSize.iconSize}
          height={currentSize.iconSize}
          viewBox="0 0 48 48"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
        <defs>
          <linearGradient id={`iconGradient-${theme}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={iconColor} stopOpacity="1" />
            <stop offset="100%" stopColor={iconColor} stopOpacity="0.8" />
          </linearGradient>
          <filter id={`glow-${theme}`}>
            <feGaussianBlur stdDeviation="1.5" result="coloredBlur"/>
            <feMerge>
              <feMergeNode in="coloredBlur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>
        
        {/* Main heartbeat/pulse line flowing through the network */}
        <path
          d="M 4 24 L 10 24 L 14 16 L 18 32 L 22 20 L 26 28 L 30 24 L 34 24 L 38 16 L 42 32 L 44 24"
          stroke={`url(#iconGradient-${theme})`}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
          filter={`url(#glow-${theme})`}
        >
          <animate
            attributeName="stroke-dasharray"
            values="0,100;100,0"
            dur="2s"
            repeatCount="indefinite"
          />
        </path>
        
        {/* Network nodes positioned at key points on the pulse */}
        {/* Left node */}
        <circle cx="10" cy="24" r="2.5" fill={iconColor}>
          <animate
            attributeName="r"
            values="2.5;3.5;2.5"
            dur="2s"
            repeatCount="indefinite"
          />
        </circle>
        
        {/* Peak nodes - representing data spikes */}
        <circle cx="14" cy="16" r="3" fill={iconColor} opacity="0.9">
          <animate
            attributeName="opacity"
            values="0.9;1;0.9"
            dur="2s"
            begin="0.2s"
            repeatCount="indefinite"
          />
        </circle>
        
        <circle cx="18" cy="32" r="2.5" fill={iconColor} opacity="0.8" />
        
        <circle cx="22" cy="20" r="2.5" fill={iconColor} opacity="0.9" />
        
        {/* Center node - main focus */}
        <circle cx="26" cy="28" r="3.5" fill={iconColor}>
          <animate
            attributeName="r"
            values="3.5;4.5;3.5"
            dur="2s"
            begin="0.4s"
            repeatCount="indefinite"
          />
        </circle>
        
        {/* Right side nodes */}
        <circle cx="34" cy="24" r="2.5" fill={iconColor} />
        
        <circle cx="38" cy="16" r="3" fill={iconColor} opacity="0.9">
          <animate
            attributeName="opacity"
            values="0.9;1;0.9"
            dur="2s"
            begin="0.6s"
            repeatCount="indefinite"
          />
        </circle>
        
        <circle cx="42" cy="32" r="2.5" fill={iconColor} opacity="0.8" />

        {/* Subtle connecting lines between some nodes for network effect */}
        <path
          d="M 14 16 L 22 20"
          stroke={iconColor}
          strokeWidth="1"
          strokeLinecap="round"
          opacity="0.3"
        />
        <path
          d="M 22 20 L 26 28"
          stroke={iconColor}
          strokeWidth="1"
          strokeLinecap="round"
          opacity="0.3"
        />
        <path
          d="M 26 28 L 38 16"
          stroke={iconColor}
          strokeWidth="1"
          strokeLinecap="round"
          opacity="0.3"
        />
        </svg>
      </div>

      {/* Text Logo */}
      {!iconOnly && (
        <div className="flex items-baseline">
          <span 
            className={currentSize.textSize}
            style={{ 
              color: textColor,
              fontWeight: 500,
              fontFamily: 'system-ui, -apple-system, sans-serif',
              letterSpacing: '-0.01em'
            }}
          >
            L1Beat
          </span>
        </div>
      )}
    </div>
  );
}

