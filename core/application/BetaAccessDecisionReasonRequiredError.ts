export class BetaAccessDecisionReasonRequiredError extends Error {
  constructor() {
    super('Beta access decision reason is required')
    this.name = 'BetaAccessDecisionReasonRequiredError'
  }
}
