import React from 'react';
import { Link } from 'react-router-dom';
import { Calendar, Clock, Tag, ArrowRight } from 'lucide-react';
import { motion } from 'framer-motion';
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

    // Determine the list of authors to display
    let authorsList: string[] = [];
    if (post.authors && post.authors.length > 0) {
        authorsList = post.authors;
    } else if (post.authorProfiles && post.authorProfiles.length > 0) {
        authorsList = post.authorProfiles.map(p => p.name);
    } else if (post.author) {
        authorsList = [post.author];
    }

    if (featured) {
        return (
            <motion.div
                whileHover={{
                    y: -4,
                    boxShadow: "0 20px 40px -12px rgb(0 0 0 / 0.15)"
                }}
                transition={{ duration: 0.3, ease: "easeOut" }}
                className="group block bg-white dark:bg-dark-800 rounded-2xl shadow-lg border border-gray-200 dark:border-dark-700 overflow-hidden"
            >
                <Link to={`/blog/${post.slug}`} className="block">
                    <div className="flex flex-col lg:flex-row">
                        {/* Left Column: Text Block - Determines height */}
                        <div className="w-full lg:w-[35%] p-6 lg:p-8 flex flex-col justify-center">
                            <div className="space-y-4">
                                {/* Pill-shaped tag at the top */}
                                {post.tags && post.tags.length > 0 && (
                                    <div className="inline-flex">
                                        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-[#ef4444]/10 dark:bg-[#ef4444]/20 text-[#ef4444] dark:text-[#ef4444] rounded-full">
                                            <Tag className="w-3 h-3" />
                                            {post.tags[0]}
                                        </span>
                                    </div>
                                )}

                                {/* Date line */}
                                <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
                                    <Calendar className="w-4 h-4" />
                                    <span className="text-sm">{formattedDate}</span>
                                </div>

                                {/* Large multi-line headline */}
                                <h2 className="text-xl lg:text-2xl xl:text-3xl font-bold text-gray-900 dark:text-white leading-tight break-words group-hover:text-[#ef4444] transition-colors duration-300">
                                    {post.title}
                                </h2>

                                {/* Rectangular paragraph */}
                                <p className="text-sm lg:text-base text-gray-600 dark:text-gray-300 leading-relaxed line-clamp-4">
                                    {post.excerpt}
                                </p>

                                {/* Avatar circle + author names at bottom */}
                                {authorsList.length > 0 && (
                                    <div className="flex items-center gap-3 pt-2">
                                        {/* Show stacked avatars for multiple authors */}
                                        <div className="flex -space-x-2">
                                            {authorsList.slice(0, 3).map((authorName, index) => {
                                                const profile = post.authorProfiles?.find(p => 
                                                    p.name.toLowerCase() === authorName.toLowerCase()
                                                );
                                                return profile?.avatar ? (
                                            <img
                                                        key={authorName}
                                                        src={profile.avatar}
                                                        alt={authorName}
                                                        className="w-8 h-8 rounded-full object-cover border-2 border-white dark:border-dark-800"
                                                        style={{ zIndex: authorsList.length - index }}
                                            />
                                                ) : (
                                                    <div
                                                        key={authorName}
                                                        className="w-8 h-8 bg-gray-200 dark:bg-gray-700 rounded-full flex items-center justify-center border-2 border-white dark:border-dark-800"
                                                        style={{ zIndex: authorsList.length - index }}
                                                    >
                                            <span className="text-sm font-medium text-gray-600 dark:text-gray-300">
                                                            {authorName.charAt(0).toUpperCase()}
                                            </span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                        <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
                                            {authorsList.length === 1 
                                                ? authorsList[0] 
                                                : authorsList.length === 2 
                                                    ? `${authorsList[0]} & ${authorsList[1]}`
                                                    : `${authorsList[0]} & ${authorsList.length - 1} more`
                                            }
                                        </span>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Right Column: Image Block - Adjusts to left column height */}
                        <div className="w-full lg:w-[65%] p-6 lg:p-8 flex flex-col justify-center">
                            <div className="flex-1 flex items-center justify-center bg-gray-100 dark:bg-gray-800 rounded-lg relative overflow-hidden">
                                <motion.img
                                    src={imageUrl}
                                    alt={post.title}
                                    className="max-w-full max-h-full object-contain"
                                    whileHover={{ scale: 1.02 }}
                                    transition={{ duration: 0.4, ease: "easeOut" }}
                                />
                            </div>
                        </div>
                    </div>
                </Link>
            </motion.div>
        );
    }

    return (
        <Link
            to={`/blog/${post.slug}`}
            className="group flex flex-col bg-white dark:bg-dark-800 rounded-2xl shadow-lg hover:shadow-2xl transition-all duration-500 overflow-hidden border border-gray-200 dark:border-dark-700 hover:border-[#ef4444]/50 dark:hover:border-[#ef4444]/50 transform hover:-translate-y-2 hover:scale-[1.02]"
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
            <div className="p-6 flex-grow flex flex-col">
                {/* Title */}
                <h3 className="text-xl font-bold text-gray-900 dark:text-white group-hover:text-[#ef4444] dark:group-hover:text-[#ef4444] transition-colors mb-3 line-clamp-2 h-[3.5rem]">
                    {post.title}
                </h3>

                {/* Meta */}
                <div className="flex items-center justify-between text-sm text-gray-500 dark:text-gray-400">
                    <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4" />
                        <span>{formattedDate}</span>
                    </div>

                    {authorsList.length > 0 && (
                        <div className="flex items-center gap-1.5">
                            {/* Show first author with profile */}
                            {(() => {
                                const firstAuthor = authorsList[0];
                                const profile = post.authorProfiles?.find(p => 
                                    p.name.toLowerCase() === firstAuthor.toLowerCase()
                                );
                                return (
                            <AuthorCard
                                        authorName={firstAuthor}
                                        authorProfiles={profile ? [profile] : []}
                                className="font-medium text-gray-700 dark:text-gray-300"
                            />
                                );
                            })()}
                            {/* Show "+N more" for additional authors */}
                            {authorsList.length > 1 && (
                                <span className="text-xs text-gray-500 dark:text-gray-400">
                                    +{authorsList.length - 1} more
                                </span>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </Link>
    );
}