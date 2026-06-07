import { SetMetadata } from '@nestjs/common';
import { REQUIRE_STEP_UP } from '../guards/step-up.guard.js';

/** Mark an endpoint as requiring a recent step-up auth (5 min WebAuthn). */
export const RequireStepUp = (): MethodDecorator & ClassDecorator =>
  SetMetadata(REQUIRE_STEP_UP, true);
