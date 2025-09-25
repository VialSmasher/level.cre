import { useMemo } from 'react';
import { SkillActivityRow } from '@level-cre/shared/schema';

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
  // All-time view: no time filtering
  const filteredEvents = events;

  // Fixed columns per course (row)
  const COLS = 60;

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

  // Chunk bricks into fixed-width courses (rows), oldest → newest
  const courses: Brick[][] = useMemo(() => {
    const rows: Brick[][] = [];
    for (let i = 0; i < bricks.length; i += COLS) {
      rows.push(bricks.slice(i, i + COLS));
    }
    return rows;
  }, [bricks]);

  // Level thresholds (capstones) using same leveling curve as stats page
  const getXpForLevel = (level: number): number => Math.floor((level ** 2) * 100);
  const capstonesByRow = useMemo(() => {
    const map = new Map<number, number[]>();
    for (let lvl = 1; lvl <= 99; lvl++) {
      const xpNeeded = getXpForLevel(lvl);
      if (xpNeeded > totalXp) break;
      const bricksNeeded = Math.ceil(xpNeeded / unitXp);
      if (bricksNeeded <= 0) continue;
      const rowIndex = Math.floor((bricksNeeded - 1) / COLS);
      const arr = map.get(rowIndex) || [];
      arr.push(lvl);
      map.set(rowIndex, arr);
    }
    return map;
  }, [totalXp, unitXp]);

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

  // Render bricks into bottom-up courses
  const renderCourses = () => {
    return courses.map((course, idx) => {
      const courseFromBottom = idx + 1; // because we use column-reverse
      const showTick = courseFromBottom % 10 === 0;
      const xpAtRow = courseFromBottom * COLS * unitXp;
      const capstones = capstonesByRow.get(idx) || [];
      return (
        <div key={`course-row-${idx}`} className="course-row">
          <div className="gutter">
            {showTick ? (
              <span className="gutter-label">{xpAtRow.toLocaleString()} XP</span>
            ) : (
              <span className="gutter-spacer" />
            )}
          </div>
          <div className="course" aria-label={`Course ${courseFromBottom}`}>
            {course.map((brick, colIdx) => {
              const color = getCategoryColor(brick.category);
              const tooltip = `${brick.category} · ${brick.action.replace('_', ' ')} · +${brick.unitXp} XP · ${formatDate(brick.created_at)}`;
              return (
                <div
                  key={brick.id}
                  className="brick"
                  style={{ backgroundColor: color, animationDelay: `${(colIdx % COLS) * 5}ms` }}
                  title={tooltip}
                  aria-label={tooltip}
                />
              );
            })}
            {capstones.length > 0 && (
              <div className="capstones" aria-hidden>
                {capstones.map((lvl) => (
                  <span key={`cap-${lvl}`} className="capstone-pill">Lvl {lvl}</span>
                ))}
              </div>
            )}
          </div>
        </div>
      );
    });
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

        .stack {
          display: flex;
          flex-direction: column-reverse; /* bottom-up build */
          gap: 2px;
          margin-bottom: 0.75rem;
        }

        .course-row {
          display: grid;
          grid-template-columns: 64px 1fr; /* gutter + course */
          align-items: center;
          gap: 8px;
        }

        .gutter {
          display: flex;
          justify-content: flex-end;
          align-items: center;
        }

        .gutter-label {
          font-size: 10px;
          color: #6b7280;
          background: #f3f4f6;
          border: 1px solid #e5e7eb;
          border-radius: 999px;
          padding: 2px 6px;
          white-space: nowrap;
        }

        .gutter-spacer { height: 1px; }

        .course {
          display: grid;
          grid-template-columns: repeat(var(--cols, 60), var(--brick-size-mobile));
          gap: var(--gap-mobile);
          position: relative;
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

        .capstones {
          position: absolute;
          right: -2px;
          top: 50%;
          transform: translateY(-50%);
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .capstone-pill {
          font-size: 10px;
          color: #111827;
          background: #fde68a;
          border: 1px solid #fbbf24;
          padding: 1px 4px;
          border-radius: 6px;
        }

        @media (min-width: 768px) {
          .course { grid-template-columns: repeat(var(--cols, 60), var(--brick-size-tablet)); gap: var(--gap-tablet); }
          .brick {
            width: var(--brick-size-tablet);
            height: var(--brick-height-tablet);
          }
        }

        @media (min-width: 1024px) {
          .course { grid-template-columns: repeat(var(--cols, 60), var(--brick-size-desktop)); gap: var(--gap-desktop); }
          .brick {
            width: var(--brick-size-desktop);
            height: var(--brick-height-desktop);
          }
        }

        @keyframes place {
          from { transform: scale(0.9); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
      `}</style>
      
      {/* Foundation wall: bottom-up courses with fixed columns */}
      <div className="stack" style={{ ['--cols' as any]: COLS }}>
        {renderCourses()}
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
