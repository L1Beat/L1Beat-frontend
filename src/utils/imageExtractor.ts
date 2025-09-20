// Utility functions for extracting images from blog content and providing fallbacks

/**
 * Extracts the first image URL from HTML or markdown content
 * @param content - HTML or markdown content string
 * @returns The URL of the first image found, or null if none found
 */
export function extractFirstImageFromContent(content: string): string | null {
    if (!content || typeof content !== 'string') {
        return null;
    }

    // Multiple regex patterns for better image detection
    const patterns = [
        // Substack CDN images in img tags (priority - these are the main ones)
        /<img[^>]*\ssrc=["'](https:\/\/substackcdn\.com\/[^"']+)["'][^>]*>/i,

        // Standard HTML img tags - various formats and attribute orders
        /<img[^>]*\ssrc=["']([^"']+)["'][^>]*>/i,
        /<img[^>]*\ssrc=([^\s>]+)[^>]*>/i, // unquoted src

        // Figure wrapped images (common in Substack)
        /<figure[^>]*>[\s\S]*?<img[^>]*\ssrc=["']([^"']+)["'][^>]*>[\s\S]*?<\/figure>/i,

        // Picture elements with source tags
        /<picture[^>]*>[\s\S]*?<img[^>]*\ssrc=["']([^"']+)["'][^>]*>[\s\S]*?<\/picture>/i,

        // Links to images (Substack sometimes wraps images in links)
        /<a[^>]*href=["'](https:\/\/substackcdn\.com\/[^"']+\.(?:jpg|jpeg|png|gif|webp))["'][^>]*>/i,

        // Markdown images - various formats
        /!\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/, // with optional title
        /!\[[^\]]*\]\(\s*([^)\s]+)\s*\)/, // with spaces

        // WordPress/CMS style images
        /\[img[^\]]*src=["']([^"']+)["'][^\]]*\]/i,

        // Base64 images
        /<img[^>]*\ssrc=["'](data:image\/[^"']+)["'][^>]*>/i,

        // Any HTTPS image URL in quotes
        /["'](https:\/\/[^"'\s]+\.(?:jpg|jpeg|png|gif|webp))["']/i,
    ];

    for (const pattern of patterns) {
        const match = content.match(pattern);
        if (match && match[1]) {
            const cleanedUrl = cleanImageUrl(match[1]);
            if (cleanedUrl) {
                return cleanedUrl;
            }
        }
    }

    return null;
}

/**
 * Cleans and validates an image URL
 * @param url - Raw image URL
 * @returns Cleaned URL or null if invalid
 */
function cleanImageUrl(url: string): string | null {
    if (!url) return null;

    // Remove any quotes and trim whitespace
    let cleaned = url.replace(/["']/g, '').trim();

    // Remove any markdown title syntax
    cleaned = cleaned.split(/\s+/)[0]; // Take only the URL part, ignore title

    // Handle relative URLs by converting them if needed
    if (cleaned.startsWith('./') || cleaned.startsWith('../')) {
        // For relative URLs, we might need base URL context
        // For now, return as-is and let the browser handle it
        return cleaned;
    }

    // Basic URL validation - accept various formats
    if (
        cleaned.startsWith('http://') ||
        cleaned.startsWith('https://') ||
        cleaned.startsWith('/') ||
        cleaned.startsWith('data:image/') || // Base64 images
        /^[a-zA-Z0-9]/.test(cleaned) // Relative paths without ./ prefix
    ) {
        return cleaned;
    }

    return null;
}

/**
 * Gets the fallback image URL for blog posts without images
 * @returns URL to the fallback image
 */
export function getFallbackImageUrl(): string {
    // Return a gradient or placeholder image
    return 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAwIiBoZWlnaHQ9IjI0MCIgdmlld0JveD0iMCAwIDQwMCAyNDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSI0MDAiIGhlaWdodD0iMjQwIiBmaWxsPSJ1cmwoI2dyYWRpZW50KSIvPgo8ZGVmcz4KICA8bGluZWFyR3JhZGllbnQgaWQ9ImdyYWRpZW50IiB4MT0iMCUiIHkxPSIwJSIgeDI9IjEwMCUiIHkyPSIxMDAlIj4KICAgIDxzdG9wIG9mZnNldD0iMCUiIHN0b3AtY29sb3I9IiM2MzY2ZjEiLz4KICAgIDxzdG9wIG9mZnNldD0iNTAlIiBzdG9wLWNvbG9yPSIjOGI1Y2Y2Ii8+CiAgICA8c3RvcCBvZmZzZXQ9IjEwMCUiIHN0b3AtY29sb3I9IiNhNzU1ZjciLz4KICA8L2xpbmVhckdyYWRpZW50Pgo8L2RlZnM+CjxnIG9wYWNpdHk9IjAuMSI+CiAgPGNpcmNsZSBjeD0iMjAwIiBjeT0iMTIwIiByPSI0MCIgZmlsbD0id2hpdGUiLz4KICA8Y2lyY2xlIGN4PSIzMDAiIGN5PSI4MCIgcj0iMjAiIGZpbGw9IndoaXRlIi8+CiAgPGNpcmNsZSBjeD0iMTAwIiBjeT0iMTYwIiByPSIzMCIgZmlsbD0id2hpdGUiLz4KPC9nPgo8L3N2Zz4K';
}

/**
 * Gets the appropriate image URL for a blog post
 * Priority: post.imageUrl -> extracted image -> fallback
 * @param post - Blog post object
 * @returns Image URL to use for the post
 */
export function getBlogPostImageUrl(post: { imageUrl?: string; content?: string; mainContent?: string }): string {
    // First priority: existing imageUrl
    if (post.imageUrl) {
        return post.imageUrl;
    }

    // Second priority: extract from mainContent (Substack content)
    if (post.mainContent) {
        const extractedImage = extractFirstImageFromContent(post.mainContent);
        if (extractedImage) {
            return extractedImage;
        }
    }

    // Third priority: extract from content (legacy/other sources)
    if (post.content) {
        const extractedImage = extractFirstImageFromContent(post.content);
        if (extractedImage) {
            return extractedImage;
        }
    }

    // Fallback: default image
    return getFallbackImageUrl();
}