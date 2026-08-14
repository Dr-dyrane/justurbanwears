import {
  get,
  put,
  type GetBlobResult,
  type GetCommandOptions,
  type PutBlobResult,
  type PutCommandOptions,
} from "@vercel/blob";

export type ShopBlobAccess = "public" | "private";
export type ShopBlobPutBody = Parameters<typeof put>[1];
export type ShopBlobPutOptions = Omit<
  PutCommandOptions,
  "access" | "oidcToken" | "storeId" | "token"
>;

const blobTokenEnvironmentNames = {
  public: "PUBLIC_BLOB_READ_WRITE_TOKEN",
  private: "PRIVATE_BLOB_READ_WRITE_TOKEN",
} as const satisfies Record<ShopBlobAccess, string>;

export function getShopBlobToken(access: ShopBlobAccess): string {
  if (typeof window !== "undefined") {
    throw new Error("Vercel Blob credentials are available only on the server.");
  }

  const environmentName = blobTokenEnvironmentNames[access];
  const token = process.env[environmentName];

  if (!token) {
    throw new Error(
      `The ${access} Vercel Blob store is not configured. Provide ${environmentName} for this environment.`,
    );
  }

  return token;
}

export function putShopBlob(
  access: ShopBlobAccess,
  pathname: string,
  body: ShopBlobPutBody,
  options: ShopBlobPutOptions = {},
): Promise<PutBlobResult> {
  return put(pathname, body, {
    ...options,
    access,
    token: getShopBlobToken(access),
  });
}

export function getShopBlob(
  access: ShopBlobAccess,
  pathname: string,
  options: Omit<GetCommandOptions, "access" | "oidcToken" | "storeId" | "token"> = {},
): Promise<GetBlobResult | null> {
  return get(pathname, {
    ...options,
    access,
    token: getShopBlobToken(access),
  });
}
