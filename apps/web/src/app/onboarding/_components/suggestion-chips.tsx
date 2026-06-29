"use client";

interface ChipDef {
  label: string;
  body: string;
  isSkip?: boolean;
}

const FIRST_MESSAGE_CHIPS: ChipDef[] = [
  { label: "We sell <product> to <audience>", body: "We sell <product> to <audience>." },
  { label: "Start with our website URL", body: "Our website is " },
  { label: "Skip and upload a one-pager", body: "I would rather upload a one-pager.", isSkip: true },
];

const PER_CATEGORY_CHIPS: Record<string, ChipDef[]> = {
  company_overview: FIRST_MESSAGE_CHIPS,
  products: [
    { label: "Our main product is <X>", body: "Our main product is <X>." },
    { label: "We charge <price> for <plan>", body: "We charge <price> for <plan>." },
    { label: "Here is our pricing page URL", body: "Our pricing page is " },
  ],
  audience: [
    { label: "We sell to <role> at <type of company>", body: "We sell to <role> at <type of company>." },
    { label: "Our customers are usually <size>", body: "Our customers are usually <size>." },
    { label: "I do not have a clear ICP yet", body: "I do not have a clear ICP yet.", isSkip: true },
  ],
  brand_voice: [
    { label: "Direct and confident", body: "Our voice is direct and confident." },
    { label: "Warm and friendly", body: "Our voice is warm and friendly." },
    { label: "Paste a sample I have written", body: "Here is a sample of how we write: " },
  ],
  competitors: [
    { label: "Our main competitors are <A> and <B>", body: "Our main competitors are <A> and <B>." },
    { label: "Closest alternative is <X>", body: "The closest alternative to us is <X>." },
    { label: "We do not really have direct competition", body: "We do not really have direct competition.", isSkip: true },
  ],
  team: [
    { label: "It is just me right now", body: "It is just me right now." },
    { label: "We have <N> people, <roles>", body: "We have <N> people: <roles>." },
    { label: "I will add team later", body: "I will add the team later.", isSkip: true },
  ],
  processes: [
    { label: "Approvals go through me", body: "Approvals go through me." },
    { label: "We use <tool> for <X>", body: "We use <tool> for <X>." },
    { label: "Skip for now", body: "Skip processes for now.", isSkip: true },
  ],
  historical: [
    { label: "Here is a recent campaign that worked", body: "Here is a recent campaign that worked: " },
    { label: "I do not have past examples", body: "I do not have past examples.", isSkip: true },
    { label: "Skip for now", body: "Skip historical for now.", isSkip: true },
  ],
};

interface SuggestionChipsProps {
  category: string | null;
  onPick: (body: string, label: string, index: number) => void;
  onSkip: (category: string, label: string, index: number) => void;
}

export function SuggestionChips({ category, onPick, onSkip }: SuggestionChipsProps) {
  if (!category) return null;
  const chips = PER_CATEGORY_CHIPS[category];
  if (!chips || chips.length === 0) return null;

  return (
    <div
      className="mt-2 flex flex-wrap gap-2 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200"
      role="group"
      aria-label="Suggested answers"
    >
      {chips.map((chip, i) => (
        <button
          key={`${category}-${i}`}
          type="button"
          aria-label={chip.label}
          onClick={() => {
            if (chip.isSkip) onSkip(category, chip.label, i);
            else onPick(chip.body, chip.label, i);
          }}
          className="rounded-full border border-[oklch(0.85_0.01_260/0.4)] bg-white px-3.5 py-2 text-xs text-text-secondary transition-colors hover:border-[oklch(0.7_0.01_260/0.6)] hover:bg-[oklch(0.97_0.005_260)] hover:text-foreground"
        >
          {chip.label}
        </button>
      ))}
    </div>
  );
}
