import { NextResponse } from "next/server";
import sharp from "sharp";
import { adminSupabase } from "@/lib/supabase";
import { enforceRateLimit } from "@/lib/rateLimit";
import {
  isMissingStoreRequestsTable,
  listStoredStoreRequests,
  saveStoredStoreRequest,
} from "@/lib/storeRequestStorage";

export const runtime = "nodejs";

const RECEIPT_BUCKET = "store_receipts";
const MAX_RECEIPT_BYTES = 5 * 1024 * 1024;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ALLOWED_RECEIPT_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

const paidProducts = new Map([
  ["DesaynScale", { type: "Sublimation Tool", price: "\u20B1950" }],
  ["Subli Autoresizer", { type: "Sublimation Tool", price: "\u20B1850" }],
  ["SubliBatch Pro", { type: "Sublimation Tool", price: "\u20B1850" }],
  ["SubliNest", { type: "Sublimation Tool", price: "\u20B1850" }],
  ["Mockups Bundle 70+", { type: "Mockup", price: "\u20B1499" }],
  ["Custom Design 1", { type: "Design Pack", price: "\u20B1149" }],
  ["Custom Design 2", { type: "Design Pack", price: "\u20B1149" }],
  ["Custom Design 3", { type: "Design Pack", price: "\u20B1149" }],
  ["Custom Design 4", { type: "Design Pack", price: "\u20B1149" }],
  ["Custom Design 5", { type: "Design Pack", price: "\u20B1149" }],
  ["Custom Design 6", { type: "Design Pack", price: "\u20B1149" }],
  ["Custom Design 7", { type: "Design Pack", price: "\u20B1149" }],
]);

function getBearerToken(request) {
  const authHeader = request.headers.get("authorization") || "";
  return authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
}

async function retryOnce(operation) {
  const firstResult = await operation();
  if (!firstResult?.error) return firstResult;
  return operation();
}

export async function POST(request) {
  let uploadedReceiptPath = null;

  try {
    if (!adminSupabase) {
      return NextResponse.json({ error: "Store requests are not configured yet." }, { status: 503 });
    }

    const token = getBearerToken(request);
    if (!token) {
      return NextResponse.json({ error: "Please log in before sending a purchase request." }, { status: 401 });
    }

    const { data: { user }, error: authError } = await adminSupabase.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json({ error: "Your session has expired. Please log in again." }, { status: 401 });
    }

    const rateLimit = await enforceRateLimit({
      namespace: "store-purchase-request",
      identifier: user.id,
      max: 10,
      window: "60 m",
      windowMs: 60 * 60_000,
    });
    if (!rateLimit.success) return rateLimit.response;

    const formData = await request.formData();
    const email = String(formData.get("email") || "").trim().toLowerCase();
    const productName = String(formData.get("productName") || "").trim();
    const receipt = formData.get("receipt");
    const product = paidProducts.get(productName);

    if (!product) {
      return NextResponse.json({ error: "This paid product is not available for purchase requests." }, { status: 400 });
    }
    if (!EMAIL_PATTERN.test(email)) {
      return NextResponse.json({ error: "Please enter a valid email address." }, { status: 400 });
    }
    if (!(receipt instanceof File) || receipt.size === 0) {
      return NextResponse.json({ error: "Please attach your GCash receipt image." }, { status: 400 });
    }
    if (receipt.size > MAX_RECEIPT_BYTES) {
      return NextResponse.json({ error: "Receipt image must be 5MB or smaller." }, { status: 400 });
    }
    if (!ALLOWED_RECEIPT_TYPES.has(receipt.type)) {
      return NextResponse.json({ error: "Receipt must be a JPG, PNG, or WebP image." }, { status: 400 });
    }

    let useStorageFallback = false;
    let { data: existingRequest, error: duplicateCheckError } = await adminSupabase
      .from("store_requests")
      .select("id")
      .eq("email", email)
      .eq("product_name", productName)
      .eq("status", "pending")
      .maybeSingle();

    if (isMissingStoreRequestsTable(duplicateCheckError)) {
      useStorageFallback = true;
      const { data: storedRequests, error: storedRequestsError } = await retryOnce(listStoredStoreRequests);
      if (storedRequestsError) {
        console.error("[Store Request] Storage duplicate check failed:", storedRequestsError.message);
        return NextResponse.json({ error: "Could not check your request. Please try again." }, { status: 500 });
      }
      existingRequest = (storedRequests || []).find((item) => (
        item.email === email
        && item.product_name === productName
        && item.status === "pending"
      ));
      duplicateCheckError = null;
    } else if (duplicateCheckError) {
      console.error("[Store Request] Duplicate check failed:", duplicateCheckError.message);
      return NextResponse.json({ error: "Could not check your request. Please try again." }, { status: 500 });
    }
    if (existingRequest) {
      return NextResponse.json({ error: "You already have a pending request for this product." }, { status: 409 });
    }

    let safeReceiptBuffer;
    try {
      const sourceBuffer = Buffer.from(await receipt.arrayBuffer());
      safeReceiptBuffer = await sharp(sourceBuffer, { limitInputPixels: 30_000_000 })
        .rotate()
        .resize({ width: 2400, height: 2400, fit: "inside", withoutEnlargement: true })
        .webp({ quality: 85 })
        .toBuffer();
    } catch {
      return NextResponse.json({ error: "The receipt image could not be read. Please upload another image." }, { status: 400 });
    }

    const month = new Date().toISOString().slice(0, 7);
    uploadedReceiptPath = `store/${month}/${crypto.randomUUID()}.webp`;
    const uploadReceipt = () => adminSupabase.storage
      .from(RECEIPT_BUCKET)
      .upload(uploadedReceiptPath, safeReceiptBuffer, {
        contentType: "image/webp",
        cacheControl: "3600",
        upsert: false,
      });
    const { error: uploadError } = await retryOnce(uploadReceipt);

    if (uploadError) {
      console.error("[Store Request] Receipt upload failed:", uploadError.message);
      return NextResponse.json({ error: "Could not upload the receipt. Please try again." }, { status: 500 });
    }

    const requestRecord = {
      id: crypto.randomUUID(),
      user_id: user.id,
      email,
      product_name: productName,
      product_type: product.type,
      price: product.price,
      receipt_url: uploadedReceiptPath,
      status: "pending",
      created_at: new Date().toISOString(),
    };

    const { data: insertedRequest, error: insertError } = useStorageFallback
      ? await retryOnce(() => saveStoredStoreRequest(requestRecord))
      : await adminSupabase
        .from("store_requests")
        .insert(requestRecord)
        .select("id")
        .single();

    if (insertError) {
      await adminSupabase.storage.from(RECEIPT_BUCKET).remove([uploadedReceiptPath]);
      console.error("[Store Request] Insert failed:", insertError.message);
      return NextResponse.json({ error: "Could not submit the request. Please try again." }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      requestId: insertedRequest.id,
      message: "Purchase request sent. Your receipt will be checked manually.",
    });
  } catch (error) {
    if (uploadedReceiptPath && adminSupabase) {
      await adminSupabase.storage.from(RECEIPT_BUCKET).remove([uploadedReceiptPath]).catch(() => {});
    }
    console.error("[Store Request] Error:", error);
    return NextResponse.json({ error: "Could not submit the request. Please try again." }, { status: 500 });
  }
}
