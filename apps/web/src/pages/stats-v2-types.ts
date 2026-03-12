export type Timeframe = 'this_week' | 'last_7_days' | 'this_month' | 'last_30_days';

export type SkillKey = 'prospecting' | 'followUp' | 'consistency' | 'marketKnowledge';

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
  priority: number;
}

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
    remainingLabel: string;
    status: 'on_track' | 'watch' | 'at_risk';
  };

  cta: QuickAction;
}

export interface ActivityPoint {
  date: string;
  prospectingXp: number;
  followUpXp: number;
  consistencyXp: number;
  marketKnowledgeXp: number;
}

export interface XpPoint {
  date: string;
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
