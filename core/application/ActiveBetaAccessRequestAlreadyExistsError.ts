export class ActiveBetaAccessRequestAlreadyExistsError extends Error {
  constructor() {
    super('Active beta access request already exists')
    this.name = 'ActiveBetaAccessRequestAlreadyExistsError'
  }
}
