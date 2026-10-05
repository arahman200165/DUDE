import { useState } from 'react';
import type { ActionResult, DestructivePreview } from '../state/workbench-model';
import { ActionButton, Button, Label, Section } from './primitives';

/** Preview never commits. Only a distinct user press can cross the confirmation boundary. */
export function GuardedAction({ title, confirmTitle, explanation, disabled, preview, confirm }: {
  readonly title: string; readonly confirmTitle: string; readonly explanation: string; readonly disabled?: boolean;
  readonly preview: () => Promise<ActionResult<DestructivePreview>>;
  readonly confirm: (token: string) => Promise<ActionResult>;
}) {
  const [review, setReview] = useState<DestructivePreview>();
  return <Section title={title}>
    <Label muted>{explanation}</Label>
    <ActionButton title={`Preview ${title.toLowerCase()}`} disabled={disabled} onPress={async () => {
      const result = await preview();
      if (!result.ok) { setReview(undefined); return result; }
      setReview(result.value);
      return { ok: true, value: undefined };
    }} />
    {review && <Section title="Review before confirming">
      <Label>{review.records ?? 'Cached'} records · {review.pending} pending edits</Label>
      {review.targetRecords !== undefined && <Label>Standalone destination: {review.targetRecords} records · {review.targetPending ?? 0} pending edits. Matching values will be replaced; its previous data is saved in a recovery copy first.</Label>}
      <Label>Pending edits may include requests whose delivery is uncertain. A durable recovery copy is saved before any local data or key is removed.</Label>
      <Label muted>This preview expires after {review.expiresInSeconds ?? 60} seconds. A change to the context requires a fresh preview.</Label>
      <ActionButton title={confirmTitle} disabled={disabled} onPress={async () => {
        const result = await confirm(review.token);
        // A confirmation is single use even when an action fails. Keep failure visible and require another preview.
        setReview(undefined);
        return result;
      }} />
      <Button title="Cancel preview" onPress={() => setReview(undefined)} />
    </Section>}
  </Section>;
}
