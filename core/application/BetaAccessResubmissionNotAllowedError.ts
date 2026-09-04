export class BetaAccessResubmissionNotAllowedError extends Error {
  constructor() {
    super('Beta access resubmission is not allowed')
    this.name = 'BetaAccessResubmissionNotAllowedError'
  }
}
