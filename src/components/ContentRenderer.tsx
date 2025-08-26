import React from 'react';
import ReactMarkdown from 'react-markdown';
import { Info, AlertCircle, AlertTriangle, CheckCircle } from 'lucide-react';

interface NoteBlockProps {
  type?: 'info' | 'warning' | 'error' | 'success';
  title?: string;
  children: React.ReactNode;
}

const NoteBlock: React.FC<NoteBlockProps> = ({ 
  type = 'info', 
  title: defaultTitle,
  children 
}) => {
  const styles = {
    info: {
      bg: 'bg-blue-50 dark:bg-blue-950/30',
      border: 'border-blue-500',
      icon: Info,
      iconColor: 'text-blue-500',
      titleColor: 'text-blue-700 dark:text-blue-400',
      title: 'Note'
    },
    warning: {
      bg: 'bg-yellow-50 dark:bg-yellow-950/30',
      border: 'border-yellow-500',
      icon: AlertTriangle,
      iconColor: 'text-yellow-600',
      titleColor: 'text-yellow-700 dark:text-yellow-400',
      title: 'Warning'
    },
    error: {
      bg: 'bg-red-50 dark:bg-red-950/30',
      border: 'border-red-500',
      icon: AlertCircle,
      iconColor: 'text-red-500',
      titleColor: 'text-red-700 dark:text-red-400',
      title: 'Error'
    },
    success: {
      bg: 'bg-green-50 dark:bg-green-950/30',
      border: 'border-green-500',
      icon: CheckCircle,
      iconColor: 'text-green-500',
      titleColor: 'text-green-700 dark:text-green-400',
      title: 'Success'
    }
  };

  const style = styles[type];
  const Icon = style.icon;
  const title = defaultTitle || style.title;

  return (
    <div className={`my-6 p-4 rounded-lg border-l-4 ${style.bg} ${style.border}`}>
      <div className="flex items-start gap-3">
        <div className={`mt-0.5 ${style.iconColor}`}>
          <Icon className="w-5 h-5" />
        </div>
        <div className="flex-1">
          <div className={`font-semibold mb-1 ${style.titleColor}`}>
            {title}
          </div>
          <div className="text-gray-700 dark:text-gray-300 text-sm leading-relaxed italic">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
};

interface ListItem {
  content: string;
  children?: ListItem[];
}

interface ContentBlock {
  type: string;
  content?: string;
  src?: string;
  alt?: string;
  caption?: string;
  level?: number;
  items?: (string | ListItem)[];
  ordered?: boolean;
  platform?: string;
  language?: string;
}

interface ContentRendererProps {
  blocks: ContentBlock[];
}

const ContentRenderer: React.FC<ContentRendererProps> = ({ blocks }) => {
  
  const renderListItem = (item: string | ListItem, index: number, depth: number = 0): React.ReactNode => {
    const isNested = typeof item === 'object' && item !== null;
    const content = isNested ? item.content : item;
    const children = isNested ? item.children : undefined;
    
    const depthClasses = [
      'text-gray-700 dark:text-gray-300 leading-relaxed',
      'text-gray-600 dark:text-gray-400 leading-relaxed text-[95%]',
      'text-gray-500 dark:text-gray-500 leading-relaxed text-[90%]',
    ];
    
    const currentClass = depthClasses[Math.min(depth, 2)];
    
    return (
      <li key={index} className={currentClass}>
        <ReactMarkdown>{content}</ReactMarkdown>
        {children && children.length > 0 && (
          <ul className={`mt-2 space-y-1 ${depth === 0 ? 'ml-6' : 'ml-4'}`}>
            {children.map((child, childIndex) => 
              renderListItem(child, childIndex, depth + 1)
            )}
          </ul>
        )}
      </li>
    );
  };

  const renderBlock = (block: ContentBlock, index: number) => {
    const text = block.content || '';
    const notePatterns = [
      { pattern: /^\[!(note|info)\]/i, type: 'info', title: 'Note' },
      { pattern: /^\[!warning\]/i, type: 'warning', title: 'Warning' },
      { pattern: /^\[!error\]/i, type: 'error', title: 'Error' },
      { pattern: /^\[!success\]/i, type: 'success', title: 'Success' },
      { pattern: /^note:/i, type: 'info', title: 'Note' },
    ];

    if (block.type === 'paragraph' || block.type === 'quote') {
      for (const { pattern, type, title } of notePatterns) {
        if (pattern.test(text)) {
          const content = text.replace(pattern, '').trim();
          return (
            <NoteBlock key={index} type={type as any} title={title}>
              <ReactMarkdown>{content}</ReactMarkdown>
            </NoteBlock>
          );
        }
      }
    }

    switch (block.type) {
      case 'heading':
        const HeadingTag = `h${block.level}` as keyof JSX.IntrinsicElements;
        const headingClasses = {
          1: 'text-3xl font-bold mt-12 mb-6 text-gray-900 dark:text-white',
          2: 'text-2xl font-bold mt-10 mb-5 text-gray-900 dark:text-white',
          3: 'text-xl font-semibold mt-8 mb-4 text-gray-900 dark:text-white',
          4: 'text-lg font-semibold mt-6 mb-3 text-gray-900 dark:text-white',
          5: 'text-base font-semibold mt-4 mb-2 text-gray-900 dark:text-white',
          6: 'text-sm font-semibold mt-4 mb-2 text-gray-700 dark:text-gray-300'
        };
        return (
          <HeadingTag key={index} className={headingClasses[block.level as keyof typeof headingClasses]}>
            {block.content}
          </HeadingTag>
        );

      case 'paragraph':
        return (
          <div 
            key={index}
            className="mb-6 leading-relaxed text-gray-700 dark:text-gray-300"
          >
            <ReactMarkdown>{text}</ReactMarkdown>
          </div>
        );

      case 'image':
        return (
          <figure key={index} className="my-12">
            <div className="relative group">
              <img
                src={block.src}
                alt={block.alt}
                className="w-full h-auto rounded-xl shadow-2xl transition-transform duration-300 group-hover:scale-[1.02]"
                loading="lazy"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-xl" />
            </div>
            {(block.caption || block.alt) && (
              <figcaption className="text-sm text-gray-600 dark:text-gray-400 text-center mt-4 italic max-w-2xl mx-auto">
                {block.caption || block.alt}
              </figcaption>
            )}
          </figure>
        );

      case 'list':
        const ListTag = block.ordered ? 'ol' : 'ul';
        const listClass = block.ordered ? 
          'list-decimal pl-6 my-6 space-y-3' : 
          'list-none my-6 space-y-3';
        
        return (
          <ListTag key={index} className={listClass}>
            {block.items?.map((item, i) => renderListItem(item, i, 0))}
          </ListTag>
        );

      case 'quote':
        return (
          <blockquote 
            key={index}
            className="border-l-4 border-blue-500 bg-gradient-to-r from-blue-50 to-transparent dark:from-blue-900/20 dark:to-transparent pl-8 py-6 my-8 rounded-r-lg relative"
          >
            <div className="absolute top-4 left-2 text-blue-400 text-4xl font-serif">"</div>
            <div className="text-gray-700 dark:text-gray-300 italic text-lg leading-relaxed">
              <ReactMarkdown>{block.content}</ReactMarkdown>
            </div>
          </blockquote>
        );

      case 'code':
        return (
          <div key={index} className="my-8">
            <div className="bg-gray-900 rounded-lg overflow-hidden">
              <div className="bg-gray-800 px-4 py-2 text-sm text-gray-400 border-b border-gray-700">
                <span className="flex items-center gap-2">
                  <div className="flex gap-1">
                    <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                    <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
                    <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                  </div>
                  {block.language || 'Code'}
                </span>
              </div>
              <pre className="p-4 overflow-x-auto">
                <code className="text-green-400 text-sm font-mono leading-relaxed">
                  {block.content}
                </code>
              </pre>
            </div>
          </div>
        );

      case 'video':
        if (block.platform === 'youtube') {
          return (
            <div key={index} className="my-12">
              <div className="relative aspect-video bg-gray-900 rounded-xl overflow-hidden shadow-2xl group">
                <iframe
                  src={block.src}
                  className="w-full h-full"
                  frameBorder="0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              </div>
            </div>
          );
        }
        return null;

      default:
        return null;
    }
  };

  return (
    <div className="prose prose-lg max-w-none">
      {blocks.map((block, index) => renderBlock(block, index))}
    </div>
  );
};

export default ContentRenderer;
