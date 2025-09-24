import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, Filter, Tag, AlertCircle, RefreshCw, TrendingUp, Clock, Calendar, ArrowRight, Sparkles, BookOpen, Archive } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { BlogPost, getBlogPosts, getBlogTags, BlogTag } from '../api/blogApi';
import { BlogCard } from '../components/BlogCard';
import { StatusBar } from '../components/StatusBar';
import { Footer } from '../components/Footer';
import { getHealth } from '../api';

export function BlogList() {
    const [searchParams, setSearchParams] = useSearchParams();
    const [posts, setPosts] = useState<BlogPost[]>([]);
    const [tags, setTags] = useState<BlogTag[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
    const [selectedTag, setSelectedTag] = useState<string | null>(
        searchParams.get('tag')
    );
    const [hasMore, setHasMore] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [health, setHealth] = useState<HealthStatus | null>(null);
    const [searchSuggestions, setSearchSuggestions] = useState<string[]>([]);
    const [showSuggestions, setShowSuggestions] = useState(false);

    const POSTS_PER_PAGE = 12;

    const fetchPosts = async (offset: number = 0, tag?: string, append: boolean = false) => {
        try {
            if (!append) setLoading(true);
            else setLoadingMore(true);

            const response = await getBlogPosts(POSTS_PER_PAGE, offset, tag || undefined);

            if (append) {
                setPosts(prev => [...prev, ...response.data]);
            } else {
                setPosts(response.data);
            }

            setHasMore(response.metadata.hasMore);
            setError(null);
        } catch (err) {
            setError('Failed to load blog posts. Please try again.');
            console.error('Error fetching posts:', err);
        } finally {
            setLoading(false);
            setLoadingMore(false);
        }
    };

    const fetchTags = async () => {
        try {
            const response = await getBlogTags();
            setTags(response.data);
        } catch (err) {
            console.error('Error fetching tags:', err);
        }
    };

    // Generate search suggestions
    const generateSuggestions = useCallback((term: string) => {
        if (!term.trim() || term.length < 2) return [];

        const suggestions = new Set<string>();
        const termLower = term.toLowerCase();

        posts.forEach(post => {
            // Add title words that start with the search term
            post.title.split(' ').forEach(word => {
                const cleanWord = word.replace(/[^\w]/g, '').toLowerCase();
                if (cleanWord.startsWith(termLower) && cleanWord !== termLower) {
                    suggestions.add(word);
                }
            });

            // Add author if it matches
            if (post.author?.toLowerCase().includes(termLower)) {
                suggestions.add(post.author);
            }

            // Add matching tags
            post.tags.forEach(tag => {
                if (tag.toLowerCase().includes(termLower)) {
                    suggestions.add(tag);
                }
            });
        });

        return Array.from(suggestions).slice(0, 5);
    }, [posts]);

    // Debounce search term and generate suggestions
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearchTerm(searchTerm);
            if (searchTerm.trim() && searchTerm.length >= 2) {
                setSearchSuggestions(generateSuggestions(searchTerm));
                setShowSuggestions(true);
            } else {
                setShowSuggestions(false);
            }
        }, 300);

        return () => clearTimeout(timer);
    }, [searchTerm, generateSuggestions]);

    useEffect(() => {
        fetchPosts(0, selectedTag || undefined);
        fetchTags();
        getHealth().then(setHealth);
    }, [selectedTag]);

    const handleTagFilter = (tag: string | null) => {
        setSelectedTag(tag);
        if (tag) {
            setSearchParams({ tag });
        } else {
            setSearchParams({});
        }
    };

    const loadMore = () => {
        fetchPosts(posts.length, selectedTag || undefined, true);
    };

    // Enhanced search function with relevance scoring
    const searchPosts = useCallback((posts: BlogPost[], searchTerm: string) => {
        if (!searchTerm.trim()) return posts;

        const term = searchTerm.toLowerCase();

        return posts
            .map(post => {
                let relevanceScore = 0;

                // Title matches get highest score
                if (post.title.toLowerCase().includes(term)) {
                    relevanceScore += 10;
                    if (post.title.toLowerCase().startsWith(term)) relevanceScore += 5;
                }

                // Excerpt matches
                if (post.excerpt.toLowerCase().includes(term)) {
                    relevanceScore += 5;
                }

                // Content matches (if available)
                if (post.content?.toLowerCase().includes(term)) {
                    relevanceScore += 3;
                }

                // Author matches
                if (post.author?.toLowerCase().includes(term)) {
                    relevanceScore += 4;
                }

                // Tag matches
                post.tags.forEach(tag => {
                    if (tag.toLowerCase().includes(term)) {
                        relevanceScore += 2;
                        if (tag.toLowerCase() === term) relevanceScore += 3;
                    }
                });

                return relevanceScore > 0 ? { ...post, relevanceScore } : null;
            })
            .filter((post): post is BlogPost & { relevanceScore: number } => post !== null)
            .sort((a, b) => b.relevanceScore - a.relevanceScore)
            .map(({ relevanceScore, ...post }) => post);
    }, []);

    const filteredPosts = useMemo(() =>
        searchPosts(posts, debouncedSearchTerm),
        [posts, debouncedSearchTerm, searchPosts]
    );

    const featuredPost = filteredPosts[0];
    const regularPosts = filteredPosts.slice(1);

    if (loading && posts.length === 0) {
        return (
            <div className="min-h-screen bg-gray-50 dark:bg-dark-900">
                <StatusBar health={health} />
                <div className="flex items-center justify-center py-20">
                    <div className="text-center">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
                        <p className="text-gray-600 dark:text-gray-300">Loading amazing content...</p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-dark-900">
            <StatusBar health={health} />

            <div className="flex-1">
                {/* Hero Section */}
                <div className="relative bg-gradient-to-br from-blue-600 via-indigo-700 to-purple-800 overflow-hidden">
                    {/* Background Effects */}
                    <div className="absolute inset-0 bg-black/10"></div>
                    <div className="absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg%20width%3D%2260%22%20height%3D%2260%22%20viewBox%3D%220%200%2060%2060%22%20xmlns%3D%22http://www.w3.org/2000/svg%22%3E%3Cg%20fill%3D%22none%22%20fill-rule%3D%22evenodd%22%3E%3Cg%20fill%3D%22%23ffffff%22%20fill-opacity%3D%220.03%22%3E%3Ccircle%20cx%3D%2230%22%20cy%3D%2230%22%20r%3D%222%22/%3E%3C/g%3E%3C/g%3E%3C/svg%3E')] opacity-50"></div>

                    {/* Floating Elements */}
                    <div className="absolute top-20 left-10 w-32 h-32 bg-white/10 rounded-full blur-xl animate-pulse"></div>
                    <div className="absolute bottom-20 right-10 w-24 h-24 bg-purple-300/20 rounded-full blur-lg animate-bounce"></div>
                    <div className="absolute top-1/2 left-1/3 w-16 h-16 bg-blue-300/15 rounded-full blur-md animate-ping"></div>
                    
                    <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
                        <div className="text-center">
                            <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/10 backdrop-blur-sm rounded-full text-white/90 text-sm font-medium mb-6">
                                Insights from the Avalanche Ecosystem
                            </div>
                            
                            <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold text-white mb-6 leading-tight tracking-tight">
                                <span className="bg-gradient-to-r from-white via-blue-100 to-white bg-clip-text text-transparent">
                                    L1Beat
                                </span>
                                <span className="block text-3xl md:text-4xl lg:text-5xl font-light text-white/90 mt-2 tracking-wide">
                                    <span className="inline-block animate-[fadeIn_1s_ease-out_0.5s_both]">Blog</span>
                                </span>
                            </h1>
                            
                            <p className="text-xl md:text-2xl text-white/90 max-w-3xl mx-auto leading-relaxed mb-10 animate-[fadeIn_1s_ease-out_0.8s_both]">
                                Deep dives into <span className="font-semibold text-blue-200">Avalanche L1s</span>, analytics, and the <span className="font-semibold text-purple-200">future of finance</span>.
                            </p>

                            {/* Stats */}
                            <div className="flex flex-wrap justify-center gap-12 text-white/80 animate-[fadeIn_1s_ease-out_1.2s_both]">
                                <div className="text-center group">
                                    <div className="text-3xl font-bold text-white mb-1 group-hover:scale-110 transition-transform duration-300">{posts.length}</div>
                                    <div className="text-sm uppercase tracking-wider text-white/70">Articles</div>
                                </div>
                                <div className="w-px h-12 bg-white/30"></div>
                                <div className="text-center group">
                                    <div className="text-3xl font-bold text-white mb-1 group-hover:scale-110 transition-transform duration-300">{tags.length}</div>
                                    <div className="text-sm uppercase tracking-wider text-white/70">Topics</div>
                                </div>
                                <div className="w-px h-12 bg-white/30"></div>
                                <div className="text-center group">
                                    <div className="text-3xl font-bold text-white mb-1 group-hover:scale-110 transition-transform duration-300">∞</div>
                                    <div className="text-sm uppercase tracking-wider text-white/70">Insights</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
                    {/* Error State */}
                    {error && (
                        <div className="mb-8 p-6 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-xl">
                            <div className="flex items-center gap-3">
                                <AlertCircle className="w-6 h-6 text-red-600 dark:text-red-400 flex-shrink-0" />
                                <div className="flex-1">
                                    <h3 className="font-semibold text-red-800 dark:text-red-200 mb-1">Unable to load content</h3>
                                    <p className="text-red-700 dark:text-red-300">{error}</p>
                                </div>
                                <button
                                    onClick={() => fetchPosts(0, selectedTag || undefined)}
                                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-500/20 rounded-lg transition-colors"
                                >
                                    <RefreshCw className="w-4 h-4" />
                                    Retry
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Search and Filters Section - Always visible */}
                    <section className="mb-16">
                        <motion.div
                            className="bg-white/80 dark:bg-dark-800/80 backdrop-blur-xl rounded-3xl shadow-xl border border-gray-200/50 dark:border-gray-700/50 p-8"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.5, ease: "easeOut" }}
                        >
                            <div className="flex flex-col lg:flex-row gap-6">
                                {/* Search Bar */}
                                <div className="flex-1">
                                    <div className="relative">
                                        <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                                        <input
                                            type="text"
                                            placeholder="Search articles, topics, or authors..."
                                            value={searchTerm}
                                            onChange={(e) => setSearchTerm(e.target.value)}
                                            onFocus={() => setShowSuggestions(searchTerm.length >= 2 && searchSuggestions.length > 0)}
                                            onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                                            className="w-full pl-12 pr-16 py-5 border border-gray-200 dark:border-gray-600 rounded-2xl bg-white dark:bg-dark-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-300 text-lg shadow-sm focus:shadow-lg"
                                        />
                                        {(debouncedSearchTerm || selectedTag) && (
                                            <motion.div
                                                className="absolute right-4 top-1/2 transform -translate-y-1/2 flex items-center gap-2"
                                                initial={{ opacity: 0, scale: 0.8 }}
                                                animate={{ opacity: 1, scale: 1 }}
                                                transition={{ duration: 0.2 }}
                                            >
                                                <div className="text-sm text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-dark-700 px-2 py-1 rounded">
                                                    {filteredPosts.length} result{filteredPosts.length !== 1 ? 's' : ''}
                                                </div>
                                                {(debouncedSearchTerm || selectedTag) && (
                                                    <motion.button
                                                        onClick={() => {
                                                            setSearchTerm('');
                                                            handleTagFilter(null);
                                                        }}
                                                        className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                                                        whileHover={{ scale: 1.1 }}
                                                        whileTap={{ scale: 0.9 }}
                                                        title="Clear search and filters"
                                                    >
                                                        <AlertCircle className="w-4 h-4" />
                                                    </motion.button>
                                                )}
                                            </motion.div>
                                        )}

                                        {/* Search Suggestions */}
                                        <AnimatePresence>
                                            {showSuggestions && searchSuggestions.length > 0 && (
                                                <motion.div
                                                    className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-dark-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg z-10 overflow-hidden"
                                                    initial={{ opacity: 0, y: -10, scale: 0.95 }}
                                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                                    exit={{ opacity: 0, y: -10, scale: 0.95 }}
                                                    transition={{ duration: 0.2, ease: "easeOut" }}
                                                >
                                                    {searchSuggestions.map((suggestion, index) => (
                                                        <motion.button
                                                            key={index}
                                                            onClick={() => {
                                                                setSearchTerm(suggestion);
                                                                setShowSuggestions(false);
                                                            }}
                                                            className="w-full text-left px-4 py-3 hover:bg-gray-50 dark:hover:bg-dark-700 transition-colors text-gray-900 dark:text-white"
                                                            initial={{ opacity: 0, x: -10 }}
                                                            animate={{ opacity: 1, x: 0 }}
                                                            transition={{ duration: 0.15, delay: index * 0.05 }}
                                                            whileHover={{ x: 5 }}
                                                        >
                                                            <div className="flex items-center gap-2">
                                                                <Search className="w-4 h-4 text-gray-400" />
                                                                <span>{suggestion}</span>
                                                            </div>
                                                        </motion.button>
                                                    ))}
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </div>
                                </div>

                                {/* Tag Filters */}
                                {tags.length > 0 && (
                                    <div className="flex flex-wrap items-center gap-3">
                                        <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                                            <Filter className="w-4 h-4" />
                                            <span className="text-sm font-medium">Filter by topic:</span>
                                        </div>

                                        <motion.button
                                            onClick={() => handleTagFilter(null)}
                                            className={`px-5 py-2.5 text-sm font-medium rounded-full transition-all duration-300 ${!selectedTag
                                                ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-500/25 transform scale-105'
                                                : 'bg-gray-100 dark:bg-dark-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-dark-600 hover:scale-105 border border-gray-200 dark:border-gray-600'
                                            }`}
                                            whileHover={{ scale: 1.05 }}
                                            whileTap={{ scale: 0.95 }}
                                        >
                                            All Topics
                                        </motion.button>

                                        {tags.slice(0, 6).map((tag) => (
                                            <motion.button
                                                key={tag.name}
                                                onClick={() => handleTagFilter(tag.name)}
                                                className={`inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-full transition-all duration-300 ${selectedTag === tag.name
                                                    ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-500/25 transform scale-105'
                                                    : 'bg-gray-100 dark:bg-dark-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-dark-600 hover:scale-105 border border-gray-200 dark:border-gray-600'
                                                }`}
                                                whileHover={{ scale: 1.05 }}
                                                whileTap={{ scale: 0.95 }}
                                            >
                                                <Tag className="w-3 h-3" />
                                                {tag.name}
                                                <span className="ml-1 px-2 py-0.5 text-xs bg-white/20 rounded-full">
                                                    {tag.count}
                                                </span>
                                            </motion.button>
                                        ))}

                                        {tags.length > 6 && (
                                            <span className="text-sm text-gray-500 dark:text-gray-400">
                                                +{tags.length - 6} more
                                            </span>
                                        )}
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    </section>

                    {/* Content */}
                    {filteredPosts.length > 0 ? (
                        <div className="space-y-16">
                            {/* Featured Post */}
                            {featuredPost && (
                                <motion.section
                                    className="mb-16"
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ duration: 0.6, delay: 0.2, ease: "easeOut" }}
                                >
                                    <div className="flex items-center gap-4 mb-8">
                                        <div className="flex items-center gap-2">
                                            <div className="w-3 h-3 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full"></div>
                                            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Featured Article</h2>
                                        </div>
                                        <div className="flex-1 h-px bg-gradient-to-r from-gray-300 dark:from-gray-600 to-transparent"></div>
                                    </div>

                                    <BlogCard post={featuredPost} featured />
                                </motion.section>
                            )}

                            {/* Latest Posts */}
                            {regularPosts.length > 0 && (
                                <section>
                                    {selectedTag && (
                                        <div className="flex justify-end mb-8">
                                            <div className="flex items-center gap-2 px-4 py-2 bg-blue-100 dark:bg-blue-500/20 rounded-full">
                                                <Tag className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                                                <span className="text-sm font-medium text-blue-800 dark:text-blue-300">
                                                    Filtered by: {selectedTag}
                                                </span>
                                            </div>
                                        </div>
                                    )}
                                    
                                    <div className="space-y-8">
                                        {/* Section Header */}
                                        <div className="flex items-center gap-4">
                                            <div className="flex items-center gap-2">
                                                <div className="w-2.5 h-2.5 bg-gradient-to-r from-indigo-500 to-blue-500 rounded-full"></div>
                                                <h2 className="text-xl font-bold text-gray-900 dark:text-white">Latest Articles</h2>
                                            </div>
                                            <div className="flex-1 h-px bg-gradient-to-r from-gray-300 dark:from-gray-600 to-transparent"></div>
                                            <span className="text-sm text-gray-500 dark:text-gray-400">{regularPosts.length} articles</span>
                                        </div>

                                        {/* Grid */}
                                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 lg:gap-8">
                                            {regularPosts.map((post, index) => (
                                                <div
                                                    key={post._id}
                                                    className="opacity-0 animate-[fadeInUp_0.6s_ease-out_forwards]"
                                                    style={{
                                                        animationDelay: `${index * 150}ms`
                                                    }}
                                                >
                                                    <BlogCard post={post} />
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </section>
                            )}

                            {/* Load More */}
                            {hasMore && (
                                <div className="text-center">
                                    <button
                                        onClick={loadMore}
                                        disabled={loadingMore}
                                        className="group inline-flex items-center gap-3 px-8 py-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold rounded-xl shadow-lg hover:shadow-xl transform hover:-translate-y-1 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
                                    >
                                        {loadingMore ? (
                                            <>
                                                <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
                                                Loading more articles...
                                            </>
                                        ) : (
                                            <>
                                                <span>Load More Articles</span>
                                                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform duration-200" />
                                            </>
                                        )}
                                    </button>
                                </div>
                            )}
                        </div>
                    ) : (
                        /* Empty State */
                        <div className="text-center py-20">
                            <div className="relative inline-block mb-8">
                                <div className="w-24 h-24 bg-gradient-to-br from-gray-200 to-gray-300 dark:from-gray-700 dark:to-gray-800 rounded-2xl flex items-center justify-center">
                                    <Search className="w-12 h-12 text-gray-400 dark:text-gray-500" />
                                </div>
                                <div className="absolute -top-2 -right-2 w-8 h-8 bg-yellow-400 rounded-full flex items-center justify-center">
                                    <AlertCircle className="w-4 h-4 text-yellow-800" />
                                </div>
                            </div>
                            
                            <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
                                {searchTerm || selectedTag ? 'No articles found' : 'No articles available'}
                            </h3>
                            
                            <p className="text-lg text-gray-600 dark:text-gray-300 mb-8 max-w-md mx-auto">
                                {searchTerm || selectedTag
                                    ? 'Try adjusting your search terms or browse all articles.'
                                    : 'Check back soon for fresh insights and analysis.'}
                            </p>
                            
                            {(searchTerm || selectedTag) && (
                                <button
                                    onClick={() => {
                                        setSearchTerm('');
                                        handleTagFilter(null);
                                    }}
                                    className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl shadow-lg hover:shadow-xl transform hover:-translate-y-1 transition-all duration-300"
                                >
                                    <RefreshCw className="w-4 h-4" />
                                    Clear all filters
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </div>
            <Footer />
        </div>
    );
}