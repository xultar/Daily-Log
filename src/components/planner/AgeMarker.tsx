import React from "react";

interface AgeMarkerProps {
  /** Weeks the item has been slipping. Zero or less renders nothing. */
  age: number;
  /** Classes for the visible token. The two call sites size it differently. */
  className: string;
}

/**
 * How long an item has been carried, said twice: a short visible token, and
 * the phrase a screen reader gets instead of it.
 *
 * The token is aria-hidden because "1w" is announced as "one w". Keeping the
 * pair in one place is the point — the visible half being silently unhidden,
 * or the spoken half deleted, is the drift this prevents, and
 * carry-bar.test.tsx pins the exact accessible name that results.
 *
 * Styling arrives as a prop rather than being unified: the sidebar's column is
 * 128px at 9px text and the review bar's rows are not, so the two want
 * different sizes for the same fact.
 */
const AgeMarker: React.FC<AgeMarkerProps> = ({ age, className }) => {
  if (age <= 0) return null;
  return (
    <>
      <span aria-hidden="true" className={className}>
        {age}w
      </span>
      <span className="sr-only">
        carried {age} week{age === 1 ? "" : "s"}
      </span>
    </>
  );
};

export default AgeMarker;
