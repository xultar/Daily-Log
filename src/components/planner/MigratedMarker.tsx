import React from "react";
import { format, parse, isValid } from "date-fns";

interface MigratedMarkerProps {
  /** ISO Monday of the week this item was carried to. Absent renders nothing. */
  migratedTo?: string;
  /** Classes for the visible glyph. The call sites size it differently. */
  className?: string;
}

/**
 * The Bullet Journal `>` signifier, said twice: a glyph, and the phrase a
 * screen reader gets instead of it. Kept in one place for the reason AgeMarker
 * is — the visible half being silently unhidden, or the spoken half deleted, is
 * the drift this prevents.
 *
 * A glyph rather than a line through the text, because struck and migrated are
 * opposite outcomes — abandoned against moved on — and must not share a
 * channel. A row can carry both, and both stay legible when it does. It is a
 * text character, so it survives a mono print and involves no colour.
 *
 * An unparseable date renders nothing rather than a broken marker, matching
 * what `asOrigin` does to a bad origin on the way in.
 *
 * Bold is not decoration. Measured in a browser, `›` at the 9px used by the
 * week columns and the sidebar is 2.7px wide at weight 400 — a speck beside
 * 12px row text. The weight is what makes it read as a mark rather than dirt.
 */
const MigratedMarker: React.FC<MigratedMarkerProps> = ({ migratedTo, className }) => {
  if (!migratedTo) return null;
  const date = parse(migratedTo, "yyyy-MM-dd", new Date());
  if (!isValid(date)) return null;
  return (
    <>
      <span aria-hidden="true" className={`font-bold ${className ?? ""}`}>
        ›
      </span>
      <span className="sr-only">migrated to {format(date, "d MMMM")}</span>
    </>
  );
};

export default MigratedMarker;
