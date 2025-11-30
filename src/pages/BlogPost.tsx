import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import ContentRenderer from '../components/ContentRenderer';
import parse, { Element } from 'html-react-parser';
import {
    ArrowLeft,
    Calendar,
    Clock,
    Tag,
    Share2,
    Twitter,
    ExternalLink,
    AlertCircle,
    RefreshCw,
    Eye,
    Bookmark,
    Heart,
    MessageCircle,
    TrendingUp,
    Sparkles
} from 'lucide-react';
import { BlogPost as BlogPostType, getBlogPost, formatBlogDate, calculateReadTime, getRelatedPosts, RelatedPost } from '../api/blogApi';
import { getBlogPostImageUrl } from '../utils/imageExtractor';
import { AuthorCard } from '../components/AuthorCard';
import { StatusBar } from '../components/StatusBar';
import { Footer } from '../components/Footer';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { HealthStatus } from '../types';
import { RelatedArticles } from '../components/RelatedArticles';
import { SEO } from '../components/SEO';

// Enhanced Newsletter Subscription Component
const NewsletterSubscription = () => {
    const [email, setEmail] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isSubmitted, setIsSubmitted] = useState(false);

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setIsSubmitting(true);
        
        // Simulate submission delay
        setTimeout(() => {
            setIsSubmitted(true);
            setIsSubmitting(false);
            // Redirect to Substack subscription with pre-filled email
            window.open(`https://l1beat.substack.com/subscribe?email=${encodeURIComponent(email)}`, '_blank');
        }, 1000);
    };

    if (isSubmitted) {
        return (
            <div className="relative overflow-hidden bg-gradient-to-br from-green-50 to-emerald-100 dark:from-green-900/20 dark:to-emerald-900/20 border border-green-200 dark:border-green-700/50 rounded-2xl p-8">
                <div className="absolute top-0 right-0 w-32 h-32 bg-green-200/30 dark:bg-green-500/10 rounded-full -translate-y-16 translate-x-16"></div>
                <div className="relative text-center">
                    <div className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Heart className="w-8 h-8 text-white" />
                    </div>
                    <h3 className="text-2xl font-bold text-green-900 dark:text-green-100 mb-2">
                        Thank you for subscribing!
                    </h3>
                    <p className="text-green-700 dark:text-green-300">
                        You'll be redirected to complete your subscription on Substack.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="relative overflow-hidden bg-gradient-to-br from-[#ef4444] via-[#dc2626] to-[#b91c1c] rounded-2xl p-8 lg:p-12">
            {/* Background Pattern */}
            <div className="absolute inset-0 opacity-10">
                <div className="absolute inset-0" style={{
                    backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.1'%3E%3Ccircle cx='30' cy='30' r='2'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
                }}></div>
            </div>
            
            {/* Floating Elements */}
            <div className="absolute top-6 right-6 w-20 h-20 bg-white/10 rounded-full animate-float-subtle"></div>
            <div className="absolute bottom-6 left-6 w-12 h-12 bg-white/5 rounded-full animate-pulse"></div>
            
            <div className="relative grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-center">
                {/* Left side - Text content */}
                <div className="text-center lg:text-left">
                    <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/10 backdrop-blur-sm rounded-full text-white/90 text-sm font-medium mb-6">
                        Join the Community
                    </div>
                    
                    <h3 className="text-3xl lg:text-4xl font-bold text-white mb-4 leading-tight">
                        Never Miss an
                        <span className="block text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 to-orange-300">
                            Insight
                        </span>
                    </h3>
                    
                    <p className="text-white/90 text-lg leading-relaxed mb-6">
                        Get the latest analysis on Avalanche L1s, blockchain trends, and ecosystem developments delivered to your inbox.
                    </p>
                    
                    <div className="flex items-center gap-6 text-white/70 text-sm">
                        <div className="flex items-center gap-2">
                            <span>Exclusive content</span>
                        </div>
                    </div>
                </div>
                
                {/* Right side - Form */}
                <div className="w-full">
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="relative">
                            <input
                                type="email"
                                name="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="Enter your email address..."
                                required
                                className="w-full px-6 py-4 bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl text-white placeholder-white/60 focus:outline-none focus:ring-2 focus:ring-white/50 focus:border-white/30 transition-all duration-200 text-lg"
                            />
                        </div>
                        
                        <button 
                            type="submit"
                            disabled={isSubmitting}
                            className="w-full px-6 py-4 bg-white text-gray-900 font-semibold rounded-xl hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-transparent transition-all duration-200 transform hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none text-lg"
                        >
                            {isSubmitting ? (
                                <div className="flex items-center justify-center gap-2">
                                    <div className="animate-spin rounded-full h-5 w-5 border-2 border-gray-900 border-t-transparent"></div>
                                    Subscribing...
                                </div>
                            ) : (
                                'Subscribe to L1Beat'
                            )}
                        </button>
                    </form>
                    
                    <p className="text-xs text-white/60 mt-4 leading-relaxed">
                        By subscribing you agree to{' '}
                        <a href="https://substack.com/terms" target="_blank" rel="noopener noreferrer" className="text-white/80 hover:text-white underline transition-colors">
                            Substack's Terms of Use
                        </a>
                        , our{' '}
                        <a href="https://substack.com/privacy" target="_blank" rel="noopener noreferrer" className="text-white/80 hover:text-white underline transition-colors">
                            Privacy Policy
                        </a>
                        {' '}and our{' '}
                        <a href="https://substack.com/ccpa" target="_blank" rel="noopener noreferrer" className="text-white/80 hover:text-white underline transition-colors">
                            Information collection notice
                        </a>
                    </p>
                </div>
            </div>
        </div>
    );
};

