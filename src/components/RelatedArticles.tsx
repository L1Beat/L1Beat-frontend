import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Clock, Calendar, Tag, ArrowRight } from 'lucide-react';
import { getRelatedPosts, RelatedPost, formatBlogDate, getBlogPosts } from '../api/blogApi';
import { getBlogPostImageUrl } from '../utils/imageExtractor';

interface RelatedArticlesProps {
    currentPostSlug: string;
    limit?: number;
}

export function RelatedArticles({ currentPostSlug, limit = 4 }: RelatedArticlesProps) {
    const [posts, setPosts] = useState<RelatedPost[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isRecent, setIsRecent] = useState(false); // Track if we're showing recent vs related

    useEffect(() => {
        const fetchPosts = async () => {
            try {
                setLoading(true);
                setError(null);
                setIsRecent(false);

                // First, try to get related posts based on tags
                try {
                    const relatedResponse = await getRelatedPosts(currentPostSlug, limit);
                    
                    if (relatedResponse.data && relatedResponse.data.length > 0) {
                        // Success! We have related posts
                        setPosts(relatedResponse.data);
                        setIsRecent(false);
                        return;
                    }
                } catch (relatedError) {
                    console.warn('Related posts fetch failed, falling back to recent posts:', relatedError);
                }

                // Fallback: Get recent posts
                console.info('No related posts found, fetching recent posts as fallback');
                const recentResponse = await getBlogPosts(limit, 0);
                
                if (recentResponse.data && recentResponse.data.length > 0) {
                    // Filter out the current post and convert to RelatedPost format
                    const recentPosts = recentResponse.data
                        .filter(post => post.slug !== currentPostSlug)
                        .slice(0, limit)
                        .map(post => ({
                            _id: post._id,
                            title: post.title,
                            slug: post.slug,
                            excerpt: post.excerpt,
                            publishedAt: post.publishedAt,
                            author: post.author,
                            authors: post.authors,
                            tags: post.tags,
                            imageUrl: getBlogPostImageUrl(post), // Use the utility function here
                            readTime: post.readTime || 5,
                            views: post.views,
                            matchingTagsCount: 0, // No tag matching for recent posts
                            matchingTags: []
                        }));

                    setPosts(recentPosts);
                    setIsRecent(true);
                } else {
                    // No posts at all - this should rarely happen
                    setPosts([]);
                }

            } catch (err) {
                setError('Failed to load articles');
                console.error('Error fetching posts:', err);
                setPosts([]);
            } finally {
                setLoading(false);
            }
        };

        if (currentPostSlug) {
            fetchPosts();
        }
    }, [currentPostSlug, limit]);

    if (loading) {
        return (
            <div className="space-y-4">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                    Related Articles
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {Array.from({ length: limit }).map((_, i) => (
                        <div key={i} className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
                            <div className="animate-pulse">
                                <div className="h-4 bg-gray-300 dark:bg-gray-600 rounded w-3/4 mb-4"></div>
                                <div className="h-3 bg-gray-300 dark:bg-gray-600 rounded mb-2"></div>
                                <div className="h-3 bg-gray-300 dark:bg-gray-600 rounded w-1/2"></div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    // Don't show anything if we have an error AND no posts to show
    if (error && posts.length === 0) {
        return null;
    }

    // Don't show anything if we have no posts at all
    if (posts.length === 0) {
        return null;
    }

    return (
        <div className="space-y-8">
            {/* Header Section */}
            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
                <div>
                    <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
                        {isRecent ? 'Recent Articles' : 'Related Articles'}
                    </h2>
                    {/* Show a subtle indicator when showing recent vs related */}
                    {isRecent ? (
                        <p className="text-gray-500 dark:text-gray-400">
                            Showing recent articles since no related articles were found
                        </p>
                    ) : (
                        <p className="text-gray-500 dark:text-gray-400">
                            Articles with similar topics and tags
                        </p>
                    )}
                </div>
                <Link 
                    to="/blog"
                    className="inline-flex items-center gap-2 text-sm font-medium text-[#ef4444] dark:text-[#ef4444] hover:text-[#dc2626] dark:hover:text-[#dc2626] transition-colors group"
                >
                    View all articles
                    <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform duration-200" />
                </Link>
            </div>

            {/* Articles Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {posts.map((post) => (
                    <Link
                        key={post._id}
                        to={`/blog/${post.slug}`}
                        className="group block bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 hover:border-[#ef4444]/50 dark:hover:border-[#ef4444]/50 transition-all duration-300 overflow-hidden hover:shadow-xl hover:-translate-y-1"
                    >
                        {/* Image */}
                        {post.imageUrl && (
                            <div className="relative h-52 overflow-hidden">
                                <img
                                    src={post.imageUrl}
                                    alt={post.title}
                                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                />
                                <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                            </div>
                        )}

                        <div className="p-8">
                            {/* Tags for related articles */}
                            {!isRecent && post.matchingTagsCount > 0 && (
                                <div className="flex items-center gap-2 mb-4">
                                    <div className="flex items-center gap-1 px-3 py-1 bg-[#ef4444]/10 dark:bg-[#ef4444]/20 text-[#ef4444] dark:text-[#ef4444] rounded-full text-xs font-medium">
                                        <Tag className="w-3 h-3" />
                                        {post.matchingTagsCount} shared tag{post.matchingTagsCount > 1 ? 's' : ''}
                                    </div>
                                </div>
                            )}

                            {/* Title */}
                            <h3 className="font-bold text-xl text-gray-900 dark:text-white group-hover:text-[#ef4444] dark:group-hover:text-[#ef4444] transition-colors mb-4 line-clamp-2 leading-tight">
                                {post.title}
                            </h3>

                            {/* Excerpt */}
                            <p className="text-gray-600 dark:text-gray-300 mb-6 line-clamp-3 leading-relaxed">
                                {post.excerpt}
                            </p>

                            {/* Meta */}
                            <div className="flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400 mb-6">
                                <div className="flex items-center gap-2">
                                    <Calendar className="w-4 h-4" />
                                    <span>{formatBlogDate(post.publishedAt)}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Clock className="w-4 h-4" />
                                    <span>{post.readTime} min read</span>
                                </div>
                            </div>

                            {/* Read more indicator */}
                            <div className="flex items-center text-[#ef4444] dark:text-[#ef4444] font-semibold text-sm group-hover:gap-3 transition-all duration-200">
                                <span>Read article</span>
                                <ArrowRight className="w-4 h-4 transform group-hover:translate-x-1 transition-transform duration-200" />
                            </div>
                        </div>
                    </Link>
                ))}
            </div>
        </div>
    );
}