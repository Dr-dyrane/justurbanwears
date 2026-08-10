export const storagePaths = {
  modelSource: (modelId: string) => `models/${modelId}/source/`,
  modelCanonical: (modelId: string) => `models/${modelId}/canonical/`,
  modelRegression: (modelId: string) => `models/${modelId}/regression/`,
  garmentSource: (sku: string) => `garments/${sku}/source/`,
  garmentCanonical: (sku: string) => `garments/${sku}/canonical/`,
  shootGenerated: (shootId: string) => `shoots/${shootId}/generated/`,
  shootApproved: (shootId: string) => `shoots/${shootId}/approved/`,
  shootExports: (shootId: string) => `shoots/${shootId}/exports/`,
};