// X Icon Component
const XIcon = ({ className }: { className?: string }) => (
    <svg 
        viewBox="0 0 24 24" 
        className={className}
        fill="currentColor"
    >
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
    </svg>
);

// Main BlogPost Component
export function BlogPost() {
    const { slug } = useParams<{ slug: string }>();
    const navigate = useNavigate();
    const [post, setPost] = useState<BlogPostType | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [health] = useState<HealthStatus | null>(null);
    const [shareMenuOpen, setShareMenuOpen] = useState(false);
    const [isBookmarked, setIsBookmarked] = useState(false);
    const [isLiked, setIsLiked] = useState(false);

    useEffect(() => {
        if (!slug) {
            navigate('/blog');
            return;
        }
        
        // Reset prerenderReady
        window.prerenderReady = false;
        
        fetchPost();
    }, [slug, navigate]);

    const fetchPost = async () => {
        if (!slug) return;

        try {
            setLoading(true);
            setError(null);
            const response = await getBlogPost(slug);
            setPost(response.data);
        } catch (err: any) {
            if (err.message === 'Blog post not found') {
                setError('Post not found');
            } else {
                setError('Failed to load blog post. Please try again.');
            }
            console.error('Error fetching post:', err);
        } finally {
            setLoading(false);
            // Mark as ready for prerendering
            window.prerenderReady = true;
        }
    };

    const sharePost = (platform: 'twitter' | 'copy') => {
        if (!post) return;

        const url = window.location.href;
        const text = `${post.title} - ${post.excerpt}`;

        switch (platform) {
            case 'twitter':
                window.open(
                    `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`,
                    '_blank'
                );
                break;
            case 'copy':
                navigator.clipboard.writeText(url).then(() => {
                    setShareMenuOpen(false);
                });
                break;
        }
    };

    const renderMainContent = (content: string | undefined) => {
        if (!content) return null;

        try {
            const blocks = JSON.parse(content);
            return <ContentRenderer blocks={blocks} />;
        } catch (error) {
            const cleanContent = content.trim();
            if (!cleanContent) return null;

            return (
                <div className="prose-content">
                    {parse(cleanContent, {
                        replace: (domNode) => {
                            if (domNode instanceof Element) {
                                if (domNode.tagName === 'div') {
                                    const classNames = domNode.attribs?.class || '';
                                    if (classNames.includes('image-controls') || 
                                        classNames.includes('image-buttons') ||
                                        classNames.includes('fullscreen') ||
                                        classNames.includes('enlarge')) {
                                        return <></>;
                                    }
                                }
                                
                                if (domNode.tagName === 'button') {
                                    const classNames = domNode.attribs?.class || '';
                                    const title = domNode.attribs?.title || '';
                                    const ariaLabel = domNode.attribs?.['aria-label'] || '';
                                    
                                    if (classNames.includes('fullscreen') || 
                                        classNames.includes('enlarge') || 
                                        classNames.includes('refresh') ||
                                        classNames.includes('zoom') ||
                                        classNames.includes('expand') ||
                                        classNames.includes('maximize') ||
                                        title.toLowerCase().includes('fullscreen') ||
                                        title.toLowerCase().includes('enlarge') ||
                                        title.toLowerCase().includes('refresh') ||
                                        title.toLowerCase().includes('expand') ||
                                        title.toLowerCase().includes('maximize') ||
                                        ariaLabel.toLowerCase().includes('fullscreen') ||
                                        ariaLabel.toLowerCase().includes('enlarge') ||
                                        ariaLabel.toLowerCase().includes('refresh') ||
                                        ariaLabel.toLowerCase().includes('expand') ||
                                        ariaLabel.toLowerCase().includes('maximize')) {
                                        return <></>;
                                    }
                                }
                                
                                if (domNode.tagName === 'svg') {
                                    const classNames = domNode.attribs?.class || '';
                                    const viewBox = domNode.attribs?.viewBox || '';
                                    
                                    if (classNames.includes('refresh') ||
                                        classNames.includes('fullscreen') ||
                                        classNames.includes('expand') ||
                                        classNames.includes('maximize') ||
                                        viewBox.includes('24 24')) {
                                        return <></>;
                                    }
                                }
                            }
                        }
                    })}
                </div>
            );
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-50 dark:bg-dark-900">
                <StatusBar health={health} />
                <div className="flex items-center justify-center py-20">
                    <div className="text-center">
                        <LoadingSpinner size="lg" />
                        <p className="mt-4 text-gray-600 dark:text-gray-300">Loading article...</p>
                    </div>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-screen bg-gray-50 dark:bg-dark-900">
                <StatusBar health={health} />
                <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
                    <div className="text-center">
                        <div className="relative inline-block mb-8">
                            <div className="w-24 h-24 bg-gradient-to-br from-red-100 to-red-200 dark:from-red-900/30 dark:to-red-800/30 rounded-2xl flex items-center justify-center">
                                <AlertCircle className="w-12 h-12 text-red-500" />
                            </div>
                            <div className="absolute -top-2 -right-2 w-8 h-8 bg-red-500 rounded-full flex items-center justify-center">
                                <ExternalLink className="w-4 h-4 text-white" />
                            </div>
                        </div>
                        
                        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
                            {error === 'Post not found' ? 'Article Not Found' : 'Something went wrong'}
                        </h1>
                        <p className="text-gray-600 dark:text-gray-300 mb-8 text-lg">
                            {error === 'Post not found'
                                ? "The article you're looking for doesn't exist or has been moved."
                                : error
                            }
                        </p>
                        <div className="flex gap-4 justify-center">
                            <button
                                onClick={() => navigate('/blog')}
                                className="px-8 py-3 bg-[#ef4444] text-white rounded-xl hover:bg-[#dc2626] transition-colors font-semibold"
                            >
                                Back to Blog
                            </button>
                            {error !== 'Post not found' && (
                                <button
                                    onClick={fetchPost}
                                    className="flex items-center gap-2 px-8 py-3 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors font-semibold"
                                >
                                    <RefreshCw className="w-4 h-4" />
                                    Try Again
                                </button>
                            )}
                        </div>
                    </div>
                </div>
                <Footer />
            </div>
        );
    }

    if (!post) return null;

    const readTime = post.readTime || calculateReadTime(post.content || '');
    const formattedDate = formatBlogDate(post.publishedAt || '');
    const seoImage = getBlogPostImageUrl(post);

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-dark-900">
            {/* SEO Meta Tags */}
            <SEO
                title={post.title}
                description={post.excerpt || post.subtitle || ''}
                image={seoImage}
                url={`/blog/${post.slug}`}
                type="article"
                publishedTime={post.publishedAt}
                modifiedTime={post.updatedAt}
                author={post.author}
                tags={post.tags}
            />

            <StatusBar health={health} />

            {/* Article */}
            <article className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
                {/* Simple Back Button */}
                <div className="mb-8">
                    <Link
                        to="/blog"
                        className="inline-flex items-center gap-2 text-gray-600 dark:text-gray-300 hover:text-[#ef4444] dark:hover:text-[#ef4444] transition-colors group"
                    >
                        <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform duration-200" />
                        Back to Blog
                    </Link>
                </div>

                {/* Header */}
                <header className="mb-12">
                    {/* Tags */}
                    {post.tags && post.tags.length > 0 && (
                        <div className="flex flex-wrap gap-3 mb-8">
                            {post.tags.map((tag) => (
                                <Link
                                    key={tag}
                                    to={`/blog?tag=${encodeURIComponent(tag)}`}
                                    className="group inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-gradient-to-r from-[#ef4444]/10 to-[#dc2626]/10 dark:from-[#ef4444]/20 dark:to-[#dc2626]/20 text-[#ef4444] dark:text-[#ef4444] rounded-full border border-[#ef4444]/20 dark:border-[#ef4444]/30 hover:from-[#ef4444]/20 hover:to-[#dc2626]/20 dark:hover:from-[#ef4444]/30 dark:hover:to-[#dc2626]/30 transition-all duration-200 transform hover:scale-105"
                                >
                                    <Tag className="w-3 h-3" />
                                    {tag}
                                </Link>
                            ))}
                        </div>
                    )}

                    {/* Title */}
                    <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-gray-900 dark:text-white mb-6 leading-tight">
                        {post.title}
                    </h1>

                    {/* Subtitle */}
                    {post.subtitle && post.subtitle.trim() && (
                        <p className="text-xl md:text-2xl text-gray-600 dark:text-gray-300 mb-8 leading-relaxed font-light">
                            {post.subtitle}
                        </p>
                    )}

                    {/* Meta Info Card */}
                    <div className="bg-card border border-border rounded-2xl p-6 mb-8">
                        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
                            {/* Left side - Meta info */}
                            <div className="flex flex-wrap items-center gap-6 text-sm text-muted-foreground">
                                <div className="flex items-center gap-2">
                                    <div className="w-8 h-8 bg-[#ef4444]/10 rounded-lg flex items-center justify-center">
                                        <Calendar className="w-4 h-4 text-[#ef4444]" />
                                    </div>
                                    <span className="font-medium">{formattedDate}</span>
                                </div>
                                
                                <div className="flex items-center gap-2">
                                    <div className="w-8 h-8 bg-[#ef4444]/10 rounded-lg flex items-center justify-center">
                                        <Clock className="w-4 h-4 text-[#ef4444]" />
                                    </div>
                                    <span className="font-medium">{readTime} min read</span>
                                </div>
                                
                                {post.views && (
                                    <div className="flex items-center gap-2">
                                        <div className="w-8 h-8 bg-[#ef4444]/10 rounded-lg flex items-center justify-center">
                                            <Eye className="w-4 h-4 text-[#ef4444]" />
                                        </div>
                                        <span className="font-medium">{post.views.toLocaleString()} views</span>
                                    </div>
                                )}
                                
                                {post.author && (
                                    <div className="flex items-center gap-2">
                                        <span className="text-muted-foreground">By</span>
                                        <AuthorCard 
                                            authorName={post.author}
                                            authorProfiles={post.authorProfiles}
                                            className="font-medium hover:text-[#ef4444] transition-colors"
                                        />
                                    </div>
                                )}
                            </div>
                            
                            {/* Right side - Actions */}
                            <div className="flex items-center gap-3">
                                <button
                                    onClick={() => sharePost('twitter')}
                                    className="group flex items-center gap-2 px-4 py-2 text-sm font-medium text-[#ef4444] bg-[#ef4444]/10 hover:bg-[#ef4444]/20 border border-[#ef4444]/20 rounded-lg transition-all duration-200 transform hover:scale-105"
                                >
                                    <XIcon className="w-4 h-4 group-hover:rotate-12 transition-transform duration-200" />
                                    Share
                                </button>
                            </div>
                        </div>
                    </div>
                </header>

                {/* Featured Image */}
                {post.imageUrl && (
                    <div className="relative mb-12 rounded-2xl overflow-hidden group">
                        <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                        <img
                            src={post.imageUrl}
                            alt={post.title}
                            className="w-full h-auto max-h-[500px] object-cover group-hover:scale-105 transition-transform duration-700"
                        />
                    </div>
                )}

                {/* Content */}
                <div className="prose prose-lg max-w-none dark:prose-invert bg-transparent">
                    <div className="bg-white dark:bg-dark-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-8 lg:p-12 shadow-lg">
                        {post.mainContent ? (
                            renderMainContent(post.mainContent)
                        ) : post.content ? (
                            renderMainContent(post.content)
                        ) : (
                            <div className="text-center py-12">
                                <AlertCircle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                                <p className="text-gray-500 dark:text-gray-400 italic text-lg">No content available.</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Original Source Link */}
                {post.sourceUrl && (
                    <div className="mt-8 p-6 bg-gradient-to-r from-[#ef4444]/10 to-[#dc2626]/10 dark:from-[#ef4444]/20 dark:to-[#dc2626]/20 border border-[#ef4444]/20 dark:border-[#ef4444]/30 rounded-2xl">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-[#ef4444] rounded-lg flex items-center justify-center">
                                <ExternalLink className="w-5 h-5 text-white" />
                            </div>
                            <div>
                                <p className="text-sm font-semibold text-[#ef4444] dark:text-[#ef4444] mb-1">
                                    Originally Published
                                </p>
                                <a
                                    href={post.sourceUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-2 text-[#ef4444] dark:text-[#ef4444] hover:text-[#dc2626] dark:hover:text-[#dc2626] font-medium transition-colors group"
                                >
                                    View on Substack
                                    <ExternalLink className="w-4 h-4 group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform duration-200" />
                                </a>
                            </div>
                        </div>
                    </div>
                )}
            </article>

            {/* Newsletter and Related Articles Section */}
            <div className="bg-white dark:bg-dark-800 border-t border-gray-200 dark:border-gray-700">
                <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
                    {/* Newsletter Subscription */}
                    <div className="mb-16">
                        <NewsletterSubscription />
                    </div>
                    
                    {/* Related Articles */}
                    <div>
                        <RelatedArticles currentPostSlug={post.slug} limit={2} />
                    </div>
                </div>
            </div>

            <Footer />
        </div>
    );
}