// Short, real facts about BetterChord's own pipeline, shown while /identify
// is in flight (CaptureModal's loading state). Condensed from
// pages/HowItWorks.jsx's stage copy -- keep these in sync with that page if
// the pipeline description there changes, rather than inventing new claims
// here.
export const IDENTIFY_FACTS = [
  "Mic settings built for voice calls (echo cancellation, noise suppression) are turned off here -- they'd distort a guitar chord's real harmonic content.",
  "The CNN doesn't predict chord names directly -- it predicts which notes, root, and bass are sounding, then a separate rule-based engine does the naming.",
  'Every chord name in BetterChord flows through one shared parser, so root/quality/bass are never split by ad-hoc guesswork.',
  "The rule-based chord-naming engine reaches 98%+ root accuracy on its own, without any AI in that step.",
  'Fretboard diagrams are generated live from a real voicings database, not pulled from static images.',
  'Guide-tone relationships get surfaced too -- chords that share the same essential 3rd/7th as the one you looked up.',
]
