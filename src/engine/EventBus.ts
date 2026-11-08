type Handler<T> = (payload: T) => void;

/** Minimal typed pub/sub used to decouple gameplay systems from UI and each other. */
export class EventBus<Events extends object> {
  private readonly handlers = new Map<keyof Events, Set<Handler<never>>>();

  on<K extends keyof Events>(event: K, handler: Handler<Events[K]>): () => void {
    let set = this.handlers.get(event);
    if (!set) {
      set = new Set();
      this.handlers.set(event, set);
    }
    const entry = handler as Handler<never>;
    set.add(entry);
    return () => set.delete(entry);
  }

  emit<K extends keyof Events>(event: K, payload: Events[K]): void {
    this.handlers.get(event)?.forEach((h) => (h as Handler<Events[K]>)(payload));
  }

  clear(): void {
    this.handlers.clear();
  }
}
