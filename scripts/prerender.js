// Script to fetch blog post slugs for prerendering
import { config } from '../src/config.ts';

export async function getBlogRoutes() {
    try {
        const response = await fetch(`${config.apiBaseUrl}/api/blog/posts?limit=1000`);
        if (!response.ok) {
            console.warn('Failed to fetch blog posts for prerendering');
            return [];
        }

        const data = await response.json();
        const routes = data.data.map(post => `/blog/${post.slug}`);

        console.log(`Found ${routes.length} blog posts to prerender`);
        return routes;
    } catch (error) {
        console.error('Error fetching blog routes:', error);
        return [];
    }
}

// Export routes for prerendering
export const routes = [
    '/',
    '/blog',
    '/acps',
    '/404',
    // Blog routes will be added dynamically
];
