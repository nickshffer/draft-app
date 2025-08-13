import { PositionBadgeProps } from '../types';
import { positionBadgeColors } from '../styles/colors';

export default function PositionBadge({ pos }: PositionBadgeProps) {
  const colors = positionBadgeColors[pos] || { bg: "#9CA3AF", text: "#000000" };
  
  return (
    <span 
      className="inline-flex items-center justify-center px-1 text-[10px] font-bold" 
      style={{ 
        backgroundColor: colors.bg, 
        color: colors.text,
        border: "1px solid #000000",
        width: "28px",
        height: "16px",
        lineHeight: "16px",
        verticalAlign: "middle",
        textAlign: "center",
        display: "inline-flex"
      }}
    >
      {pos}
    </span>
  );
}
