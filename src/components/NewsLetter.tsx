import React from 'react';

// Helius-style subscription component with light/dark mode support
const Newsletter = () => (
    <div className="bg-card rounded-xl p-8 lg:p-12 border border-border">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
            {/* Left side - Text content */}
            <div>
                <h3 className="text-3xl font-bold text-foreground mb-4">
                    Subscribe to L1Beat
                </h3>
                <p className="text-muted-foreground text-lg leading-relaxed">
                    Stay up-to-date with the latest in Avalanche development and receive updates when we post
                </p>
            </div>

            {/* Right side - Form */}
            <div className="flex flex-col items-center lg:items-end">
                <div className="w-full max-w-sm">
                    <div className="flex gap-3 mb-4">
                        <input
                            type="email"
                            placeholder="Type your email..."
                            className="flex-1 px-4 py-3 bg-muted border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
                        />
                        <button className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 focus:ring-offset-card">
                            Subscribe
                        </button>
                    </div>

                    <p className="text-xs text-muted-foreground text-center lg:text-right">
                        By subscribing you agree to{' '}
                        <a href="https://substack.com/terms" target="_blank" rel="noopener noreferrer" className="text-foreground hover:text-[#ef4444] underline transition-colors">
                            Substack's Terms of Use
                        </a>
                        , our{' '}
                        <a href="https://substack.com/privacy" target="_blank" rel="noopener noreferrer" className="text-foreground hover:text-[#ef4444] underline transition-colors">
                            Privacy Policy
                        </a>
                        {' '}and our{' '}
                        <a href="https://substack.com/ccpa" target="_blank" rel="noopener noreferrer" className="text-foreground hover:text-[#ef4444] underline transition-colors">
                            Information collection notice
                        </a>
                    </p>
                </div>
            </div>
        </div>
    </div>
);

export default Newsletter;
