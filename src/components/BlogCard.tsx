import React from 'react';
import { Link } from 'react-router-dom';
import { Calendar, Clock, Tag, ArrowRight } from 'lucide-react';
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
            className={`group block bg-white dark:bg-dark-800 rounded-2xl shadow-lg hover:shadow-2xl transition-all duration-500 overflow-hidden border border-gray-200 dark:border-dark-700 hover:border-blue-300 dark:hover:border-blue-600 transform hover:-translate-y-2 hover:scale-[1.02] ${featured ? 'md:col-span-2 lg:col-span-3' : ''
                }`}
        >
            {/* Image */}
            {post.imageUrl && (
                <div className={`relative overflow-hidden ${featured ? 'h-72 md:h-96' : 'h-56'}`}>
                    <img
                        src={post.imageUrl}
                        alt={post.title}
                        className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                    
                    {/* Reading time overlay */}
                    <div className="absolute top-4 right-4 px-3 py-1 bg-black/60 backdrop-blur-sm text-white text-xs font-medium rounded-full flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {readTime} min read
                    </div>
                </div>
            )}

            {/* Content */}
            <div className={`p-6 ${featured ? 'md:p-10' : 'p-8'}`}>
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
                <h3 className={`font-bold text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors mb-3 line-clamp-2 ${featured ? 'text-2xl md:text-3xl' : 'text-xl'
                    }`}>
                    {post.title}
                </h3>

                {/* Excerpt */}
                <p className={`text-gray-600 dark:text-gray-300 mb-6 line-clamp-3 leading-relaxed ${featured ? 'text-lg md:text-xl' : 'text-base'
                    }`}>
                    {post.excerpt}
                </p>

                {/* Meta */}
                <div className="flex items-center justify-between text-sm text-gray-500 dark:text-gray-400 mb-4">
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                            <Calendar className="w-4 h-4" />
                            <span>{formattedDate}</span>
                        </div>
                        {!post.imageUrl && (
                            <div className="flex items-center gap-2">
                                <Clock className="w-4 h-4" />
                                <span>{readTime} min read</span>
                            </div>
                        )}
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
                <div className="flex items-center text-blue-600 dark:text-blue-400 font-semibold group-hover:gap-3 transition-all duration-300">
                    <span className={featured ? 'text-base' : 'text-sm'}>Read full article</span>
                    <ArrowRight className="w-4 h-4 transform group-hover:translate-x-2 transition-transform duration-300" />
                </div>
            </div>
        </Link>
    );
}