/**
 * A group of rows, opened by its heading with a 1 px line above it; the
 * list's first group has no heading. A group of links is a list named by its
 * heading.
 *
 * @module components/settings/Group
 */

import type { ReactNode } from 'react';

export function Group({
  id,
  heading,
  label,
  list,
  children,
}: {
  id: string;
  heading?: string;
  /** The name of a group with no heading. */
  label?: string;
  /** The rows are list items. */
  list?: boolean;
  children: ReactNode;
}) {
  const headingId = `${id}-heading`;
  const named = heading ? { 'aria-labelledby': headingId } : label ? { 'aria-label': label } : {};
  return (
    <section className={`set-group${heading ? ' set-group--headed' : ''}`} id={id}>
      {heading ? (
        <h2 id={headingId} className="set-group__heading">
          {heading}
        </h2>
      ) : null}
      {list ? (
        <ul className="set-group__rows" {...named}>
          {children}
        </ul>
      ) : (
        <div className="set-group__rows" role="group" {...named}>
          {children}
        </div>
      )}
    </section>
  );
}

export default Group;
