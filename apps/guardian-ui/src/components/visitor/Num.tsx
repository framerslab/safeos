/**
 * A number on a visitor page (a count, a size, a year), set in tabular
 * figures. The words around it keep proportional figures, so a hyphen in
 * them keeps its own width.
 *
 * @module components/visitor/Num
 */

export function Num({ children }: { children: React.ReactNode }) {
  return <span className="num">{children}</span>;
}

export default Num;
