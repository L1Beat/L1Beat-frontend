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

    // Optimize Substack images for Twitter/Social Media
    // 1. Convert WebP/Auto to JPG (Twitter hates WebP)
    // 2. Resize to 1200px width (Twitter max file size is 5MB, 1456px might be too big)
    if (cleaned.includes('substackcdn.com')) {
        // Fix format
        if (cleaned.includes('f_webp')) {
            cleaned = cleaned.replace('f_webp', 'f_jpg');
        } else if (cleaned.includes('f_auto')) {
            cleaned = cleaned.replace('f_auto', 'f_jpg');
        }

        // Fix dimensions (replace any w_XXXX with w_1200)
        if (cleaned.match(/w_\d+/)) {
            cleaned = cleaned.replace(/w_\d+/, 'w_1200');
        }
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
    // Return a fallback image
    return '/banner.png';
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