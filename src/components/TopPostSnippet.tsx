interface TopPostSnippetProps {
  quote: string;
  upvotes: number;
  subreddit: string;
}

function fmt(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

export default function TopPostSnippet({ quote, upvotes, subreddit }: TopPostSnippetProps) {
  return (
    <p style={{ fontSize: 13, color: '#6b7280', lineHeight: '1.5', fontStyle: 'italic' }}>
      "{quote}"
      <span style={{ fontStyle: 'normal', marginLeft: 8, fontSize: 11, color: '#9ca3af', whiteSpace: 'nowrap' }}>
        ↑{fmt(upvotes)} · r/{subreddit}
      </span>
    </p>
  );
}
