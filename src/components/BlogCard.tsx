import React from 'react';
import { Link } from 'react-router-dom';
import { Calendar, Clock, Tag } from 'lucide-react';
import { BlogPost, formatBlogDate, calculateReadTime } from '../api/blogApi';
import { AuthorCard } from './AuthorCard';

interface BlogCardProps {
    post: BlogPost; 
    featured?: boolean;
}

export function BlogCard({ post, featured = false }: BlogCardProps) {
    const readTime = post.readTime || calculateReadTime(post.content || '');
    const formattedDate = formatBlogDate(post.publishedAt || '');

    return (
        <Link
            to={`/blog/${post.slug}`}
            className={`group block bg-white dark:bg-dark-800 rounded-xl shadow-md hover:shadow-lg transition-all duration-300 overflow-hidden border border-gray-200 dark:border-dark-700 hover:border-blue-300 dark:hover:border-blue-600 ${featured ? 'md:col-span-2 lg:col-span-3' : ''
                }`}
        >
            {/* Image */}
            {post.imageUrl && (
                <div className={`relative overflow-hidden ${featured ? 'h-64 md:h-80' : 'h-48'}`}>
                    <img
                        src={post.imageUrl}
                        alt={post.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                </div>
            )}

            {/* Content */}
            <div className={`p-6 ${featured ? 'md:p-8' : ''}`}>
                {/* Tags */}
                {post.tags && post.tags.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-3">
                        {post.tags.slice(0, 3).map((tag) => (
                            <span
                                key={tag}
                                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-blue-100 dark:bg-blue-500/20 text-blue-800 dark:text-blue-300 rounded-full"
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
                <h3 className={`font-bold text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors mb-3 line-clamp-2 ${featured ? 'text-2xl md:text-3xl' : 'text-xl'
                    }`}>
                    {post.title}
                </h3>

                {/* Excerpt */}
                <p className={`text-gray-600 dark:text-gray-300 mb-4 line-clamp-3 ${featured ? 'text-base md:text-lg' : 'text-sm'
                    }`}>
                    {post.excerpt}
                </p>

                {/* Meta */}
                <div className="flex items-center justify-between text-sm text-gray-500 dark:text-gray-400">
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-1.5">
                            <Calendar className="w-4 h-4" />
                            <span>{formattedDate}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
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

                {/* Read more indicator */}
                <div className="mt-4 flex items-center text-blue-600 dark:text-blue-400 font-medium text-sm group-hover:gap-2 transition-all duration-200">
                    <span>Read more</span>
                    <span className="transform group-hover:translate-x-1 transition-transform duration-200">→</span>
                </div>
            </div>
        </Link>
    );
}