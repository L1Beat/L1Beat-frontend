import React, { useState } from 'react';
import { User } from 'lucide-react';

export interface AuthorAvatarProps {
  avatarUrl?: string;
  name: string;
  size?: 'small' | 'medium' | 'large';
  className?: string;
  borderClassName?: string;
}

const sizeClasses = {
  small: 'w-8 h-8 text-xs',
  medium: 'w-12 h-12 text-sm',
  large: 'w-16 h-16 text-base',
};

const iconSizeClasses = {
  small: 'w-4 h-4',
  medium: 'w-6 h-6',
  large: 'w-8 h-8',
};

export function AuthorAvatar({
  avatarUrl,
  name,
  size = 'small',
  className = '',
  borderClassName = 'border-2 border-white dark:border-gray-900',
}: AuthorAvatarProps) {
  const [imageError, setImageError] = useState(false);
  const [imageLoading, setImageLoading] = useState(true);

  // Generate initials from name (first letter of each word, max 2)
  const getInitials = (fullName: string): string => {
    const words = fullName.trim().split(/\s+/);
    if (words.length === 0) return '?';
    if (words.length === 1) return words[0].charAt(0).toUpperCase();
    return (words[0].charAt(0) + words[words.length - 1].charAt(0)).toUpperCase();
  };

  const initials = getInitials(name);
  const shouldShowImage = avatarUrl && !imageError;

  return (
    <>
      {shouldShowImage ? (
        <div className={`relative ${sizeClasses[size]} ${className}`}>
          {imageLoading && (
            <div className={`absolute inset-0 bg-gradient-to-br from-gray-200 to-gray-300 dark:from-gray-700 dark:to-gray-600 rounded-full ${borderClassName} animate-pulse`} />
          )}
          <img
            src={avatarUrl}
            alt={name}
            className={`${sizeClasses[size]} rounded-full ${borderClassName} object-cover transition-opacity duration-300 ${
              imageLoading ? 'opacity-0' : 'opacity-100'
            }`}
            onLoad={() => setImageLoading(false)}
            onError={() => {
              setImageError(true);
              setImageLoading(false);
            }}
          />
        </div>
      ) : (
        <div
          className={`${sizeClasses[size]} bg-gradient-to-br from-blue-500 to-purple-600 rounded-full ${borderClassName} flex items-center justify-center transition-all duration-300 hover:scale-110 hover:shadow-lg hover:from-blue-600 hover:to-purple-700 ${className}`}
        >
          {initials.length <= 2 ? (
            <span className={`${sizeClasses[size].split(' ')[2]} font-semibold text-white select-none`}>
              {initials}
            </span>
          ) : (
            <User className={`${iconSizeClasses[size]} text-white`} />
          )}
        </div>
      )}
    </>
  );
}
