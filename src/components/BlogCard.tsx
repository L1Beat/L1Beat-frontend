import React from 'react';
import { Link } from 'react-router-dom';
import { Calendar, Clock, Tag, ArrowRight } from 'lucide-react';
import { BlogPost, formatBlogDate, calculateReadTime } from '../api/blogApi';
import { AuthorCard } from './AuthorCard';
import { getBlogPostImageUrl } from '../utils/imageExtractor';

interface BlogCardProps {
    post: BlogPost; 
    featured?: boolean;
}

export function BlogCard({ post, featured = false }: BlogCardProps) {
    const readTime = post.readTime || calculateReadTime(post.content || '');
    const formattedDate = formatBlogDate(post.publishedAt || '');
    const imageUrl = getBlogPostImageUrl(post);

    if (featured) {
        return (
            <Link
                to={`/blog/${post.slug}`}
                className="group block bg-white dark:bg-dark-800 rounded-2xl shadow-lg hover:shadow-2xl transition-all duration-500 overflow-hidden border border-gray-200 dark:border-dark-700 hover:border-blue-300 dark:hover:border-blue-600 transform hover:-translate-y-2 hover:scale-[1.02]"
            >
                <div className="flex flex-col md:flex-row h-full">
                    {/* Content Section */}
                    <div className="md:w-1/2 p-6 md:p-10 md:pr-6">
                        {/* Tags */}
                        {post.tags && post.tags.length > 0 && (
                            <div className="flex flex-wrap gap-2 mb-4">
                                {post.tags.slice(0, 3).map((tag) => (
                                    <span
                                        key={tag}
                                        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold bg-gradient-to-r from-blue-100 to-indigo-100 dark:from-blue-500/20 dark:to-indigo-500/20 text-blue-800 dark:text-blue-300 rounded-full border border-blue-200 dark:border-blue-500/30"
                                    >
                                        <Tag className="w-3 h-3" />
                                        {tag}
                                    </span>
                                ))}
                                {post.tags.length > 3 && (
                                    <span className="inline-flex items-center px-2.5 py-1 text-xs font-medium bg-gray-100 dark:bg-gray-500/20 text-gray-600 dark:text-gray-400 rounded-full">
                                        +{post.tags.length - 3} more
                                    </span>
                                )}
                            </div>
                        )}

                        {/* Title */}
                        <h3 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors mb-3 line-clamp-2">
                            {post.title}
                        </h3>

                        {/* Excerpt */}
                        <p className="text-lg md:text-xl text-gray-600 dark:text-gray-300 mb-6 line-clamp-3 leading-relaxed">
                            {post.excerpt}
                        </p>

                        {/* Meta */}
                        <div className="flex items-center justify-between text-sm text-gray-500 dark:text-gray-400 mb-4">
                            <div className="flex items-center gap-4">
                                <div className="flex items-center gap-2">
                                    <Calendar className="w-4 h-4" />
                                    <span>{formattedDate}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Clock className="w-4 h-4" />
                                    <span>{readTime} min read</span>
                                </div>
                            </div>

                            {post.author && (
                                <div className="text-right">
                                    <AuthorCard
                                        authorName={post.author}
                                        authorProfiles={post.authorProfiles}
                                        className="font-medium text-gray-700 dark:text-gray-300"
                                    />
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Image Section */}
                    <div className="md:w-1/2 md:flex-shrink-0">
                        <div className="relative h-64 md:h-full overflow-hidden md:rounded-r-2xl">
                            <img
                                src={imageUrl}
                                alt={post.title}
                                className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
                            />
                            <div className="absolute inset-0 bg-gradient-to-t md:bg-gradient-to-l from-black/20 via-transparent to-transparent opacity-0 group-hover:opacity-60 transition-opacity duration-500" />
                        </div>
                    </div>
                </div>
            </Link>
        );
    }

    return (
        <Link
            to={`/blog/${post.slug}`}
            className="group block bg-white dark:bg-dark-800 rounded-2xl shadow-lg hover:shadow-2xl transition-all duration-500 overflow-hidden border border-gray-200 dark:border-dark-700 hover:border-blue-300 dark:hover:border-blue-600 transform hover:-translate-y-2 hover:scale-[1.02]"
        >
            {/* Banner Image */}
            <div className="relative h-48 overflow-hidden">
                <img
                    src={imageUrl}
                    alt={post.title}
                    className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            </div>

            {/* Content */}
            <div className="p-6">
                {/* Title */}
                <h3 className="text-xl font-bold text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors mb-3 line-clamp-2">
                    {post.title}
                </h3>

                {/* Meta */}
                <div className="flex items-center justify-between text-sm text-gray-500 dark:text-gray-400">
                    <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4" />
                        <span>{formattedDate}</span>
                    </div>

                    {post.author && (
                        <div className="text-right">
                            <AuthorCard
                                authorName={post.author}
                                authorProfiles={post.authorProfiles}
                                className="font-medium text-gray-700 dark:text-gray-300"
                            />
                        </div>
                    )}
                </div>
            </div>
        </Link>
    );
}