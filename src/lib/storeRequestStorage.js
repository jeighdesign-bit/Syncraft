import { adminSupabase } from "@/lib/supabase";

export const STORE_REQUEST_RECORD_BUCKET = "store_request_records";
const REQUESTS_FOLDER = "requests";

export function isMissingStoreRequestsTable(error) {
  if (!error) return false;
  return error.code === "PGRST205"
    || error.code === "42P01"
    || /store_requests.*(schema cache|does not exist|not found)/i.test(error.message || "");
}

function requestPath(requestId) {
  return `${REQUESTS_FOLDER}/${requestId}.json`;
}

export async function listStoredStoreRequests() {
  const { data: files, error: listError } = await adminSupabase.storage
    .from(STORE_REQUEST_RECORD_BUCKET)
    .list(REQUESTS_FOLDER, {
      limit: 1000,
      offset: 0,
      sortBy: { column: "created_at", order: "desc" },
    });

  if (listError) return { data: null, error: listError };

  const records = await Promise.all(
    (files || [])
      .filter((file) => file.name.endsWith(".json"))
      .map(async (file) => {
        const { data, error } = await adminSupabase.storage
          .from(STORE_REQUEST_RECORD_BUCKET)
          .download(`${REQUESTS_FOLDER}/${file.name}`);
        if (error || !data) return null;

        try {
          return JSON.parse(await data.text());
        } catch {
          return null;
        }
      })
  );

  return {
    data: records
      .filter(Boolean)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at)),
    error: null,
  };
}

export async function saveStoredStoreRequest(record) {
  const body = Buffer.from(JSON.stringify(record));
  const { error } = await adminSupabase.storage
    .from(STORE_REQUEST_RECORD_BUCKET)
    .upload(requestPath(record.id), body, {
      contentType: "application/json",
      cacheControl: "no-store",
      upsert: false,
    });

  return { data: error ? null : record, error };
}

export async function updateStoredStoreRequestStatus(requestId, status) {
  const path = requestPath(requestId);
  const { data: file, error: downloadError } = await adminSupabase.storage
    .from(STORE_REQUEST_RECORD_BUCKET)
    .download(path);

  if (downloadError || !file) {
    return { data: null, error: downloadError || new Error("Store request not found.") };
  }

  let current;
  try {
    current = JSON.parse(await file.text());
  } catch {
    return { data: null, error: new Error("Store request record is invalid.") };
  }

  if (current.status !== "pending") return { data: null, error: null };

  const updated = {
    ...current,
    status,
    updated_at: new Date().toISOString(),
  };
  const { error: uploadError } = await adminSupabase.storage
    .from(STORE_REQUEST_RECORD_BUCKET)
    .upload(path, Buffer.from(JSON.stringify(updated)), {
      contentType: "application/json",
      cacheControl: "no-store",
      upsert: true,
    });

  return { data: uploadError ? null : updated, error: uploadError };
}
