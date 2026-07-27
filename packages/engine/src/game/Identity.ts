/**
 * Stable identity carried by a runtime simulation object.
 *
 * `runtimeId` is unique within one running scene and is what tooling keys an
 * inspection or a selection on. For an object built from an authored entity it
 * is the authored object's stable id, so `sourceEntityId` equals it; for a runtime-only
 * object (a projectile) it is a deterministic counter-derived id with no
 * authored source. `definitionId` is an authoring concept (see
 * @mmx/content-schema) and is left unset by the engine.
 */
export interface RuntimeIdentity {
  runtimeId: string;
  sourceEntityId?: string;
  definitionId?: string;
}
