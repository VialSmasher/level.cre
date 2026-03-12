# Performance Dashboard v2 - React Layout Spec

This spec is aligned to the current implementation in `apps/web/src/pages/stats.tsx`.

## 1) Page Component Tree

```tsx
<PerformanceDashboardPage>
  <PageHeader
    title="Performance"
    timeframe={timeframe}
    standings={standingsSummary}
    onTimeframeChange={...}
    onOpenStandings={...}
  />

  <NextBestActionBar
    item={nextBestAction}
    quickActions={quickActions}
  />

  <OutcomeKpiRow
    items={outcomeKpis}
  />

  <ActionQueue
    items={actionQueue}
  />

  <SkillCategoryGrid
    cards={skillCards}
  />

  <TrendsSection
    weeklyActivity={weeklyActivitySeries}
    monthlyXp={monthlyXpSeries}
    funnel={funnel}
  />

  <StandingsPanel
    standings={standingsDetail}
    suggestions={rankImprovementSuggestions}
  />
</PerformanceDashboardPage>
```

## 2) Data Contract (TypeScript)

```ts
export type Timeframe = 'this_week' | 'last_7_days' | 'this_month' | 'last_30_days';

export interface PerformanceDashboardData {
  generatedAtIso: string;
  timezone: string;
  timeframe: Timeframe;

  nextBestAction: NextBestAction;
  quickActions: QuickAction[];

  outcomeKpis: OutcomeKpi[];
  actionQueue: ActionItem[];

  skillCards: SkillCardModel[];

  trends: {
    weeklyActivitySeries: ActivityPoint[];
    monthlyXpSeries: XpPoint[];
    funnel: FunnelMetrics;
  };

  standings: {
    summary: StandingsSummary;
    detail: StandingsDetail;
    suggestions: RankSuggestion[];
  };

  totals?: {
    assetsTrackedLifetime: number;
    followupsLifetime: number;
  };
}

export interface NextBestAction {
  title: string;
  subtitle?: string;
  skillKey: SkillKey;
  progressPct: number;
  estimatedRankImpact?: {
    rankDelta: number;
    confidence: 'low' | 'medium' | 'high';
  };
  cta: QuickAction;
}

export interface QuickAction {
  id: 'log_prospect' | 'add_followup' | 'log_requirement' | 'log_activity';
  label: string;
  href: string;
  eventName: string;
}

export interface OutcomeKpi {
  id: 'weekly_xp' | 'level_progress' | 'standings' | 'streak';
  label: string;
  value: string;
  secondary?: string;
  delta?: {
    value: number;
    unit: '%' | 'count';
    direction: 'up' | 'down' | 'flat';
    compareTo: 'previous_week' | 'previous_30_days';
  };
  sparkline?: number[];
  status?: 'on_track' | 'watch' | 'at_risk';
}

export interface ActionItem {
  id: string;
  category: 'high_impact' | 'at_risk' | 'opportunity';
  title: string;
  detail: string;
  cta: QuickAction;
  priority: number; // 1 highest
}

export type SkillKey = 'prospecting' | 'followUp' | 'consistency' | 'marketKnowledge';

export interface SkillCardModel {
  skillKey: SkillKey;
  title: string;
  description: string;
  level: number;
  totalXp: number;
  weekXp: number;
  weekDeltaPct?: number;

  progress: {
    currentLevel: number;
    nextLevel: number;
    percent: number;
    remainingLabel: string; // "1 prospect", "4 active days", etc.
    status: 'on_track' | 'watch' | 'at_risk';
  };

  cta: QuickAction;
}

export interface ActivityPoint {
  date: string; // YYYY-MM-DD
  prospectingXp: number;
  followUpXp: number;
  consistencyXp: number;
  marketKnowledgeXp: number;
}

export interface XpPoint {
  date: string; // YYYY-MM-DD
  xp: number;
}

export interface FunnelMetrics {
  prospectsAdded: number;
  followUpsLogged: number;
  outcomesCreated: number;
  conversionRates: {
    prospectToFollowUpPct: number;
    followUpToOutcomePct: number;
  };
}

export interface StandingsSummary {
  rank: number;
  percentile: number;
  movementThisWeek: number;
}

export interface StandingsDetail {
  rank: number;
  percentile: number;
  movementThisWeek: number;
  targetRank: number;
  xpToTargetRank: number;
}

export interface RankSuggestion {
  id: string;
  text: string;
  expectedXp: number;
  cta?: QuickAction;
}
```

