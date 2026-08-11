// The one place `.readout` (monospace, cyan "device readout" treatment) is
// applied to a chord name mentioned inline inside a note/caption -- used
// directly here by SongCard's capo/raw-chord note (built from discrete JS
// variables, no prose string to parse) and indirectly by every other note
// family via renderChordNote.jsx, which wraps each backtick-delimited
// segment in this component. See frontend/NOTE_STYLE_GUIDE.md.
function ChordName({ children }) {
  return <span className="readout">{children}</span>
}

export default ChordName
