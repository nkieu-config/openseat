import { apiBaseUrl, getAccessToken, refreshSession } from "./api";

export type GraphqlErrorItem = {
  message: string;
  extensions?: { code?: string };
};

export class GraphqlError extends Error {
  readonly errors: GraphqlErrorItem[];
  constructor(errors: GraphqlErrorItem[]) {
    super(errors[0]?.message ?? "GraphQL request failed");
    this.name = "GraphqlError";
    this.errors = errors;
  }
}

type GraphqlResponse<T> = { data?: T; errors?: GraphqlErrorItem[] };

function isUnauthenticated(errors: GraphqlErrorItem[] | undefined): boolean {
  return Boolean(
    errors?.some(
      (error) =>
        error.extensions?.code === "UNAUTHENTICATED" ||
        error.message === "Unauthorized",
    ),
  );
}

export function isForbiddenError(error: unknown): boolean {
  return (
    error instanceof GraphqlError &&
    error.errors.some(
      (item) =>
        item.extensions?.code === "FORBIDDEN" ||
        /does not allow/i.test(item.message),
    )
  );
}

export function isNotFoundError(error: unknown): boolean {
  return (
    error instanceof GraphqlError &&
    error.errors.some(
      (item) =>
        item.extensions?.code === "NOT_FOUND" || /not found/i.test(item.message),
    )
  );
}

export async function gqlRequest<T>(
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const send = async (token: string | null): Promise<GraphqlResponse<T>> => {
    const response = await fetch(`${apiBaseUrl}/api/graphql`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      credentials: "include",
      body: JSON.stringify({ query, variables }),
    });
    return (await response.json()) as GraphqlResponse<T>;
  };

  let body = await send(getAccessToken());
  if (isUnauthenticated(body.errors)) {
    const session = await refreshSession();
    if (session) {
      body = await send(session.accessToken);
    }
  }
  if (body.errors?.length) {
    throw new GraphqlError(body.errors);
  }
  if (!body.data) {
    throw new GraphqlError([{ message: "No data returned" }]);
  }
  return body.data;
}