## 3) Suggested Prop Interfaces by Component

```ts
export interface PerformanceDashboardPageProps {
  data: PerformanceDashboardData;
  loading: boolean;
  error?: string;
  onRefresh: () => void;
  onTimeframeChange: (timeframe: Timeframe) => void;
}

export interface PageHeaderProps {
  title: string;
  timeframe: Timeframe;
  standings: StandingsSummary;
  onTimeframeChange: (timeframe: Timeframe) => void;
  onOpenStandings: () => void;
}

export interface NextBestActionBarProps {
  item: NextBestAction;
  quickActions: QuickAction[];
}

export interface OutcomeKpiRowProps {
  items: OutcomeKpi[];
}

export interface ActionQueueProps {
  items: ActionItem[];
}

export interface SkillCategoryGridProps {
  cards: SkillCardModel[];
}

export interface TrendsSectionProps {
  weeklyActivity: ActivityPoint[];
  monthlyXp: XpPoint[];
  funnel: FunnelMetrics;
}

export interface StandingsPanelProps {
  standings: StandingsDetail;
  suggestions: RankSuggestion[];
}
```

## 4) Sample JSON Payload

```json
{
  "generatedAtIso": "2026-02-23T10:12:00.000Z",
  "timezone": "America/Edmonton",
  "timeframe": "this_week",
  "nextBestAction": {
    "title": "Complete 1 Prospecting activity to reach Level 10",
    "subtitle": "You are 90% to next level",
    "skillKey": "prospecting",
    "progressPct": 90,
    "estimatedRankImpact": { "rankDelta": 1, "confidence": "medium" },
    "cta": { "id": "log_prospect", "label": "Log Prospect", "href": "/home", "eventName": "stats_nba_log_prospect" }
  },
  "quickActions": [
    { "id": "log_prospect", "label": "Log Prospect", "href": "/home", "eventName": "stats_quick_log_prospect" },
    { "id": "add_followup", "label": "Add Follow-Up", "href": "/followup", "eventName": "stats_quick_add_followup" },
    { "id": "log_requirement", "label": "Log Requirement", "href": "/requirements", "eventName": "stats_quick_log_requirement" }
  ],
  "outcomeKpis": [
    {
      "id": "weekly_xp",
      "label": "Weekly XP",
      "value": "485",
      "delta": { "value": 12, "unit": "%", "direction": "up", "compareTo": "previous_week" },
      "sparkline": [40, 55, 35, 70, 90, 85, 110],
      "status": "on_track"
    },
    {
      "id": "level_progress",
      "label": "Level Progress",
      "value": "L11",
      "secondary": "82% to L12",
      "status": "on_track"
    },
    {
      "id": "standings",
      "label": "Standings",
      "value": "#14",
      "secondary": "Top 22%",
      "delta": { "value": 3, "unit": "count", "direction": "up", "compareTo": "previous_week" }
    },
    {
      "id": "streak",
      "label": "Active Streak",
      "value": "1 day",
      "secondary": "Log activity today to avoid reset",
      "status": "at_risk"
    }
  ],
  "actionQueue": [
    {
      "id": "aq_1",
      "category": "high_impact",
      "title": "Prospecting close to level-up",
      "detail": "1 prospect needed to reach next level",
      "cta": { "id": "log_prospect", "label": "Start", "href": "/home", "eventName": "stats_queue_start_prospecting" },
      "priority": 1
    },
    {
      "id": "aq_2",
      "category": "at_risk",
      "title": "Consistency streak at risk",
      "detail": "Activity required today to preserve streak",
      "cta": { "id": "log_activity", "label": "Log now", "href": "/home", "eventName": "stats_queue_save_streak" },
      "priority": 2
    }
  ],
  "skillCards": [
    {
      "skillKey": "prospecting",
      "title": "Prospecting",
      "description": "Adding prospects, mapping areas, discovering opportunities",
      "level": 9,
      "totalXp": 9825,
      "weekXp": 120,
      "weekDeltaPct": 18,
      "progress": {
        "currentLevel": 9,
        "nextLevel": 10,
        "percent": 90,
        "remainingLabel": "1 prospect",
        "status": "on_track"
      },
      "cta": { "id": "log_prospect", "label": "Log Prospect", "href": "/home", "eventName": "stats_card_log_prospect" }
    }
  ],
  "trends": {
    "weeklyActivitySeries": [
      { "date": "2026-02-17", "prospectingXp": 30, "followUpXp": 10, "consistencyXp": 0, "marketKnowledgeXp": 20 },
      { "date": "2026-02-18", "prospectingXp": 40, "followUpXp": 15, "consistencyXp": 100, "marketKnowledgeXp": 0 }
    ],
    "monthlyXpSeries": [
      { "date": "2026-01-26", "xp": 210 },
      { "date": "2026-02-02", "xp": 340 }
    ],
    "funnel": {
      "prospectsAdded": 37,
      "followUpsLogged": 64,
      "outcomesCreated": 11,
      "conversionRates": {
        "prospectToFollowUpPct": 68,
        "followUpToOutcomePct": 17
      }
    }
  },
  "standings": {
    "summary": { "rank": 14, "percentile": 22, "movementThisWeek": 3 },
    "detail": { "rank": 14, "percentile": 22, "movementThisWeek": 3, "targetRank": 10, "xpToTargetRank": 140 },
    "suggestions": [
      {
        "id": "sg_1",
        "text": "Complete 2 prospecting actions and 3 follow-ups today",
        "expectedXp": 155,
        "cta": { "id": "log_prospect", "label": "Start Plan", "href": "/home", "eventName": "stats_rank_plan_start" }
      }
    ]
  },
  "totals": {
    "assetsTrackedLifetime": 456,
    "followupsLifetime": 912
  }
}
```

