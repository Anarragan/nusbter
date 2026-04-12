export class SearchLimit {
  private constructor(public readonly value: number) {}

  static create(value: number = 10): SearchLimit {
    if (value < 1 || value > 50) {
      throw new Error('Limit must be between 1 and 50')
    }

    return new SearchLimit(value)
  }
}