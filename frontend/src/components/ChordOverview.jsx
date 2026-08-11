import ChordName from './ChordName'
import { buildAltSpellingSentence, buildSynonymText } from '../lib/chordAlias'
import { getIntervalStyle } from '../lib/intervalColors'
import { renderChordNote } from '../lib/renderChordNote'
import './ChordOverview.css'

// chord_info.py's `short` interval labels mostly already overlap with
// intervalColors.js's recognized vocabulary (both independently settled
// on things like "3"/"b3"/"5"/"b7"/"maj7"/"dim7") -- the one real gap is
// the root, labeled "R" here vs. the "1" classifyInterval()/voicings.db
// actually use everywhere else. Anything else this doesn't recognize
// (bare "2"/"4"/"6", altered extensions) already falls through to the
// generic "ext" bucket by design, same graceful default every other
// caller of getIntervalStyle relies on when it doesn't have a `formula`
// to disambiguate sus tones with (see intervalColors.js's own comment).
function toIntervalColorToken(short) {
  return short === 'R' ? '1' : short
}

// Task 3 (this follow-up): builds the unified "Similar Chords" list --
// TRUE SYNONYMS (identical notes, different quality name, e.g. aug7 <->
// 7#5) from /chord-info's `quality_synonyms` (each already paired with
// its own real "why" reason -- see chord_info.explain_quality_synonym()
// and NOTE_STYLE_GUIDE.md), and OVERLAP relations (shares required
// notes, one commonly omits a tone the other has, e.g. 7add13 <-> 13)
// from songs.py's `related_notes`. A chord can have BOTH kinds at once
// (e.g. Ab7#5/Abaug7 has a real aug7 synonym AND a real 7b13 overlap) --
// this returns them as ONE combined list, synonyms first, never assuming
// only one kind applies. Exported so Results.jsx doesn't need to
// duplicate this "is there anything real to show" check for any future
// use.
export function buildSimilarChords(chordInfoData, relatedNotes) {
  const entries = []
  if (chordInfoData?.chord) {
    for (const synonym of chordInfoData.quality_synonyms || []) {
      entries.push({
        key: `synonym-${synonym.chord}`,
        text: buildSynonymText(synonym.chord, chordInfoData.chord, synonym.reason),
      })
    }
  }
  for (const note of relatedNotes || []) {
    entries.push({ key: `overlap-${note.chord}`, text: note.text })
  }
  return entries
}

// Phase 5 Part 2/7 follow-up: rebuilt as a "Chord Overview" card
// (renamed from OverallChordInfo -- the redesign changes its role enough
// to warrant it), positioned ABOVE the Voicings/Songs grid rather than
// below, per a real HTML/CSS mockup (frontend/design-reference, layout/
// structure only -- palette and type come from the app's own tokens, see
// CHORD_INFO_AUDIT.md and RESULTS_ENTRY_PATHS.md for the full history).
//
// Structure, top to bottom -- each piece hides individually when it has
// nothing to show:
//   - A 3-column strip (what this chord IS, its notes as colored balls,
//     its interval formula + bass note) -- all from chord_info.py via
//     /chord-info, unchanged data.
//   - "Why this spelling" -- ONE flowing chord-fact sentence, ROOT/BASS
//     ENHARMONIC SPELLING ONLY (see buildAltSpellingSentence) -- rendered
//     whenever there's alt-spelling data, EXCEPT when `showWhySpelling`
//     is false (a later follow-up's Task 2: suppressed for dropdown
//     picks specifically, since the typing-time dropdown caption already
//     explained the same root/bass substitution while it was being
//     picked -- re-explaining it here would be redundant. Still renders
//     for typed submissions and direct URL visits, where nothing
//     explained it beforehand). The bar sits directly below the title,
//     unscrolled, always in view when it renders -- an earlier
//     title-level "teaser" link pointing down at it was removed
//     (same follow-up's Task 1) once that stopped being necessary.
//   - "Similar Chords" -- REPLACES the old "Overlapping chords" banner
//     entirely: a plain list (not a bordered Songs-style banner) naming
//     every true synonym AND overlap relation together, each its own
//     one-sentence theory fact, songs clause only when real (see
//     buildSimilarChords above).
// Deliberately NOT included: chord_info.py's `related` dict (relative
// minor/parallel/tritone-sub/"resolves from (V7)"/simpler-version) --
// confirmed out of scope for this card, not wired up at all rather than
// half-built and hidden.
function ChordOverview({ chordInfo, relatedNotes, showWhySpelling = true }) {
  const info = chordInfo?.ok ? chordInfo.data : null
  const altSentence = showWhySpelling ? buildAltSpellingSentence(info) : null
  const similarChords = buildSimilarChords(info, relatedNotes)

  if (!info && similarChords.length === 0) return null

  return (
    <div className="section panel chord-overview">
      <h2>Chord Overview</h2>

      {info && (
        <div className="chord-overview__grid">
          <div className="chord-overview__col">
            <h3 className="chord-overview__kicker">What is this chord?</h3>
            <p className="chord-overview__desc">{info.description}</p>
          </div>

          <div className="chord-overview__col">
            <h3 className="chord-overview__kicker">Notes in this chord</h3>
            <div className="chord-overview__notes">
              {info.intervals.map((iv) => {
                const style = getIntervalStyle(toIntervalColorToken(iv.short))
                return (
                  <div className="chord-overview__note" key={iv.semitones}>
                    <span
                      className="chord-overview__ball"
                      style={{ background: style.fill, color: style.text, borderColor: style.stroke }}
                    >
                      {iv.note}
                    </span>
                    <small>{iv.short}</small>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="chord-overview__col">
            <h3 className="chord-overview__kicker">Interval formula</h3>
            <div className="chord-overview__formula">{info.intervals.map((iv) => iv.short).join(' · ')}</div>
            {/* Bass called out separately (Task 1's explicit ask) rather
                than folded into the formula string above -- the formula
                is about the chord's own stacked intervals; the bass note
                is a genuinely different fact (which string sounds
                lowest), conflating them would misrepresent the formula
                as including a tone it doesn't structurally have. */}
            {info.slash_bass && (
              <p className="chord-overview__bass-note">
                <ChordName>{info.slash_bass}</ChordName> is the bass
              </p>
            )}
          </div>
        </div>
      )}

      {altSentence && (
        <p className="related-note chord-overview__explain">
          <strong>Why this spelling? </strong>
          {renderChordNote(altSentence)}
        </p>
      )}

      {similarChords.length > 0 && (
        <div className="chord-overview__block">
          <h3 className="chord-overview__kicker">Similar Chords</h3>
          <ul className="chord-overview__similar-list">
            {similarChords.map((entry) => (
              <li key={entry.key}>{renderChordNote(entry.text)}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

export default ChordOverview
