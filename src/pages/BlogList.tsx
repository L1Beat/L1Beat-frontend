import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, Filter, Tag, AlertCircle, RefreshCw, TrendingUp, Clock, Calendar, ArrowRight, Sparkles, BookOpen } from 'lucide-react';
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
    const [selectedTag, setSelectedTag] = useState<string | null>(
        searchParams.get('tag')
    );
    const [hasMore, setHasMore] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [health, setHealth] = useState<HealthStatus | null>(null);

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

    const filteredPosts = posts.filter(post =>
        post.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        post.excerpt.toLowerCase().includes(searchTerm.toLowerCase()) ||
        post.tags.some(tag => tag.toLowerCase().includes(searchTerm.toLowerCase()))
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
                    {/* Background Pattern */}
                    <div className="absolute inset-0 bg-black/20"></div>
                    <div className="absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg%20width%3D%2260%22%20height%3D%2260%22%20viewBox%3D%220%200%2060%2060%22%20xmlns%3D%22http://www.w3.org/2000/svg%22%3E%3Cg%20fill%3D%22none%22%20fill-rule%3D%22evenodd%22%3E%3Cg%20fill%3D%22%23ffffff%22%20fill-opacity%3D%220.05%22%3E%3Ccircle%20cx%3D%2230%22%20cy%3D%2230%22%20r%3D%222%22/%3E%3C/g%3E%3C/g%3E%3C/svg%3E')] opacity-30"></div>
                    
                    <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
                        <div className="text-center">
                            <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/10 backdrop-blur-sm rounded-full text-white/90 text-sm font-medium mb-6">
                                Insights from the Avalanche Ecosystem
                            </div>
                            
                            <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold text-white mb-6 leading-tight">
                                L1Beat
                                <span className="block text-3xl md:text-4xl lg:text-5xl font-normal text-white/80 mt-2">
                                    Blog
                                </span>
                            </h1>
                            
                            <p className="text-xl md:text-2xl text-white/90 max-w-3xl mx-auto leading-relaxed mb-8">
                                Deep dives into Avalanche L1s, analytics, and the future of finance.
                            </p>

                            {/* Stats */}
                            <div className="flex flex-wrap justify-center gap-8 text-white/80">
                                <div className="text-center">
                                    <div className="text-2xl font-bold text-white">{posts.length}</div>
                                    <div className="text-sm">Articles</div>
                                </div>
                                <div className="text-center">
                                    <div className="text-2xl font-bold text-white">{tags.length}</div>
                                    <div className="text-sm">Topics</div>
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

                    {/* Content */}
                    {filteredPosts.length > 0 ? (
                        <div className="space-y-16">
                            {/* Featured Post */}
                            {featuredPost && (
                                <section>
                                    <div className="flex items-center gap-3 mb-8">                                        
                                        <div className="flex-1 h-px bg-gradient-to-r from-gray-300 dark:from-gray-600 to-transparent"></div>
                                    </div>
                                    
                                    <div className="relative group">
                                        <div className="absolute -inset-1 bg-gradient-to-r from-blue-600 via-purple-600 to-indigo-600 rounded-2xl blur opacity-25 group-hover:opacity-40 transition duration-1000 group-hover:duration-200"></div>
                                        <div className="relative">
                                            <BlogCard post={featuredPost} featured />
                                        </div>
                                    </div>
                                </section>
                            )}

                            {/* Search and Filters Section */}
                    <section>
                        <div className="bg-white dark:bg-dark-800 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-700 p-6 mb-12">
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
                                            className="w-full pl-12 pr-4 py-4 border border-gray-300 dark:border-gray-600 rounded-xl bg-gray-50 dark:bg-dark-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 text-lg"
                                        />
                                    </div>
                                </div>

                                {/* Tag Filters */}
                                {tags.length > 0 && (
                                    <div className="flex flex-wrap items-center gap-3">
                                        <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                                            <Filter className="w-4 h-4" />
                                            <span className="text-sm font-medium">Filter by topic:</span>
                                        </div>
                                        
                                        <button
                                            onClick={() => handleTagFilter(null)}
                                            className={`px-4 py-2 text-sm font-medium rounded-full transition-all duration-200 ${!selectedTag
                                                ? 'bg-blue-600 text-white shadow-lg transform scale-105'
                                                : 'bg-gray-100 dark:bg-dark-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-dark-600 hover:scale-105'
                                            }`}
                                        >
                                            All Topics
                                        </button>
                                        
                                        {tags.slice(0, 6).map((tag) => (
                                            <button
                                                key={tag.name}
                                                onClick={() => handleTagFilter(tag.name)}
                                                className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-full transition-all duration-200 ${selectedTag === tag.name
                                                    ? 'bg-blue-600 text-white shadow-lg transform scale-105'
                                                    : 'bg-gray-100 dark:bg-dark-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-dark-600 hover:scale-105'
                                                }`}
                                            >
                                                <Tag className="w-3 h-3" />
                                                {tag.name}
                                                <span className="ml-1 px-2 py-0.5 text-xs bg-white/20 rounded-full">
                                                    {tag.count}
                                                </span>
                                            </button>
                                        ))}
                                        
                                        {tags.length > 6 && (
                                            <span className="text-sm text-gray-500 dark:text-gray-400">
                                                +{tags.length - 6} more
                                            </span>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    </section>

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
                                    
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                                        {regularPosts.map((post, index) => (
                                            <div 
                                                key={post._id}
                                                className="animate-fade-in"
                                                style={{
                                                    animationDelay: `${index * 100}ms`,
                                                    animationFillMode: 'both'
                                                }}
                                            >
                                                <BlogCard post={post} />
                                            </div>
                                        ))}
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