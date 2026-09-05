export class BetaAccessRequestNotFoundError extends Error {
  constructor() {
    super('Beta access request not found')
    this.name = 'BetaAccessRequestNotFoundError'
  }
}
