import React from 'react';
import { Helmet } from 'react-helmet-async';

interface SEOProps {
    title: string;
    description: string;
    image?: string;
    url?: string;
    type?: 'website' | 'article';
    publishedTime?: string;
    modifiedTime?: string;
    author?: string;
    tags?: string[];
}

export function SEO({
    title,
    description,
    image,
    url,
    type = 'website',
    publishedTime,
    modifiedTime,
    author,
    tags = [],
}: SEOProps) {
    const siteUrl = 'https://l1beat.io';
    const fullUrl = url ? (url.startsWith('http') ? url : `${siteUrl}${url}`) : siteUrl;
    const fullTitle = `${title} | L1Beat`;

    // Use a default image if none provided
    const ogImage = image 
        ? (image.startsWith('http') ? image : `${siteUrl}${image}`)
        : `${siteUrl}/og-default.png`;

    return (
        <Helmet>
            {/* Basic Meta Tags */}
            <title>{fullTitle}</title>
            <meta name="description" content={description} />

            {/* Open Graph / Facebook */}
            <meta property="og:type" content={type} />
            <meta property="og:url" content={fullUrl} />
            <meta property="og:title" content={fullTitle} />
            <meta property="og:description" content={description} />
            <meta property="og:image" content={ogImage} />
            <meta property="og:site_name" content="L1Beat" />

            {/* Twitter Card */}
            <meta name="twitter:card" content="summary_large_image" />
            <meta name="twitter:url" content={fullUrl} />
            <meta name="twitter:title" content={fullTitle} />
            <meta name="twitter:description" content={description} />
            <meta name="twitter:image" content={ogImage} />
            {/* Add your Twitter handle if you have one */}
            {/* <meta name="twitter:site" content="@yourtwitterhandle" /> */}

            {/* Article specific tags */}
            {type === 'article' && (
                <>
                    {publishedTime && (
                        <meta property="article:published_time" content={publishedTime} />
                    )}
                    {modifiedTime && (
                        <meta property="article:modified_time" content={modifiedTime} />
                    )}
                    {author && (
                        <meta property="article:author" content={author} />
                    )}
                    {tags.map((tag) => (
                        <meta key={tag} property="article:tag" content={tag} />
                    ))}
                </>
            )}

            {/* Telegram specific (uses OG tags but also supports tg:image) */}
            <meta property="tg:image" content={ogImage} />

            {/* Canonical URL */}
            <link rel="canonical" href={fullUrl} />
        </Helmet>
    );
}
