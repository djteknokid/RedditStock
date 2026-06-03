export type Direction = 'rise' | 'fall' | 'neutral';
export type SentimentLabel = 'bullish' | 'bearish' | 'mixed';

export interface Prediction {
  direction: Direction;
  confidence: number;
}

export interface StockEntry {
  rank: number;
  ticker: string;
  name: string;
  mentions: number;
  totalMentions?: number;
  velocityScore?: number;
  sentimentScore: number;
  sentimentLabel: SentimentLabel;
  sentimentReasoning?: string;
  subreddits: string[];
  lastMentionAgo: string;
  topPost: {
    quote: string;
    upvotes: number;
    subreddit: string;
  };
  whyTrending: string;
  predictions: {
    oneDay: Prediction;
    oneWeek: Prediction;
    oneMonth: Prediction;
  };
  priceChange24h: number;
}

export const stocks: StockEntry[] = [
  {
    rank: 1,
    ticker: 'GME',
    name: 'GameStop Corp.',
    mentions: 2847,
    sentimentScore: 94,
    sentimentLabel: 'bullish',
    subreddits: ['wallstreetbets', 'superstonk', 'stocks'],
    lastMentionAgo: '2 min ago',
    topPost: {
      quote: 'Dark pool data showing massive buy pressure — this is the same setup we saw in Jan 2021 but the float is even tighter now. Buckle up 🚀',
      upvotes: 18400,
      subreddit: 'wallstreetbets',
    },
    whyTrending:
      'A leaked options chain screenshot showing unusual $30 call accumulation went viral overnight. Combined with reports of elevated short interest (58%), retail is reading this as a classic short squeeze setup.',
    predictions: {
      oneDay: { direction: 'rise', confidence: 87 },
      oneWeek: { direction: 'rise', confidence: 72 },
      oneMonth: { direction: 'fall', confidence: 61 },
    },
    priceChange24h: 14.7,
  },
  {
    rank: 2,
    ticker: 'TSLA',
    name: 'Tesla, Inc.',
    mentions: 1923,
    sentimentScore: 52,
    sentimentLabel: 'mixed',
    subreddits: ['wallstreetbets', 'investing', 'teslainvestorsclub'],
    lastMentionAgo: '4 min ago',
    topPost: {
      quote: 'Musk tweeting at 3am about Cybertruck recall while the stock gaps down 8% is NOT the energy I need this Monday morning',
      upvotes: 9200,
      subreddit: 'wallstreetbets',
    },
    whyTrending:
      'Elon Musk\'s weekend social media activity triggered back-to-back Reddit threads debating brand damage vs. fundamentals. Q2 delivery numbers miss expectations are amplifying both bull and bear camps simultaneously.',
    predictions: {
      oneDay: { direction: 'neutral', confidence: 54 },
      oneWeek: { direction: 'fall', confidence: 68 },
      oneMonth: { direction: 'rise', confidence: 71 },
    },
    priceChange24h: -4.2,
  },
  {
    rank: 3,
    ticker: 'NVDA',
    name: 'NVIDIA Corporation',
    mentions: 1654,
    sentimentScore: 89,
    sentimentLabel: 'bullish',
    subreddits: ['investing', 'stocks', 'wallstreetbets'],
    lastMentionAgo: '7 min ago',
    topPost: {
      quote: 'Jensen just casually mentioned they have a 3-year backlog for Blackwell GPUs and people are still asking if the AI trade is over 💀',
      upvotes: 14700,
      subreddit: 'investing',
    },
    whyTrending:
      'NVIDIA\'s keynote at Computex dropped new Blackwell architecture details that exceeded analyst expectations. Enterprise AI spending commentary from AWS, Azure, and Google reaffirms that NVDA is the primary beneficiary of the AI infrastructure buildout.',
    predictions: {
      oneDay: { direction: 'rise', confidence: 82 },
      oneWeek: { direction: 'rise', confidence: 79 },
      oneMonth: { direction: 'rise', confidence: 85 },
    },
    priceChange24h: 6.3,
  },
  {
    rank: 4,
    ticker: 'AMD',
    name: 'Advanced Micro Devices',
    mentions: 1187,
    sentimentScore: 76,
    sentimentLabel: 'bullish',
    subreddits: ['stocks', 'investing', 'AMD_Stock'],
    lastMentionAgo: '11 min ago',
    topPost: {
      quote: 'AMD just announced MI350 series and analysts are literally raising price targets while the market is still treating it like a CPU company from 2018. This is a steal.',
      upvotes: 6800,
      subreddit: 'stocks',
    },
    whyTrending:
      'AMD\'s earnings beat consensus EPS by 12% while data center revenue doubled YoY. Redditors are highlighting the valuation discount vs. NVDA as the core thesis — "NVDA at 40x sales vs. AMD at 12x for similar AI exposure."',
    predictions: {
      oneDay: { direction: 'rise', confidence: 74 },
      oneWeek: { direction: 'rise', confidence: 81 },
      oneMonth: { direction: 'rise', confidence: 77 },
    },
    priceChange24h: 3.8,
  },
  {
    rank: 5,
    ticker: 'PLTR',
    name: 'Palantir Technologies',
    mentions: 1043,
    sentimentScore: 83,
    sentimentLabel: 'bullish',
    subreddits: ['wallstreetbets', 'investing', 'PLTR'],
    lastMentionAgo: '14 min ago',
    topPost: {
      quote: 'DoD just expanded PLTR contract by $480M and we\'re still under $30?? The government literally cannot run AI ops without this company',
      upvotes: 7300,
      subreddit: 'wallstreetbets',
    },
    whyTrending:
      'A newly disclosed $480M Department of Defense contract expansion caught Reddit by surprise as it wasn\'t in the earnings guidance. AIP commercial momentum is being discussed alongside government wins as proof that Palantir is no longer a "story stock."',
    predictions: {
      oneDay: { direction: 'rise', confidence: 79 },
      oneWeek: { direction: 'rise', confidence: 83 },
      oneMonth: { direction: 'neutral', confidence: 58 },
    },
    priceChange24h: 5.1,
  },
  {
    rank: 6,
    ticker: 'AAPL',
    name: 'Apple Inc.',
    mentions: 876,
    sentimentScore: 61,
    sentimentLabel: 'mixed',
    subreddits: ['apple', 'investing', 'stocks'],
    lastMentionAgo: '19 min ago',
    topPost: {
      quote: 'Apple Intelligence is actually worse than what I expected and I expected nothing. How is this company worth $3 trillion',
      upvotes: 5100,
      subreddit: 'apple',
    },
    whyTrending:
      'WWDC 2026 announcements landed to mixed reception — hardware upgrades impressed but the AI feature set lagged behind Google and Microsoft. Warren Buffett trimming his stake added fuel to a sell-off discussion already brewing on r/investing.',
    predictions: {
      oneDay: { direction: 'neutral', confidence: 62 },
      oneWeek: { direction: 'fall', confidence: 55 },
      oneMonth: { direction: 'rise', confidence: 67 },
    },
    priceChange24h: -1.4,
  },
  {
    rank: 7,
    ticker: 'MSTR',
    name: 'MicroStrategy Inc.',
    mentions: 734,
    sentimentScore: 71,
    sentimentLabel: 'bullish',
    subreddits: ['Bitcoin', 'wallstreetbets', 'investing'],
    lastMentionAgo: '22 min ago',
    topPost: {
      quote: 'Michael Saylor just announced they bought another 4,200 BTC at $97k average. MSTR is the only stock that goes up BECAUSE the CEO is reckless',
      upvotes: 4400,
      subreddit: 'Bitcoin',
    },
    whyTrending:
      'MicroStrategy\'s latest BTC purchase announcement coincided with Bitcoin pushing toward $100k, making MSTR a high-beta proxy for Reddit\'s crypto-adjacent trading crowd. The leveraged Bitcoin exposure narrative is driving heavy options volume.',
    predictions: {
      oneDay: { direction: 'rise', confidence: 69 },
      oneWeek: { direction: 'rise', confidence: 74 },
      oneMonth: { direction: 'fall', confidence: 63 },
    },
    priceChange24h: 9.2,
  },
  {
    rank: 8,
    ticker: 'RIVN',
    name: 'Rivian Automotive',
    mentions: 612,
    sentimentScore: 67,
    sentimentLabel: 'bullish',
    subreddits: ['wallstreetbets', 'Rivian', 'EVs'],
    lastMentionAgo: '31 min ago',
    topPost: {
      quote: 'Rivian production guidance raised to 60k units AND Amazon just ordered another 25k delivery vans. Short sellers are about to have a very bad week.',
      upvotes: 3800,
      subreddit: 'wallstreetbets',
    },
    whyTrending:
      'Raised production guidance + an expanded Amazon delivery van order surprised bears who had been betting on a capital raise. Short interest stands at 22% of float, creating short squeeze chatter similar to early 2023 patterns.',
    predictions: {
      oneDay: { direction: 'rise', confidence: 71 },
      oneWeek: { direction: 'rise', confidence: 64 },
      oneMonth: { direction: 'neutral', confidence: 52 },
    },
    priceChange24h: 7.6,
  },
  {
    rank: 9,
    ticker: 'SOFI',
    name: 'SoFi Technologies',
    mentions: 489,
    sentimentScore: 73,
    sentimentLabel: 'bullish',
    subreddits: ['stocks', 'investing', 'SoFiStock'],
    lastMentionAgo: '38 min ago',
    topPost: {
      quote: 'Fed telegraphing 2 more cuts this year and SOFI is still trading below book value. The market is genuinely sleeping on this one.',
      upvotes: 2900,
      subreddit: 'stocks',
    },
    whyTrending:
      'Fed minutes released this week hinted at two additional rate cuts in 2026, directly benefiting SoFi\'s net interest margin. Reddit\'s rate-sensitive crowd identified SOFI as an undervalued beneficiary given its chartered bank status.',
    predictions: {
      oneDay: { direction: 'neutral', confidence: 58 },
      oneWeek: { direction: 'rise', confidence: 76 },
      oneMonth: { direction: 'rise', confidence: 82 },
    },
    priceChange24h: 2.3,
  },
  {
    rank: 10,
    ticker: 'AMC',
    name: 'AMC Entertainment',
    mentions: 341,
    sentimentScore: 38,
    sentimentLabel: 'bearish',
    subreddits: ['wallstreetbets', 'amcstock', 'stocks'],
    lastMentionAgo: '47 min ago',
    topPost: {
      quote: 'I\'ve been holding AMC since 2021 and I just want everyone to know I have learned absolutely nothing and I am buying more',
      upvotes: 22000,
      subreddit: 'wallstreetbets',
    },
    whyTrending:
      'A viral self-deprecating post about long-term AMC holders cracked Reddit\'s front page, generating ironic engagement that\'s algorithmically indistinguishable from genuine bullish sentiment. Box office summer slate is weak, and debt concerns remain unresolved.',
    predictions: {
      oneDay: { direction: 'neutral', confidence: 48 },
      oneWeek: { direction: 'fall', confidence: 69 },
      oneMonth: { direction: 'fall', confidence: 77 },
    },
    priceChange24h: -2.8,
  },
];
