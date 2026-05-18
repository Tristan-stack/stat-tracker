import type { TracerType } from '@/types/address-trace';
import type { TracerStrategy } from './types';
import { sevenSrswTracer } from './seven-srsw';

const TRACERS: Record<TracerType, TracerStrategy> = {
  '7srsw': sevenSrswTracer,
};

export function getTracer(id: string): TracerStrategy | null {
  if (id in TRACERS) return TRACERS[id as TracerType];
  return null;
}

export function listTracers(): Array<{ id: TracerType; label: string }> {
  return Object.values(TRACERS).map((t) => ({ id: t.id, label: t.label }));
}

export function isTracerType(id: string): id is TracerType {
  return id in TRACERS;
}
