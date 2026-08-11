import ChordName from '../components/ChordName'

// Every note family whose text is authored as one interpolated string
// (chordAlias.js's two captions, and every note songs.py builds) marks the
// chord names it mentions with backticks -- this is the one function that
// turns that markup into real JSX, so a chord name reads identically
// (readout styling, via ChordName) no matter which family produced the
// text. Originally private to Results.jsx as `renderBacktickedText`,
// covering only the Songs-panel notes -- relocated here and adopted by
// ManualSearch's/Results-header's root-alias captions too, per
// NOTE_STYLE_GUIDE.md, so those two families stop being the only ones
// without the readout treatment.
export function renderChordNote(text) {
  return text.split('`').map((part, i) => (i % 2 === 1 ? <ChordName key={i}>{part}</ChordName> : part))
}
