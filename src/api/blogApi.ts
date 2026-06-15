import { config } from '../config';

// --- lightweight response cache -------------------------------------------
// Blog content changes rarely, but getBlogPosts/getRelatedPosts/getBlogTags
// were called on every mount (BlogList, BlogPost, RelatedArticles, the search
// palette on every open) with no caching. Cache successful responses for a few
// minutes and dedupe concurrent in-flight requests for the same key.
const BLOG_CACHE_TTL = 5 * 60 * 1000;
interface BlogCacheEntry<T> { ts: number; data: T; }
const blogCache = new Map<string, BlogCacheEntry<unknown>>();
const blogInflight = new Map<string, Promise<unknown>>();

async function cachedBlogFetch<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
    const hit = blogCache.get(key);
    if (hit && Date.now() - hit.ts < BLOG_CACHE_TTL) {
        return hit.data as T;
    }
    const pending = blogInflight.get(key);
    if (pending) return pending as Promise<T>;

    const promise = (async () => {
        const data = await fetcher();
        blogCache.set(key, { ts: Date.now(), data });
        return data;
    })().finally(() => {
        blogInflight.delete(key);
    });

    blogInflight.set(key, promise);
    return promise as Promise<T>;
}

export interface BlogPost {
    _id: string;
    title: string;
    slug: string;
    subtitle?: string;  // NEW FIELD
    excerpt: string;
    content: string;
    mainContent?: string;  // NEW FIELD
    author: string;
    authors: string[];
    authorProfiles?: AuthorProfile[];  // NEW FIELD
    publishedAt: string;
    updatedAt: string;
    tags: string[];
    views: number;
    imageUrl?: string;
    readTime?: number;
}


export interface RelatedPost {
    _id: string;
    title: string;
    slug: string;
    excerpt: string;
    publishedAt: string;
    author: string;
    authors: string[];
    tags: string[];
    imageUrl?: string;
    readTime: number;
    views: number;
    matchingTagsCount: number;
    matchingTags: string[];
}

export interface RelatedPostsResponse {
    success: boolean;
    data: RelatedPost[];
    metadata: {
        currentPost: string;
        currentPostTags: string[];
        totalFound: number;
        retrievedAt: string;
    };
}

export async function getRelatedPosts(slug: string, limit: number = 4): Promise<RelatedPostsResponse> {
    return cachedBlogFetch(`related:${slug}:${limit}`, async () => {
        try {
            const response = await fetch(`${config.apiBaseUrl}/api/blog/posts/${slug}/related?limit=${limit}`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                },
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            console.error(`Error fetching related posts for ${slug}:`, error);
            throw error;
        }
    });
}
export interface BlogPostsResponse {
    success: boolean;
    data: BlogPost[];
    metadata: {  // Updated from pagination
        total: number;
        limit: number;
        offset: number;
        hasMore: boolean;
        tag?: string;
        requestId: string;
    };
}
export interface AuthorInfo {
    name: string;
    handle?: string;
    avatar?: string;
    bio?: string;
}

export interface AuthorProfile {
    name: string;
    slug: string;
    bio?: string;
    avatar?: string;
    role?: string;
    socialLinks?: {
        twitter?: string;
        linkedin?: string;
        website?: string;
        github?: string;
        substack?: string;
    };
    postCount?: number;
    joinDate?: string;
    isActive?: boolean;
}

// Helper function to get formatted authors string
export function getAuthorsDisplayString(post: BlogPost): string {
    if (post.authors && post.authors.length > 0) {
        if (post.authors.length === 1) {
            return post.authors[0];
        } else if (post.authors.length === 2) {
            return `${post.authors[0]} and ${post.authors[1]}`;
        } else {
            const lastAuthor = post.authors[post.authors.length - 1];
            const otherAuthors = post.authors.slice(0, -1).join(', ');
            return `${otherAuthors}, and ${lastAuthor}`;
        }
    }
    return post.author || 'L1Beat';
}

// Helper function to get primary author
export function getPrimaryAuthor(post: BlogPost): string {
    return post.authors && post.authors.length > 0 
        ? post.authors[0] 
        : post.author || 'L1Beat';
}

// Helper function to check if post has multiple authors
export function hasMultipleAuthors(post: BlogPost): boolean {
    return post.authors && post.authors.length > 1;
}

export interface BlogPostResponse {
    success: boolean;
    data: BlogPost;
    metadata: {
        requestId: string;
        retrievedAt: string;
    };
}

export interface BlogHealthResponse {
    success: boolean;
    stats: {
        totalPosts: number;
        syncedPosts: number;  // Updated field name
        recentPosts: number;  // Updated field name
        failedPosts: number;  // Updated field name
        totalViews: number;   // NEW FIELD
        mostRecentPost?: {    // NEW FIELD
            title: string;
            publishedAt: string;
            lastSynced: string;
        };
        healthStatus: string; // NEW FIELD
    };
    lastUpdate: string;
}

export interface BlogTag {
    name: string;
    count: number;
}

export interface BlogTagsResponse {
    success: boolean;
    data: BlogTag[];
}

// Rest of the functions remain the same...
export async function getBlogPosts(
    limit: number = 10,
    offset: number = 0,
    tag?: string
): Promise<BlogPostsResponse> {
    return cachedBlogFetch(`posts:${limit}:${offset}:${tag ?? ''}`, async () => {
        try {
            const params = new URLSearchParams({
                limit: limit.toString(),
                offset: offset.toString(),
            });

            if (tag) {
                params.append('tag', tag);
            }

            const response = await fetch(`${config.apiBaseUrl}/api/blog/posts?${params}`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                },
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            console.error('Error fetching blog posts:', error);
            throw new Error('Failed to fetch blog posts');
        }
    });
}

export async function getBlogPost(slug: string): Promise<BlogPostResponse> {
    return cachedBlogFetch(`post:${slug}`, async () => {
        try {
            const response = await fetch(`${config.apiBaseUrl}/api/blog/posts/${slug}`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                },
            });

            if (!response.ok) {
                if (response.status === 404) {
                    throw new Error('Blog post not found');
                }
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            console.error(`Error fetching blog post ${slug}:`, error);
            throw error;
        }
    });
}

export async function getBlogHealth(): Promise<BlogHealthResponse> {
    try {
        const response = await fetch(`${config.apiBaseUrl}/api/blog/health`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            },
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        return await response.json();
    } catch (error) {
        console.error('Error fetching blog health:', error);
        throw new Error('Failed to fetch blog health');
    }
}

export async function getBlogTags(): Promise<BlogTagsResponse> {
    return cachedBlogFetch('tags', async () => {
        try {
            const response = await fetch(`${config.apiBaseUrl}/api/blog/tags`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                },
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            console.error('Error fetching blog tags:', error);
            throw new Error('Failed to fetch blog tags');
        }
    });
}

export function calculateReadTime(content: string): number {
    if (!content || typeof content !== 'string') {
        return 1;
    }
    const wordsPerMinute = 200;
    const words = content.split(/\s+/).length;
    return Math.ceil(words / wordsPerMinute);
}

export function formatBlogDate(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
}