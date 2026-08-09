import { NextResponse } from "next/server";
import { adminSupabase } from "@/lib/supabase";
import { authenticateAdminRequest } from "@/lib/adminAuth";
import {
  isMissingStoreRequestsTable,
  updateStoredStoreRequestStatus,
} from "@/lib/storeRequestStorage";

const allowedStatuses = new Set(["fulfilled", "rejected"]);

export async function POST(request) {
  try {
    if (!adminSupabase) {
      return NextResponse.json({ error: "Admin services are not configured." }, { status: 503 });
    }

    const adminAuth = await authenticateAdminRequest(request);
    if (!adminAuth.user) {
      return NextResponse.json({ error: adminAuth.error }, { status: adminAuth.status });
    }

    const { requestId, status } = await request.json();
    if (!requestId || !allowedStatuses.has(status)) {
      return NextResponse.json({ error: "Invalid store request update." }, { status: 400 });
    }

    let { data: updatedRequest, error: updateError } = await adminSupabase
      .from("store_requests")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", requestId)
      .eq("status", "pending")
      .select("id, status")
      .maybeSingle();

    if (isMissingStoreRequestsTable(updateError)) {
      const storedUpdate = await updateStoredStoreRequestStatus(requestId, status);
      updatedRequest = storedUpdate.data;
      updateError = storedUpdate.error;
    }

    if (updateError) {
      console.error("[Admin] Store request update failed:", updateError.message);
      return NextResponse.json({ error: "Could not update the store request." }, { status: 500 });
    }
    if (!updatedRequest) {
      return NextResponse.json({ error: "Pending store request not found." }, { status: 404 });
    }

    return NextResponse.json({ success: true, request: updatedRequest });
  } catch (error) {
    console.error("[Admin] Store request error:", error);
    return NextResponse.json({ error: "Could not update the store request." }, { status: 500 });
  }
}
