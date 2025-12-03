import React, { useState, useRef, useEffect } from 'react';
import { User, Calendar, ExternalLink, Twitter, Linkedin, Globe, Github, Users, X, Mail } from 'lucide-react';

export interface AuthorProfile {
  name: string;
  slug: string;
  bio?: string;
  avatar?: string;
  role?: string;
  socialLinks?: {
    twitter?: string;
    linkedin?: string;
    website?: string;
    github?: string;
    substack?: string;
  };
  postCount?: number;
  joinDate?: string;
  isActive?: boolean;
}

interface AuthorCardProps {
  authorName?: string;
  authorNames?: string[];
  authorProfiles?: AuthorProfile[];
  className?: string;
  displayMode?: 'inline' | 'compact';
  showAvatars?: boolean;
  maxAuthorsInline?: number;
}

export function AuthorCard({
  authorName,
  authorNames,
  authorProfiles = [],
  className = "",
  displayMode = 'inline',
  showAvatars = false,
  maxAuthorsInline = 3
}: AuthorCardProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const triggerRef = useRef<HTMLSpanElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  // Determine which authors to display
  const displayAuthors = React.useMemo(() => {
    if (authorNames && authorNames.length > 0) {
      return authorNames;
    }
    if (authorName) {
      return [authorName];
    }
    return ['L1Beat'];
  }, [authorName, authorNames]);

  // Find profiles for all authors
  const authorProfiles_ = displayAuthors.map(name =>
    authorProfiles.find(p =>
      p.name.toLowerCase() === name.toLowerCase()
    )
  ).filter(Boolean) as AuthorProfile[];

  // For trigger display, use first author as primary
  const primaryAuthor = authorProfiles_.length > 0 ? authorProfiles_[0] : undefined;

  const openModal = () => {
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
  };

  // Close modal on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeModal();
      }
    };

    if (isModalOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden'; // Prevent background scroll
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [isModalOpen]);

  // Create default author profiles for authors without data
  const getAuthorProfile = (name: string): AuthorProfile => {
    const profile = authorProfiles.find(p =>
      p.name.toLowerCase() === name.toLowerCase()
    );
    if (profile) return profile;

    return {
      name: name,
      slug: name.toLowerCase().replace(/\s+/g, '-'),
      bio: `Writer at L1Beat, contributing insights on Avalanche L1s and blockchain analytics.`,
      role: 'Contributor',
      postCount: 0,
    };
  };

  const displayAuthor = primaryAuthor || getAuthorProfile(displayAuthors[0]);

  const formatJoinDate = (dateString?: string) => {
    if (!dateString) return null;
    try {
      return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long'
      });
    } catch {
      return null;
    }
  };

  const AuthorTrigger = () => {
    // Format author names for display
    const authorNames = displayAuthors.length > 1
      ? displayAuthors.slice(0, 2).join(' and ') + (displayAuthors.length > 2 ? ` +${displayAuthors.length - 2}` : '')
      : displayAuthor.name;

    return (
      <span
        ref={triggerRef}
        onClick={openModal}
        className={`group inline-flex items-center gap-1 hover:text-blue-600 dark:hover:text-blue-400 transition-all duration-300 cursor-pointer transform hover:scale-105 ${className}`}
      >
        {displayAuthor.avatar ? (
          <img
            src={displayAuthor.avatar}
            alt={displayAuthor.name}
            className="w-4 h-4 rounded-full transition-transform duration-300 group-hover:scale-110 group-hover:shadow-lg"
          />
        ) : (
          <User className="w-4 h-4 transition-all duration-300 group-hover:scale-110 group-hover:rotate-12" />
        )}
        <span className="font-medium transition-all duration-300 group-hover:tracking-wide">{authorNames}</span>
      </span>
    );
  };

  const AuthorModal = () => (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 transition-all duration-300 ${
        isModalOpen ? 'opacity-100 visible' : 'opacity-0 invisible'
      }`}
      onClick={closeModal}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      
      {/* Modal Content */}
      <div
        ref={modalRef}
        onClick={(e) => e.stopPropagation()}
        className={`relative w-full max-w-md bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-2xl p-6 transform transition-all duration-300 ease-out animate-float ${
          isModalOpen ? 'scale-100 translate-y-0' : 'scale-95 translate-y-4'
        }`}
      >
        {/* Close Button */}
        <button
          onClick={closeModal}
          className="absolute top-4 right-4 p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-all duration-200"
        >
          <X className="w-4 h-4" />
        </button>
      {/* Modal Content - Support for single or multiple authors */}
      <div className="max-h-[600px] overflow-y-auto space-y-6">
        {displayAuthors.map((authorName, index) => {
          const profile = getAuthorProfile(authorName);
          return (
            <div key={index} className={index > 0 ? 'border-t border-gray-200 dark:border-gray-700 pt-6' : ''}>
              {/* Header */}
              <div className="flex items-start gap-4 mb-4">
                <div className="flex-shrink-0 group">
                  {profile.avatar ? (
                    <img
                      src={profile.avatar}
                      alt={profile.name}
                      className="w-12 h-12 rounded-full border-2 border-gray-100 dark:border-gray-700 transition-all duration-300 group-hover:scale-110 group-hover:border-blue-300 dark:group-hover:border-blue-500"
                    />
                  ) : (
                    <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center transition-all duration-300 group-hover:scale-110 group-hover:shadow-lg group-hover:from-blue-600 group-hover:to-purple-700">
                      <User className="w-6 h-6 text-white transition-all duration-300 group-hover:scale-110" />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-gray-900 dark:text-white text-lg truncate transition-all duration-300 hover:text-blue-600 dark:hover:text-blue-400">
                    {profile.name}
                  </h3>
                  {profile.role && (
                    <p className="text-sm text-blue-600 dark:text-blue-400 font-medium transition-all duration-300 hover:scale-105 hover:text-blue-700 dark:hover:text-blue-300">
                      {profile.role}
                    </p>
                  )}
                </div>
              </div>

              {/* Bio */}
              {profile.bio && (
                <p className="text-gray-600 dark:text-gray-300 text-sm leading-relaxed mb-4 line-clamp-3 transition-colors duration-300 hover:text-gray-700 dark:hover:text-gray-200">
                  {profile.bio}
                </p>
              )}

              {/* Stats */}
              <div className="flex items-center gap-6 mb-4 text-sm text-gray-500 dark:text-gray-400">
                {profile.postCount !== undefined && (
                  <div className="flex items-center gap-1 group transition-all duration-300 hover:text-blue-600 dark:hover:text-blue-400">
                    <Users className="w-4 h-4 transition-transform duration-300 group-hover:scale-110" />
                    <span>{profile.postCount} {profile.postCount === 1 ? 'post' : 'posts'}</span>
                  </div>
                )}
                {profile.joinDate && (
                  <div className="flex items-center gap-1 group transition-all duration-300 hover:text-blue-600 dark:hover:text-blue-400">
                    <Calendar className="w-4 h-4 transition-transform duration-300 group-hover:scale-110" />
                    <span>Since {formatJoinDate(profile.joinDate)}</span>
                  </div>
                )}
              </div>

              {/* Social Links */}
              {profile.socialLinks && (
                <div className="flex items-center gap-3 pt-4 border-t border-gray-100 dark:border-gray-700 transition-colors duration-300 hover:border-blue-200 dark:hover:border-blue-700">
                  {profile.socialLinks.website && (
                    <a
                      href={profile.socialLinks.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-all duration-300 transform hover:scale-110 hover:rotate-12"
                      title="Website"
                    >
                      <Globe className="w-4 h-4" />
                    </a>
                  )}
                  {profile.socialLinks.twitter && (
                    <a
                      href={profile.socialLinks.twitter}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2 rounded-lg text-gray-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-all duration-300 transform hover:scale-110 hover:rotate-12"
                      title="Twitter"
                    >
                      <Twitter className="w-4 h-4" />
                    </a>
                  )}
                  {profile.socialLinks.linkedin && (
                    <a
                      href={profile.socialLinks.linkedin}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-all duration-300 transform hover:scale-110 hover:rotate-12"
                      title="LinkedIn"
                    >
                      <Linkedin className="w-4 h-4" />
                    </a>
                  )}
                  {profile.socialLinks.github && (
                    <a
                      href={profile.socialLinks.github}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2 rounded-lg text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700 transition-all duration-300 transform hover:scale-110 hover:rotate-12"
                      title="GitHub"
                    >
                      <Github className="w-4 h-4" />
                    </a>
                  )}
                  {profile.socialLinks.substack && (
                    <a
                      href={profile.socialLinks.substack}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2 rounded-lg text-gray-400 hover:text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-900/30 transition-all duration-300 transform hover:scale-110 hover:rotate-12"
                      title="Substack"
                    >
                      <Mail className="w-4 h-4" />
                    </a>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      </div>
    </div>
  );

  return (
    <>
      <AuthorTrigger />
      <AuthorModal />
    </>
  );
}