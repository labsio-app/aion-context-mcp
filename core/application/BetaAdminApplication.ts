import { z } from 'zod'
import type {
  BetaAccessDecisionRecord,
  BetaAccessReviewFilter,
  BetaAccessReviewRecord,
  BetaAdminStore,
  DiscordIdentityRecord
} from './ports.js'
import { BetaAccessDecisionReasonRequiredError } from './BetaAccessDecisionReasonRequiredError.js'
import { BetaAccessRequestNotFoundError } from './BetaAccessRequestNotFoundError.js'
import { InvalidBetaAccessTransitionError } from './InvalidBetaAccessTransitionError.js'

const reasonSchema = z.string().trim().min(1).max(2000)

export interface BetaAccessDecisionResult {
  request: BetaAccessReviewRecord
  decision: BetaAccessDecisionRecord
}

export interface AdminActionInput {
  requestId: string
  adminIdentity: DiscordIdentityRecord
  reason?: string | null
}

export class BetaAdminApplication {
  constructor(private readonly store: BetaAdminStore) {}

  listBetaAccessRequests(filter: BetaAccessReviewFilter = 'PENDING') {
    return this.store.listBetaAccessRequests(filter)
  }

  getBetaAccessRequestForReview(requestId: string) {
    return this.store.getBetaAccessRequestById(requestId)
  }

  async approveBetaAccessRequest(input: AdminActionInput): Promise<BetaAccessDecisionResult> {
    return this.reviewTransition(input, 'PENDING', 'APPROVED', null)
  }

  async rejectBetaAccessRequest(input: AdminActionInput): Promise<BetaAccessDecisionResult> {
    return this.reviewTransition(input, 'PENDING', 'REJECTED', input.reason)
  }

  async revokeBetaAccess(input: AdminActionInput): Promise<BetaAccessDecisionResult> {
    return this.reviewTransition(input, 'APPROVED', 'REVOKED', input.reason)
  }

  private async reviewTransition(
    input: AdminActionInput,
    fromStatus: BetaAccessReviewRecord['request']['status'],
    toStatus: BetaAccessReviewRecord['request']['status'],
    reason: string | null | undefined
  ): Promise<BetaAccessDecisionResult> {
    const request = await this.store.getBetaAccessRequestById(input.requestId)
    if (!request) {
      throw new BetaAccessRequestNotFoundError()
    }

    if (request.request.status !== fromStatus) {
      throw new InvalidBetaAccessTransitionError()
    }

    const normalizedReason =
      reason == null || String(reason).trim() === '' ? null : reasonSchema.parse(reason)

    if (toStatus !== 'APPROVED' && !normalizedReason) {
      throw new BetaAccessDecisionReasonRequiredError()
    }

    if (toStatus === 'APPROVED') {
      if (normalizedReason != null) {
        // Ignore approve reasons in the current MVP; approval remains optional.
      }
    }

    try {
      return await this.store.transitionBetaAccessRequest({
        requestId: input.requestId,
        adminDiscordIdentityId: input.adminIdentity.id,
        fromStatus,
        toStatus,
        reason: normalizedReason
      })
    } catch (cause) {
      if (cause instanceof BetaAccessRequestNotFoundError || cause instanceof InvalidBetaAccessTransitionError) {
        throw cause
      }

      throw new InvalidBetaAccessTransitionError()
    }
  }
}
