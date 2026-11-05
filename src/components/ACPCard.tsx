import ReactMarkdown from 'react-markdown';
import { Users, BookOpen } from 'lucide-react';
import type { EnhancedACP } from '../types';
import { AcpStatus, ComplexityDots } from './acp/AcpStatus';

interface EnhancedACPCardProps {
  acp: EnhancedACP;
  onClick: (acp: EnhancedACP) => void;
}

const EnhancedACPCard = ({ acp, onClick }: EnhancedACPCardProps) => (
  <div
    role="link"
    tabIndex={0}
    onClick={() => onClick(acp)}
    onKeyDown={(e) => { if (e.key === 'Enter') onClick(acp); }}
    className="cursor-pointer h-full w-full text-left flex flex-col rounded-md border border-border bg-card p-5 transition-colors hover:border-foreground/25 hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/30"
  >
    <div className="flex-1">
      <div className="flex items-center justify-between gap-3 mb-3">
        <span className="num text-[13px] text-muted-foreground">ACP-{acp.number}</span>
        <AcpStatus status={acp.status} />
      </div>
      <h3 className="text-[16px] font-semibold text-foreground mb-2 leading-snug">
        <ReactMarkdown disallowedElements={['p', 'a']} unwrapDisallowed>{acp.title}</ReactMarkdown>
      </h3>
      <div className="text-[13px] text-muted-foreground mb-4 line-clamp-4 leading-relaxed">
        {/* The whole card is the link, so links in the abstract are unwrapped. */}
        <ReactMarkdown disallowedElements={['a']} unwrapDisallowed>{acp.abstract}</ReactMarkdown>
      </div>
    </div>

    <div className="pt-3 border-t border-border space-y-2.5 text-[11px] text-muted-foreground">
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5">
          <Users className="w-3.5 h-3.5" />
          {acp.authors?.length || 0} {acp.authors?.length === 1 ? 'author' : 'authors'}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <BookOpen className="w-3.5 h-3.5" />
          {acp.readingTime} min read
        </span>
      </div>
      <div className="flex items-center justify-between gap-3">
        <span className="truncate">{[(acp.track || '').replace(' Track', ''), acp.category].filter(Boolean).join(', ')}</span>
        <ComplexityDots level={acp.complexity} />
      </div>
    </div>
  </div>
);

export default EnhancedACPCard;
