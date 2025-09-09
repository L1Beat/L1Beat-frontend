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
  authorName: string;
  authorProfiles?: AuthorProfile[];
  className?: string;
}

export function AuthorCard({ 
  authorName, 
  authorProfiles = [],
  className = ""
}: AuthorCardProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const triggerRef = useRef<HTMLSpanElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  // Find the primary author profile
  const primaryAuthor = authorProfiles.find(profile => 
    profile.name.toLowerCase() === authorName.toLowerCase()
  ) || authorProfiles[0];

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

  // Default author info when no profile is available
  const defaultAuthor: AuthorProfile = {
    name: authorName,
    slug: authorName.toLowerCase().replace(/\s+/g, '-'),
    bio: `Writer at L1Beat, contributing insights on Avalanche L1s and blockchain analytics.`,
    role: 'Contributor',
    postCount: 0,
  };

  const displayAuthor = primaryAuthor || defaultAuthor;

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

  const AuthorTrigger = () => (
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
      <span className="font-medium transition-all duration-300 group-hover:tracking-wide">{displayAuthor.name}</span>
    </span>
  );

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
      {/* Header */}
      <div className="flex items-start gap-4 mb-4">
        <div className="flex-shrink-0 group">
          {displayAuthor.avatar ? (
            <img
              src={displayAuthor.avatar}
              alt={displayAuthor.name}
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
            {displayAuthor.name}
          </h3>
          {displayAuthor.role && (
            <p className="text-sm text-blue-600 dark:text-blue-400 font-medium transition-all duration-300 hover:scale-105 hover:text-blue-700 dark:hover:text-blue-300">
              {displayAuthor.role}
            </p>
          )}
        </div>
      </div>

      {/* Bio */}
      {displayAuthor.bio && (
        <p className="text-gray-600 dark:text-gray-300 text-sm leading-relaxed mb-4 line-clamp-3 transition-colors duration-300 hover:text-gray-700 dark:hover:text-gray-200">
          {displayAuthor.bio}
        </p>
      )}

      {/* Stats */}
      <div className="flex items-center gap-6 mb-4 text-sm text-gray-500 dark:text-gray-400">
        {displayAuthor.postCount !== undefined && (
          <div className="flex items-center gap-1 group transition-all duration-300 hover:text-blue-600 dark:hover:text-blue-400">
            <Users className="w-4 h-4 transition-transform duration-300 group-hover:scale-110" />
            <span>{displayAuthor.postCount} {displayAuthor.postCount === 1 ? 'post' : 'posts'}</span>
          </div>
        )}
        {displayAuthor.joinDate && (
          <div className="flex items-center gap-1 group transition-all duration-300 hover:text-blue-600 dark:hover:text-blue-400">
            <Calendar className="w-4 h-4 transition-transform duration-300 group-hover:scale-110" />
            <span>Since {formatJoinDate(displayAuthor.joinDate)}</span>
          </div>
        )}
      </div>

      {/* Social Links */}
      {displayAuthor.socialLinks && (
        <div className="flex items-center gap-3 pt-4 border-t border-gray-100 dark:border-gray-700 transition-colors duration-300 hover:border-blue-200 dark:hover:border-blue-700">
          {displayAuthor.socialLinks.website && (
            <a
              href={displayAuthor.socialLinks.website}
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-all duration-300 transform hover:scale-110 hover:rotate-12"
              title="Website"
            >
              <Globe className="w-4 h-4" />
            </a>
          )}
          {displayAuthor.socialLinks.twitter && (
            <a
              href={displayAuthor.socialLinks.twitter}
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 rounded-lg text-gray-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-all duration-300 transform hover:scale-110 hover:rotate-12"
              title="Twitter"
            >
              <Twitter className="w-4 h-4" />
            </a>
          )}
          {displayAuthor.socialLinks.linkedin && (
            <a
              href={displayAuthor.socialLinks.linkedin}
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-all duration-300 transform hover:scale-110 hover:rotate-12"
              title="LinkedIn"
            >
              <Linkedin className="w-4 h-4" />
            </a>
          )}
          {displayAuthor.socialLinks.github && (
            <a
              href={displayAuthor.socialLinks.github}
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 rounded-lg text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700 transition-all duration-300 transform hover:scale-110 hover:rotate-12"
              title="GitHub"
            >
              <Github className="w-4 h-4" />
            </a>
          )}
          {displayAuthor.socialLinks.substack && (
            <a
              href={displayAuthor.socialLinks.substack}
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
    </div>
  );

  return (
    <>
      <AuthorTrigger />
      <AuthorModal />
    </>
  );
}