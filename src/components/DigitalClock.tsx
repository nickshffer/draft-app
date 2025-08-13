import { DigitalClockProps } from '../types';

export default function DigitalClock({ minutes, seconds }: DigitalClockProps) {
  return (
    <div className="inline-block bg-black border-2 border-gray-600 px-2 py-1">
      <span className="font-mono text-green-400">
        {String(minutes).padStart(2, '0')}:{String(seconds).toString().padStart(2, '0')}
      </span>
    </div>
  );
}
