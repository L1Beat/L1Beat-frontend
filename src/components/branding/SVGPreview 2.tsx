export function SVGPreview() {
  return (
    <div className="bg-gradient-to-br from-indigo-900 to-purple-900 rounded-xl p-8 border border-indigo-700 mt-8">
      <div className="space-y-6">
        <div className="text-center space-y-2">
          <h2 className="text-white">✨ Animated SVG Files</h2>
          <p className="text-indigo-200">Now with pulse animations! View them directly in your browser</p>
        </div>
        
        <div className="grid md:grid-cols-2 gap-6">
          {/* Animated Dark Logo */}
          <div className="bg-slate-900 rounded-lg p-6 border border-slate-700">
            <div className="space-y-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-white">logo-dark-animated.svg</span>
                <span className="text-xs text-purple-400 px-2 py-1 bg-purple-400/10 rounded animate-pulse">Animated</span>
              </div>
              <div className="bg-slate-800 rounded-lg p-6 flex items-center justify-center min-h-[100px]">
                <img src="/logo-dark-animated.svg" alt="Animated Dark Logo" className="max-w-full h-auto" />
              </div>
              <p className="text-sm text-slate-400">Full animated logo - Dark mode</p>
            </div>
          </div>

          {/* Animated Light Logo */}
          <div className="bg-white rounded-lg p-6 border border-slate-200">
            <div className="space-y-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-slate-900">logo-light-animated.svg</span>
                <span className="text-xs text-purple-600 px-2 py-1 bg-purple-100 rounded animate-pulse">Animated</span>
              </div>
              <div className="bg-slate-50 rounded-lg p-6 flex items-center justify-center min-h-[100px]">
                <img src="/logo-light-animated.svg" alt="Animated Light Logo" className="max-w-full h-auto" />
              </div>
              <p className="text-sm text-slate-600">Full animated logo - Light mode</p>
            </div>
          </div>

          {/* Animated Dark Icon */}
          <div className="bg-slate-900 rounded-lg p-6 border border-slate-700">
            <div className="space-y-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-white">icon-dark-animated.svg</span>
                <span className="text-xs text-purple-400 px-2 py-1 bg-purple-400/10 rounded animate-pulse">Animated</span>
              </div>
              <div className="bg-slate-800 rounded-lg p-6 flex items-center justify-center min-h-[100px]">
                <img src="/icon-dark-animated.svg" alt="Animated Dark Icon" width="64" height="64" />
              </div>
              <p className="text-sm text-slate-400">Icon only - Dark mode</p>
            </div>
          </div>

          {/* Animated Light Icon */}
          <div className="bg-white rounded-lg p-6 border border-slate-200">
            <div className="space-y-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-slate-900">icon-light-animated.svg</span>
                <span className="text-xs text-purple-600 px-2 py-1 bg-purple-100 rounded animate-pulse">Animated</span>
              </div>
              <div className="bg-slate-50 rounded-lg p-6 flex items-center justify-center min-h-[100px]">
                <img src="/icon-light-animated.svg" alt="Animated Light Icon" width="64" height="64" />
              </div>
              <p className="text-sm text-slate-600">Icon only - Light mode</p>
            </div>
          </div>

          {/* Animated Favicon */}
          <div className="bg-slate-900 rounded-lg p-6 border border-slate-700 md:col-span-2">
            <div className="space-y-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-white">favicon-animated.svg</span>
                <span className="text-xs text-purple-400 px-2 py-1 bg-purple-400/10 rounded animate-pulse">Animated</span>
              </div>
              <div className="bg-slate-800 rounded-lg p-6 flex items-center justify-center min-h-[100px]">
                <img src="/favicon-animated.svg" alt="Animated Favicon" width="48" height="48" />
              </div>
              <p className="text-sm text-slate-400">Animated favicon - Use as browser icon</p>
            </div>
          </div>
        </div>

        <div className="bg-indigo-950/50 rounded-lg p-5 border border-indigo-700/50">
          <div className="space-y-3">
            <p className="text-indigo-200">🎯 Animation Features:</p>
            <ul className="text-sm text-indigo-300 space-y-2">
              <li>• Heartbeat pulse flows through the line continuously</li>
              <li>• Network nodes pulse in sequence showing data flow</li>
              <li>• Works in modern browsers (Chrome, Firefox, Safari, Edge)</li>
              <li>• Perfect for GitHub README, website headers, and more</li>
              <li>• No JavaScript needed - pure SVG animation</li>
            </ul>
          </div>
        </div>

        <div className="bg-indigo-950/50 rounded-lg p-5 border border-indigo-700/50">
          <p className="text-sm text-indigo-200 mb-3">How to use animated SVGs:</p>
          <pre className="text-xs text-indigo-300 overflow-x-auto bg-slate-900 p-4 rounded">
{`<!-- In HTML -->
<img src="/logo-dark-animated.svg" alt="L1Beat Logo" />

<!-- Or inline for better control -->
<object data="/logo-dark-animated.svg" type="image/svg+xml"></object>

<!-- In Markdown (GitHub, etc.) -->
![L1Beat Logo](/logo-dark-animated.svg)`}
          </pre>
        </div>
      </div>
    </div>
  );
}
