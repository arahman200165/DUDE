export interface SchemaTypeRule {
  readonly required: readonly string[];
  readonly recommended: readonly string[];
}

/** A deliberately small set of the most commonly-used Schema.org types (not the full ~800-type vocabulary) -- required/recommended properties per Google's Rich Results / schema.org guidance. */
export const SCHEMA_RULES: Readonly<Record<string, SchemaTypeRule>> = {
  Article: { required: ['headline', 'author', 'datePublished'], recommended: ['image', 'publisher', 'dateModified'] },
  NewsArticle: { required: ['headline', 'author', 'datePublished'], recommended: ['image', 'publisher', 'dateModified'] },
  BlogPosting: { required: ['headline', 'author', 'datePublished'], recommended: ['image', 'publisher', 'dateModified'] },
  Product: { required: ['name'], recommended: ['image', 'description', 'sku', 'offers'] },
  Organization: { required: ['name'], recommended: ['url', 'logo'] },
  Person: { required: ['name'], recommended: ['url', 'image'] },
  WebSite: { required: ['name', 'url'], recommended: [] },
  Recipe: { required: ['name', 'recipeIngredient', 'recipeInstructions'], recommended: ['image', 'author'] },
  Event: { required: ['name', 'startDate', 'location'], recommended: ['endDate', 'image'] },
  BreadcrumbList: { required: ['itemListElement'], recommended: [] },
  FAQPage: { required: ['mainEntity'], recommended: [] },
  LocalBusiness: { required: ['name', 'address'], recommended: ['telephone', 'openingHours'] },
  VideoObject: { required: ['name', 'description', 'uploadDate', 'thumbnailUrl'], recommended: ['duration', 'contentUrl'] },
  JobPosting: { required: ['title', 'description', 'datePosted', 'hiringOrganization'], recommended: ['validThrough', 'employmentType'] },
};
