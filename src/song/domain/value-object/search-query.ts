export class SearchQuery {
  private constructor(public readonly value: string) {}

  static create(value: string): SearchQuery {
    if (!value?.trim()) {
      throw new Error('Search query cannot be empty')
    }

    return new SearchQuery(value.trim())
  }
}