## 5) Endpoint Mapping from Current APIs

Use existing endpoints and compose server-side or client-side view-model:

- `/api/skills`
  - Maps to `skillCards[].totalXp`, `skillCards[].level/progress`.
- `/api/stats/header?userId=me`
  - Maps to `outcomeKpis` (level, streak), and optional `totals`.
- `/api/skill-activities?limit=1000`
  - Maps to weekly/monthly series, weekly XP, action queue triggers, follow-up counts.
- `/api/requirements`
  - Enhances market knowledge XP and trend attributions.
- `/leaderboard` (or new standings summary endpoint)
  - Maps to `standings.summary`, `standings.detail`, `suggestions`.

## 6) Incremental Build Plan in `stats.tsx`

1. Extract existing KPI card data into a typed `viewModel` object.
2. Replace top stat row with `OutcomeKpiRow` and include delta/sparkline placeholders.
3. Add `NextBestActionBar` + `ActionQueue` above skill cards.
4. Convert `SkillCard` props to `SkillCardModel` for copy consistency.
5. Add `TrendsSection` (start with static chart placeholders, then wire live data).
6. Keep existing queries; add a small `buildPerformanceViewModel(...)` mapper function.

## 7) Normalization Rules (Prevents Current Data Conflicts)

- Week boundaries must use one timezone key (`America/Edmonton`) for all weekly counters.
- Define follow-up event whitelist once and share between KPI + card calculations.
- Ensure each KPI explicitly labels period (`this_week`, `lifetime`) in copy and model.
- Do not mix lifetime and weekly values in a single metric tile.
