import { useState, useMemo } from 'react';
import { SkillActivityRow } from '@shared/schema';
import { Button } from '@/components/ui/button';

// Category colors
const categoryColors = {
  prospecting: '#1E90FF',
  followup: '#10B981', 
  consistency: '#F59E0B',
  knowledge: '#6366F1',
} as const;

interface Brick {
  id: string;
  category: string;
  action: string;
  created_at: string;
  unitXp: number;
}

interface BrickWallProps {
  events: SkillActivityRow[];
  unitXp?: number;
}

export default function BrickWall({ 
  events, 
  unitXp = 10
}: BrickWallProps) {
  const [timeWindow, setTimeWindow] = useState<'7d' | '30d' | 'all'>('30d');

  // Filter events by time window
  const filteredEvents = useMemo(() => {
    if (timeWindow === 'all') return events;
    
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - (timeWindow === '7d' ? 7 : 30));
    
    return events.filter(event => 
      event.timestamp && new Date(event.timestamp) >= cutoffDate
    );
  }, [events, timeWindow]);

  // Convert events to bricks
  const bricks = useMemo(() => {
    const brickArray: Brick[] = [];
    
    // Sort events by creation date (oldest first for foundation building)
    const sortedEvents = [...filteredEvents].sort(
      (a, b) => {
        const timeA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
        const timeB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
        return timeA - timeB;
      }
    );
    
    for (const event of sortedEvents) {
      const xpGained = event.xpGained || 0;
      const brickCount = Math.floor(xpGained / unitXp);
      
      // Create bricks for this event
      for (let i = 0; i < brickCount; i++) {
        brickArray.push({
          id: `${event.id}-brick-${i}`,
          category: mapSkillTypeToCategory(event.skillType),
          action: event.action,
          created_at: event.timestamp ? event.timestamp.toString() : new Date().toISOString(),
          unitXp,
        });
      }
      
      // Stop at 1500 bricks to keep performance smooth
      if (brickArray.length >= 1500) break;
    }
    
    return brickArray.slice(0, 1500);
  }, [filteredEvents, unitXp]);

  // Calculate stats
  const totalXp = bricks.length * unitXp;
  const hasMoreBricks = filteredEvents.reduce((total, event) => 
    total + Math.floor((event.xpGained || 0) / unitXp), 0) > 1500;
  const nextMilestone = Math.ceil(bricks.length / 100) * 100 * unitXp;

  // Map skill types to categories
  function mapSkillTypeToCategory(skillType: string): string {
    switch (skillType) {
      case 'prospecting': return 'prospecting';
      case 'followUp': return 'followup';
      case 'consistency': return 'consistency'; 
      case 'marketKnowledge': return 'knowledge';
      default: return 'prospecting';
    }
  }

  // Get color for category
  function getCategoryColor(category: string): string {
    return categoryColors[category as keyof typeof categoryColors] || categoryColors.prospecting;
  }

  // Format date for tooltip
  function formatDate(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  }

  // Render brick with milestone check
  const renderBricks = () => {
    const elements: JSX.Element[] = [];
    
    bricks.forEach((brick, index) => {
      const color = getCategoryColor(brick.category);
      const tooltip = `${brick.category} · ${brick.action.replace('_', ' ')} · +${brick.unitXp} XP · ${formatDate(brick.created_at)}`;
      
      // Add milestone divider every 100 bricks
      if (index > 0 && index % 100 === 0) {
        const milestoneXp = index * unitXp;
        elements.push(
          <div
            key={`milestone-${index}`}
            className="milestone-divider"
            style={{ gridColumn: '1 / -1' }}
          >
            <div className="milestone-line">
              <span className="milestone-label">
                Milestone: {milestoneXp.toLocaleString()} XP
              </span>
            </div>
          </div>
        );
      }
      
      // Add the brick
      elements.push(
        <div
          key={brick.id}
          className="brick"
          style={{ backgroundColor: color }}
          title={tooltip}
          aria-label={tooltip}
        />
      );
    });
    
    return elements;
  };

  if (filteredEvents.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        <div className="text-4xl mb-3">🧱</div>
        <p>No XP yet—add a prospect or log a follow-up to start building your foundation.</p>
      </div>
    );
  }

  return (
    <div className="foundation-wall">
      <style>{`
        .foundation-wall {
          --brick-size-mobile: 10px;
          --brick-height-mobile: 6px;
          --gap-mobile: 1.5px;
          --brick-size-tablet: 12px;
          --brick-height-tablet: 7px;
          --gap-tablet: 2px;
          --brick-size-desktop: 14px;
          --brick-height-desktop: 8px;
          --gap-desktop: 2px;
        }

        .info-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1rem;
          padding: 0.75rem;
          background: #f9fafb;
          border-radius: 8px;
          border: 1px solid #e5e7eb;
        }

        .info-stats {
          font-size: 0.875rem;
          color: #6b7280;
        }

        .brick-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, var(--brick-size-mobile));
          gap: var(--gap-mobile);
          grid-auto-flow: row;
          margin-bottom: 1rem;
        }

        .brick {
          width: var(--brick-size-mobile);
          height: var(--brick-height-mobile);
          border-radius: 2px;
          cursor: pointer;
          transition: transform 0.1s ease;
        }

        .brick:hover {
          transform: scale(1.1);
        }

        .milestone-divider {
          margin: 8px 0;
        }

        .milestone-line {
          height: 1px;
          background: #e5e7eb;
          position: relative;
        }

        .milestone-label {
          position: absolute;
          left: 0;
          top: -8px;
          font-size: 10px;
          color: #6b7280;
          background: #f9fafb;
          padding: 2px 6px;
          border-radius: 8px;
          border: 1px solid #e5e7eb;
          white-space: nowrap;
        }

        @media (min-width: 768px) {
          .brick-grid {
            grid-template-columns: repeat(auto-fill, var(--brick-size-tablet));
            gap: var(--gap-tablet);
          }
          .brick {
            width: var(--brick-size-tablet);
            height: var(--brick-height-tablet);
          }
        }

        @media (min-width: 1024px) {
          .brick-grid {
            grid-template-columns: repeat(auto-fill, var(--brick-size-desktop));
            gap: var(--gap-desktop);
          }
          .brick {
            width: var(--brick-size-desktop);
            height: var(--brick-height-desktop);
          }
        }
      `}</style>
      
      {/* Time Window Selector */}
      <div className="flex gap-1 mb-4">
        {(['7d', '30d', 'all'] as const).map((period) => (
          <Button
            key={period}
            variant={timeWindow === period ? 'default' : 'outline'}
            size="sm"
            onClick={() => setTimeWindow(period)}
            className="text-xs px-3 py-1"
          >
            {period === 'all' ? 'All' : period.toUpperCase()}
          </Button>
        ))}
      </div>
      {/* Foundation Wall Grid */}
      <div className="brick-grid">
        {renderBricks()}
      </div>
      {/* Legend */}
      <div className="flex flex-wrap gap-4 text-sm">
        {Object.entries(categoryColors).map(([category, color]) => (
          <div key={category} className="flex items-center gap-2">
            <div
              className="w-3 h-3 rounded-sm"
              style={{ backgroundColor: color }}
            />
            <span className="capitalize text-gray-600">
              {category === 'followup' ? 'Follow Up' : 
               category === 'knowledge' ? 'Market Knowledge' : 
               category}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}