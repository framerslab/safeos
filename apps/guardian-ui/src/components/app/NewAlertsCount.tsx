/**
 * The count of new alerts on History
 *
 * While alerts are new, History's word is followed by the problem glyph and
 * the number in the ink at weight 700: "History 3", and "History 99+" above
 * 99. The glyph is hidden from assistive technology; the link's name carries
 * the whole count instead. Nothing shows at 0.
 *
 * @module components/app/NewAlertsCount
 */

/** "History, 3 new alerts"; "History, 1 new alert". */
export function historyName(count: number): string {
  return `History, ${count} new ${count === 1 ? 'alert' : 'alerts'}`;
}

/** Nothing at 0; else a space, the problem glyph (hidden from assistive technology) and the number, "99+" above 99. */
export function NewAlertsCount({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <>
      {' '}
      <span className="new-count">
        <svg className="problem-mark" viewBox="0 0 12 12" width="12" height="12" aria-hidden="true" focusable="false">
          <path d="M6 1 11.5 11H0.5Z" />
        </svg>
        <span className="num">{count > 99 ? '99+' : count}</span>
      </span>
    </>
  );
}

export default NewAlertsCount;
