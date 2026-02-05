import React, { useRef, useState, useCallback, useEffect } from 'react';
import { useTheme } from '../hooks/useTheme';

interface TimeRangeSliderProps {
  data: { date: string; value: number }[];
  startIndex: number;
  endIndex: number;
  onChange: (start: number, end: number) => void;
  color?: string;
}

export function TimeRangeSlider({
  data,
  startIndex,
  endIndex,
  onChange,
  color = '#ef4444'
}: TimeRangeSliderProps) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState<'start' | 'end' | 'range' | null>(null);
  const [dragStartX, setDragStartX] = useState(0);
  const [dragStartIndex, setDragStartIndex] = useState({ start: 0, end: 0 });

  const dataLength = data.length;
  const minRange = Math.max(2, Math.floor(dataLength * 0.05)); // Minimum 5% of data or 2 points

  // Calculate positions as percentages
  const startPercent = (startIndex / (dataLength - 1)) * 100;
  const endPercent = (endIndex / (dataLength - 1)) * 100;

  // Generate mini sparkline path
  const getSparklinePath = useCallback(() => {
    if (data.length < 2) return '';
    
    const maxValue = Math.max(...data.map(d => d.value));
    const minValue = Math.min(...data.map(d => d.value));
    const range = maxValue - minValue || 1;
    
    const points = data.map((d, i) => {
      const x = (i / (data.length - 1)) * 100;
      const y = 100 - ((d.value - minValue) / range) * 80 - 10; // 10-90% of height
      return `${x},${y}`;
    });
    
    return `M ${points.join(' L ')}`;
  }, [data]);

  // Get fill path (closed shape for area)
  const getFillPath = useCallback(() => {
    if (data.length < 2) return '';
    
    const maxValue = Math.max(...data.map(d => d.value));
    const minValue = Math.min(...data.map(d => d.value));
    const range = maxValue - minValue || 1;
    
    const points = data.map((d, i) => {
      const x = (i / (data.length - 1)) * 100;
      const y = 100 - ((d.value - minValue) / range) * 80 - 10;
      return `${x},${y}`;
    });
    
    return `M 0,100 L ${points.join(' L ')} L 100,100 Z`;
  }, [data]);

  const handleMouseDown = useCallback((e: React.MouseEvent, type: 'start' | 'end' | 'range') => {
    e.preventDefault();
    setIsDragging(type);
    setDragStartX(e.clientX);
    setDragStartIndex({ start: startIndex, end: endIndex });
  }, [startIndex, endIndex]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging || !containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const deltaX = e.clientX - dragStartX;
    const deltaPercent = (deltaX / rect.width) * 100;
    const deltaIndex = Math.round((deltaPercent / 100) * (dataLength - 1));

    let newStart = dragStartIndex.start;
    let newEnd = dragStartIndex.end;

    if (isDragging === 'start') {
      newStart = Math.max(0, Math.min(dragStartIndex.start + deltaIndex, newEnd - minRange));
    } else if (isDragging === 'end') {
      newEnd = Math.min(dataLength - 1, Math.max(dragStartIndex.end + deltaIndex, newStart + minRange));
    } else if (isDragging === 'range') {
      const rangeSize = dragStartIndex.end - dragStartIndex.start;
      newStart = dragStartIndex.start + deltaIndex;
      newEnd = dragStartIndex.end + deltaIndex;
      
      // Clamp to bounds
      if (newStart < 0) {
        newStart = 0;
        newEnd = rangeSize;
      }
      if (newEnd > dataLength - 1) {
        newEnd = dataLength - 1;
        newStart = dataLength - 1 - rangeSize;
      }
    }

    onChange(newStart, newEnd);
  }, [isDragging, dragStartX, dragStartIndex, dataLength, minRange, onChange]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(null);
  }, []);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  // Format date for display
  const formatDate = (dateStr: string) => {
    try {
      const [year, month, day] = dateStr.split('-');
      const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } catch {
      return dateStr;
    }
  };

  if (data.length < 3) return null;

  return (
    <div className="mt-4 px-2">
      {/* Date labels */}
      <div className="flex justify-between text-xs text-muted-foreground mb-1">
        <span>{formatDate(data[startIndex]?.date || '')}</span>
        <span>{formatDate(data[endIndex]?.date || '')}</span>
      </div>

      {/* Slider container */}
      <div 
        ref={containerRef}
        className="relative h-12 rounded-lg overflow-hidden select-none border-2"
        style={{ 
          backgroundColor: isDark ? 'rgba(239, 68, 68, 0.15)' : 'rgba(239, 68, 68, 0.08)',
          borderColor: color
        }}
      >
        {/* Mini chart background */}
        <svg 
          className="absolute inset-0 w-full h-full"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
        >
          {/* Fill area */}
          <path
            d={getFillPath()}
            fill="rgba(239, 68, 68, 0.3)"
          />
          {/* Line */}
          <path
            d={getSparklinePath()}
            fill="none"
            stroke="rgba(239, 68, 68, 0.8)"
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
          />
        </svg>

        {/* Dimmed areas outside selection */}
        <div
          className="absolute top-0 bottom-0 left-0"
          style={{
            width: `${startPercent}%`,
            backgroundColor: isDark ? 'rgba(30, 30, 30, 0.75)' : 'rgba(0, 0, 0, 0.06)'
          }}
        />
        <div
          className="absolute top-0 bottom-0 right-0"
          style={{
            width: `${100 - endPercent}%`,
            backgroundColor: isDark ? 'rgba(30, 30, 30, 0.75)' : 'rgba(0, 0, 0, 0.06)'
          }}
        />

        {/* Selected range highlight */}
        <div
          className="absolute top-0 bottom-0 cursor-grab active:cursor-grabbing"
          style={{ 
            left: `${startPercent}%`, 
            width: `${endPercent - startPercent}%`,
            borderTop: `2px solid ${color}`,
            borderBottom: `2px solid ${color}`,
          }}
          onMouseDown={(e) => handleMouseDown(e, 'range')}
        />

        {/* Start handle */}
        <div
          className="absolute top-0 bottom-0 w-4 cursor-ew-resize group z-10"
          style={{ left: `calc(${startPercent}% - 8px)` }}
          onMouseDown={(e) => handleMouseDown(e, 'start')}
        >
          <div 
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-10 rounded-full transition-all"
            style={{ 
              backgroundColor: color,
              opacity: isDragging === 'start' ? 1 : 0.9,
              boxShadow: isDark ? `0 0 8px ${color}50` : '0 2px 4px rgba(0,0,0,0.2)'
            }}
          />
        </div>

        {/* End handle */}
        <div
          className="absolute top-0 bottom-0 w-4 cursor-ew-resize group z-10"
          style={{ left: `calc(${endPercent}% - 8px)` }}
          onMouseDown={(e) => handleMouseDown(e, 'end')}
        >
          <div 
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-10 rounded-full transition-all"
            style={{ 
              backgroundColor: color,
              opacity: isDragging === 'end' ? 1 : 0.9,
              boxShadow: isDark ? `0 0 8px ${color}50` : '0 2px 4px rgba(0,0,0,0.2)'
            }}
          />
        </div>
      </div>

      {/* Full date range */}
      <div className="flex justify-between text-[10px] mt-1.5">
        <span className="text-muted-foreground">{formatDate(data[0]?.date || '')}</span>
        <span className="text-muted-foreground">
          Drag to select range
        </span>
        <span className="text-muted-foreground">{formatDate(data[data.length - 1]?.date || '')}</span>
      </div>
    </div>
  );
}

