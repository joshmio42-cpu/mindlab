import { useId } from "react";
import type { SizeAggregate } from "./simulation-types";

export function Histogram({ result }: { result: SizeAggregate }) {
  const id = useId();
  const bins = result.histogram;
  const max = Math.max(1, ...bins.map((b) => b.count));
  if (!bins.length)
    return <p>No completed repetitions at this sample size yet.</p>;
  return (
    <figure className="sim-chart">
      <svg viewBox="0 0 640 270" role="img" aria-labelledby={id}>
        <title id={id}>
          Distribution of final peer-answer selection difference, treatment
          minus control, in percentage points. {result.completed_repetitions}{" "}
          repetitions.
        </title>
        <line x1="55" y1="215" x2="620" y2="215" stroke="currentColor" />
        {[0, 0.5, 1].map((fraction) => (
          <g key={fraction}>
            <line
              x1="55"
              x2="620"
              y1={215 - fraction * 170}
              y2={215 - fraction * 170}
              stroke="#dce6df"
            />
            <text x="46" y={220 - fraction * 170} textAnchor="end">
              {Math.round(max * fraction)}
            </text>
          </g>
        ))}
        {bins.map((bin, index) => (
          <rect
            key={index}
            x={57 + index * 28}
            y={215 - (bin.count / max) * 170}
            width="25"
            height={(bin.count / max) * 170}
            fill="#176d60"
          >
            <title>
              {bin.low.toFixed(1)} to {bin.high.toFixed(1)} pp: {bin.count}{" "}
              repetitions
            </title>
          </rect>
        ))}
        <text x="55" y="238">
          {bins[0].low.toFixed(1)}
        </text>
        <text x="620" y="238" textAnchor="end">
          {bins[bins.length - 1].high.toFixed(1)}
        </text>
        <text x="338" y="261" textAnchor="middle">
          Treatment − control (percentage points)
        </text>
        <text x="55" y="23">
          Repeated studies
        </text>
      </svg>
      <figcaption>
        Each bar counts simulated studies. Final peer-answer selection is the
        primary comparison.
      </figcaption>
      <details>
        <summary>Histogram data</summary>
        <div className="sim-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Difference range (pp)</th>
                <th>Repetitions</th>
              </tr>
            </thead>
            <tbody>
              {bins.map((bin, index) => (
                <tr key={index}>
                  <td>
                    {bin.low.toFixed(2)} to {bin.high.toFixed(2)}
                    {index === bins.length - 1
                      ? " (inclusive)"
                      : " (upper excluded)"}
                  </td>
                  <td>{bin.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}

export function SizeExplorer({ results }: { results: SizeAggregate[] }) {
  const id = useId();
  const available = results.filter((r) => r.completed_repetitions > 0);
  const widths = available.map(
    (r) =>
      r.difference_pp.peer_selection.high! -
      r.difference_pp.peer_selection.low!,
  );
  const maxWidth = Math.max(1, ...widths) * 1.1;
  const minN = Math.min(...available.map((r) => r.participants_per_condition));
  const maxN = Math.max(...available.map((r) => r.participants_per_condition));
  const x = (n: number) =>
    maxN === minN ? 330 : 60 + ((n - minN) / (maxN - minN)) * 530;
  const y = (width: number) => 210 - (width / maxWidth) * 160;
  return (
    <section className="card sim-size-explorer">
      <h2>Sample size and random variability</h2>
      <p>
        Same assumptions, different independent sample sizes. Spread is the
        width of the 95% simulation interval for the primary difference.
      </p>
      {available.length > 1 && (
        <svg
          className="sim-chart"
          viewBox="0 0 640 280"
          role="img"
          aria-labelledby={id}
        >
          <title id={id}>
            Participants per condition versus width of the 95% simulation
            interval, in percentage points. Values are provided in the table
            below.
          </title>
          {[0, 0.5, 1].map((f) => (
            <g key={f}>
              <line
                x1="60"
                x2="590"
                y1={y(maxWidth * f)}
                y2={y(maxWidth * f)}
                stroke="#dce6df"
              />
              <text x="49" y={y(maxWidth * f) + 4} textAnchor="end">
                {(maxWidth * f).toFixed(1)}
              </text>
            </g>
          ))}
          <polyline
            fill="none"
            stroke="#176d60"
            strokeWidth="2"
            points={available
              .map(
                (r, i) => `${x(r.participants_per_condition)},${y(widths[i])}`,
              )
              .join(" ")}
          />
          {available.map((r, i) => (
            <g key={r.participants_per_condition}>
              <circle
                cx={x(r.participants_per_condition)}
                cy={y(widths[i])}
                r="5"
                fill="#176d60"
              >
                <title>
                  {r.participants_per_condition} per condition:{" "}
                  {widths[i].toFixed(2)} pp spread
                </title>
              </circle>
            </g>
          ))}
          <text x="60" y="233">
            {minN}
          </text>
          <text x="590" y="233" textAnchor="end">
            {maxN}
          </text>
          <text x="325" y="265" textAnchor="middle">
            Participants per condition (linear scale)
          </text>
          <text x="60" y="23">
            Simulation interval width (pp)
          </text>
        </svg>
      )}
      <div className="sim-table-wrap">
        <table>
          <thead>
            <tr>
              <th>Per condition / total</th>
              <th>Completed studies</th>
              <th>Mean difference (pp)</th>
              <th>95% simulation interval (pp)</th>
              <th>Spread (pp)</th>
            </tr>
          </thead>
          <tbody>
            {results.map((r) => {
              const d = r.difference_pp.peer_selection;
              return (
                <tr key={r.participants_per_condition}>
                  <td>
                    {r.participants_per_condition} /{" "}
                    {r.participants_per_condition * 2}
                  </td>
                  <td>{r.completed_repetitions}</td>
                  <td>{d.mean?.toFixed(2) ?? "—"}</td>
                  <td>
                    {d.low == null
                      ? "—"
                      : `${d.low.toFixed(2)} to ${d.high!.toFixed(2)}`}
                  </td>
                  <td>{d.low == null ? "—" : (d.high! - d.low).toFixed(2)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p>
        Larger samples can reduce random variability under the chosen model;
        they do not establish realism. Finite runs need not decrease
        monotonically. With one repetition, spread is not informative.
      </p>
    </section>
  );
}
