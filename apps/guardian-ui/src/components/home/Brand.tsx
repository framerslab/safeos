/**
 * A name that stays as it is in a translated page (SafeOS, SafeOS Guardian,
 * Frame, GitHub and the names of other sites).
 *
 * @module components/home/Brand
 */

export function Brand({ children }: { children: React.ReactNode }) {
  return <span translate="no">{children}</span>;
}

export default Brand;
