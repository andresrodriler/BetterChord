import ChordName from './ChordName'
import { useAccessibilityPrefs } from '../context/AccessibilityPrefsContext'
import { buildAltSpellingSentence, buildSynonymText } from '../lib/chordAlias'
import { getIntervalStyle } from '../lib/intervalColors'
import { renderChordNote } from '../lib/renderChordNote'
import './ChordOverview.css'

// chord_info.py's `short` interval labels mostly overlap with
// intervalColors.js's vocabulary ("3"/"b3"/"5"/"b7"/"maj7"/"dim7"); the
// one gap is the root, labeled "R" here vs. the "1" used everywhere
// else. Anything else this doesn't recognize (altered extensions) falls
// through to the generic "ext" bucket, same as any getIntervalStyle
// caller without a `formula` to disambiguate sus tones.
function toIntervalColorToken(short) {
  return short === 'R' ? '1' : short
}

// Builds the unified "Similar Chords" list -- true synonyms (identical
// notes, different quality name, e.g. aug7 <-> 7#5) from /chord-info's
// `quality_synonyms` (each with its own "why" reason from
// chord_info.explain_quality_synonym()), plus overlap relations (one
// commonly omits a tone the other has, e.g. 7add13 <-> 13) from
// songs.py's `related_notes`. A chord can have both -- returned as one
// list, synonyms first. Exported so Results.jsx needn't duplicate the
// "anything real to show" check.
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

// The "Chord Overview" card, above the Voicings/Songs grid. Layout is
// from a mockup (frontend/design-reference); palette and type come from
// the app's tokens (see CHORD_INFO_AUDIT.md, RESULTS_ENTRY_PATHS.md).
//
// Structure (each piece hides when it has nothing to show):
//   - A 3-column strip: description, notes as interval-colored balls,
//     interval formula + bass note -- all from chord_info.py via
//     /chord-info.
//   - "Why this spelling?" -- one flowing chord-fact sentence, root/bass
//     enharmonic spelling only (see buildAltSpellingSentence). Suppressed
//     when `showWhySpelling` is false (dropdown picks -- the typing-time
//     caption already explained the substitution); still renders for
//     typed submissions and direct URL visits.
//   - "Similar Chords" -- a plain list (not a bordered banner) of every
//     true synonym and overlap relation, each its own theory sentence,
//     songs clause only when real (see buildSimilarChords above).
// Deliberately NOT included: chord_info.py's `related` dict (relative
// minor/parallel/tritone-sub/etc) -- out of scope, not wired up.
//
// `formula` is the /voicings/{chord} response's `formula` field (the
// same object IntervalLegend/ChordTonePanel use), passed so the note
// balls can disambiguate a sus2/sus4 chord's characteristic tone (see
// intervalColors.js's classifyInterval). Optional -- `voicings` can be
// null/loading/failed when this card renders (chord theory is never
// gated on voicing availability); without `formula` a sus tone falls
// back to the generic "ext" bucket.
function ChordOverview({ id, chordInfo, relatedNotes, showWhySpelling = true, formula = null }) {
  // See IntervalLegend.jsx's identical comment -- subscribes this
  // component to the colorblind toggle so it re-renders (and re-reads
  // getIntervalStyle's cleared cache) when the palette changes.
  useAccessibilityPrefs()
  const info = chordInfo?.ok ? chordInfo.data : null
  const altSentence = showWhySpelling ? buildAltSpellingSentence(info) : null
  const similarChords = buildSimilarChords(info, relatedNotes)

  if (!info && similarChords.length === 0) return null

  return (
    <div id={id} className="section panel chord-overview">
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
                const style = getIntervalStyle(toIntervalColorToken(iv.short), formula)
                return (
                  <div className="chord-overview__note" key={iv.semitones}>
                    <span
                      className="chord-overview__ball"
                      style={{
                        background: style.fill,
                        color: style.text,
                        borderColor: style.stroke,
                        '--chord-overview-ball-glow': style.glow,
                      }}
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
            {/* Bass called out separately, not folded into the formula
                string -- the formula is the chord's stacked intervals;
                the bass note is a different fact, and conflating them
                would misrepresent the formula. */}
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
