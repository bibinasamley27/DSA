// Placeholder owned by Person C: replace the body, keep the default export and the useSimState() data source.
import { useSimState } from '../net/connection';

export default function ControllerPage() {
  const { snapshot } = useSimState();
  return (
    <section>
      <h2>Controller</h2>
      <p>Controller visualisation is Person C's page. Shared snapshot: {snapshot ? `tick ${snapshot.tick}, run ${snapshot.run_id.slice(0, 8)}` : 'none yet'}.</p>
    </section>
  );
}
