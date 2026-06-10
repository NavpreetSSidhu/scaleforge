import { memo } from 'react';
import { Globe2 } from 'lucide-react';
import type { NodeProps } from 'reactflow';

export interface RegionNodeData {
  region: string;
  accent: string;
  count: number;
}

/**
 * A background container that visually groups all nodes assigned to a region.
 * Non-interactive — clicks pass through to the canvas and the nodes on top.
 */
function RegionNodeComponent({ data }: NodeProps<RegionNodeData>) {
  return (
    <div
      className="pointer-events-none relative h-full w-full rounded-2xl border-2 border-dashed"
      style={{ borderColor: `${data.accent}44`, background: `${data.accent}0a` }}
    >
      <span
        className="absolute left-3 top-2 inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-semibold uppercase tracking-wider"
        style={{ backgroundColor: `${data.accent}1f`, color: data.accent }}
      >
        <Globe2 className="h-3 w-3" />
        {data.region}
        <span className="font-mono opacity-70">· {data.count}</span>
      </span>
    </div>
  );
}

export default memo(RegionNodeComponent);
