import { geoConicConformal, geoPath } from "d3-geo";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import { useMemo, useState } from "react";
import { feature, mesh } from "topojson-client";
import type { Topology } from "topojson-specification";
import counties from "us-atlas/counties-10m.json";
import states from "us-atlas/states-10m.json";
import type { YardId } from "../engine/types";
import { YARDS } from "../engine/yards";
import { num, pct, riskColor } from "../lib/format";

/**
 * Operation map drawn from US Census cartographic boundaries (us-atlas, ISC licence; public-domain
 * Census data). TX + KS counties provide texture; each yard marker scales with head in the 45-day
 * window and is coloured by head-weighted BRD risk.
 */
const REGION_STATES = new Set(["48", "20", "40", "35", "08", "31", "29", "05", "22"]);
const COUNTY_STATES = new Set(["48", "20", "40"]);

export interface YardMapDatum {
  id: YardId;
  head: number;
  risk: number;
  scheduled: number;
}

export function YardMap({ data, selected, onSelect, height = 420 }: { data: YardMapDatum[]; selected?: YardId | null; onSelect?: (id: YardId) => void; height?: number }) {
  const width = 640;
  const [hover, setHover] = useState<YardId | null>(null);
  const geo = useMemo(() => {
    const st = states as unknown as Topology;
    const ct = counties as unknown as Topology;
    const stateFc = feature(st, st.objects.states) as unknown as FeatureCollection<Geometry, { name: string }>;
    const region = stateFc.features.filter((f) => REGION_STATES.has(String(f.id)));
    const countyFc = feature(ct, ct.objects.counties) as unknown as FeatureCollection;
    const cs = countyFc.features.filter((f) => COUNTY_STATES.has(String(f.id).slice(0, 2)));
    const focus: FeatureCollection = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: {},
          geometry: { type: "MultiPoint", coordinates: [[-106.6, 32.2], [-95.6, 39.6], [-106.6, 39.6], [-95.6, 32.2]] },
        },
      ],
    };
    const projection = geoConicConformal().parallels([33, 45]).rotate([100, 0]).fitExtent([[10, 10], [width - 10, height - 10]], focus);
    const path = geoPath(projection);
    const borders = mesh(st, st.objects.states as never, (a: unknown, b: unknown) => a !== b);
    return { region, cs, projection, path, borders };
  }, [height]);

  const maxHead = Math.max(1, ...data.map((d) => d.head));
  const stateLabels: Record<string, [number, number]> = { "48": [-99.0, 32.6], "20": [-97.4, 38.6], "40": [-97.4, 35.4], "35": [-105.4, 34.6], "08": [-105.2, 39.0], "31": [-98.5, 40.2] };
  const names: Record<string, string> = { "48": "TEXAS", "20": "KANSAS", "40": "OKLAHOMA", "35": "NEW MEXICO", "08": "COLORADO", "31": "NEBRASKA" };

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" role="img" aria-label="Map of the four feedyards">
      <defs>
        <clipPath id="map-clip">
          <rect x="0" y="0" width={width} height={height} rx="12" />
        </clipPath>
        <radialGradient id="map-vignette" cx="50%" cy="50%" r="70%">
          <stop offset="60%" stopColor="var(--panel)" stopOpacity="0" />
          <stop offset="100%" stopColor="var(--panel)" stopOpacity="0.9" />
        </radialGradient>
      </defs>
      <g clipPath="url(#map-clip)">
        <rect width={width} height={height} fill="var(--panel-2)" />
        {geo.region.map((f) => (
          <path key={String(f.id)} d={geo.path(f as Feature) ?? ""} fill={COUNTY_STATES.has(String(f.id)) ? "var(--panel)" : "var(--bg)"} />
        ))}
        {geo.cs.map((f) => (
          <path key={String(f.id)} d={geo.path(f as Feature) ?? ""} fill="none" stroke="var(--line)" strokeWidth={0.5} />
        ))}
        <path d={geo.path(geo.borders as never) ?? ""} fill="none" stroke="var(--line-strong)" strokeWidth={1.4} />
        {Object.entries(stateLabels).map(([id, ll]) => {
          const p = geo.projection(ll as [number, number]);
          return p ? (
            <text key={id} x={p[0]} y={p[1]} textAnchor="middle" className="fill-[color:var(--ink-3)]" style={{ fontSize: 11, letterSpacing: "0.25em", fontWeight: 600, opacity: 0.55 }}>
              {names[id]}
            </text>
          ) : null;
        })}
        <rect width={width} height={height} fill="url(#map-vignette)" pointerEvents="none" />
        {/* Largest first, so smaller bubbles sit on top where they touch and stay clickable. */}
        {[...YARDS].sort((a, b) => (data.find((x) => x.id === b.id)?.head ?? 0) - (data.find((x) => x.id === a.id)?.head ?? 0)).map((y) => {
          const d = data.find((x) => x.id === y.id);
          const p = geo.projection([y.lon, y.lat]);
          if (!p || !d) return null;
          const r = 8 + 18 * Math.sqrt(d.head / maxHead);
          const active = selected === y.id || hover === y.id;
          const labelLeft = y.id === "arkansas-river";
          const labelBelow = y.id === "llano";
          return (
            <g
              key={y.id}
              transform={`translate(${p[0]},${p[1]})`}
              className="cursor-pointer"
              onMouseEnter={() => setHover(y.id)}
              onMouseLeave={() => setHover(null)}
              onClick={() => onSelect?.(y.id)}
            >
              <circle r={r} fill={riskColor(d.risk)} opacity={0.25} className="pulse-ring" pointerEvents="none" />
              <circle r={r} fill={riskColor(d.risk)} opacity={active ? 0.95 : 0.8} stroke={selected === y.id ? "var(--ink)" : "var(--panel)"} strokeWidth={selected === y.id ? 3 : 2.5} />
              <text textAnchor="middle" dy="0.35em" className="num" style={{ fontSize: 11, fontWeight: 700, fill: "#fff" }}>
                {pct(d.risk)}
              </text>
              <g transform={`translate(${labelLeft ? -(r + 8) : r + 8}, ${labelBelow ? 10 : -4})`}>
                <text textAnchor={labelLeft ? "end" : "start"} style={{ fontSize: 13, fontWeight: 650, fill: "var(--ink)", paintOrder: "stroke", stroke: "var(--panel)", strokeWidth: 4 }}>
                  {y.name}
                </text>
                <text y={15} textAnchor={labelLeft ? "end" : "start"} style={{ fontSize: 11, fill: "var(--ink-3)", paintOrder: "stroke", stroke: "var(--panel)", strokeWidth: 4 }}>
                  {y.town}, {y.state} · {num(d.head)} head in window · {d.scheduled} lots inbound
                </text>
              </g>
            </g>
          );
        })}
      </g>
    </svg>
  );
}
