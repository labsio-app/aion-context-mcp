export class InvalidBetaAccessTransitionError extends Error {
  constructor() {
    super('Invalid beta access transition')
    this.name = 'InvalidBetaAccessTransitionError'
  }
}
