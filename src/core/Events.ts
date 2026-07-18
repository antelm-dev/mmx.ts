/** Minimal signal/event emitter, standing in for Godot's signal system. */
export type Listener = (...args: any[]) => void;

export class EventBus {
  private listeners = new Map<string, Listener[]>();

  on(event: string, fn: Listener): void {
    const arr = this.listeners.get(event) ?? [];
    arr.push(fn);
    this.listeners.set(event, arr);
  }

  emit(event: string, ...args: any[]): void {
    const arr = this.listeners.get(event);
    if (!arr) return;
    for (const fn of arr) fn(...args);
  }
}
