interface MentionSourceProps {
  name: string;
}

export default function MentionSource({ name }: MentionSourceProps) {
  return (
    <span style={{ fontSize: 11, color: '#6b7280' }}>
      r/{name}
    </span>
  );
}
