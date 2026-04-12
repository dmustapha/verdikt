'use client';

export function Tip({ term, tip }: { term: string; tip: string }) {
  return (
    <span className="vk-tip" data-tip={tip}>
      {term}
    </span>
  );
}
