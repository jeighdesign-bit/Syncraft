import test from "node:test";
import assert from "node:assert/strict";
import { createArtworkEditService, artworkEditInput, ARTWORK_EDIT_MODEL, ARTWORK_EDIT_COST } from "../src/lib/artworkEditService.mjs";

const requestId = "55b20a4e-1bfa-4f59-8576-92c764f67675";
function fixture(overrides = {}) {
  let project = { id: "project", user_id: "owner", original_image_url: "upload", generated_image_url: "flat", upscaled_image_url: "hd", svg_url: "vector", zip_url: "zip", canvas_data: { universal_recovery: { mode: "keep_all" } } };
  const calls = { charge: 0, submit: 0, refund: 0, save: 0 };
  const dependencies = {
    load: async () => structuredClone(project),
    cas: async (previous, patch) => {
      if (JSON.stringify(previous.canvas_data) !== JSON.stringify(project.canvas_data) || previous.generated_image_url !== project.generated_image_url) return null;
      project = { ...project, ...structuredClone(patch) };
      return structuredClone(project);
    },
    validateSource: async () => {}, sourceUrl: async () => "signed-reference",
    charge: async () => { calls.charge++; return { transactionId: "charge", isOwnerTest: false, replayed: false }; },
    submit: async () => { calls.submit++; return { request_id: "fal-job" }; },
    status: async () => ({ status: "COMPLETED" }), result: async () => ({ url: "provider-output" }),
    save: async () => { calls.save++; return "edited"; },
    refund: async () => { calls.refund++; return { refunded: true }; }, verifyJob: async () => {}, mark: async () => {}, usage: async () => {},
    ...overrides,
  };
  const service = createArtworkEditService(dependencies);
  const input = { projectId: "project", actorId: "owner", sourceUrl: "flat", prompt: "Remove the small text", requestId };
  return { service, input, calls, project: () => project, setProject: value => { project = value; } };
}

test("preview is charged once, survives reconnect, and leaves all current output files intact", async () => {
  const f = fixture();
  const queued = await f.service.generate(f.input);
  assert.equal(queued.pending.requestId, requestId);
  const preview = await f.service.generate(f.input);
  assert.equal(preview.candidate.imageUrl, "edited");
  assert.equal(preview.project.generated_image_url, "flat");
  assert.equal(preview.project.svg_url, "vector");
  await f.service.generate(f.input);
  assert.equal(f.calls.charge, 1); assert.equal(f.calls.submit, 1);
  assert.equal(ARTWORK_EDIT_COST, 8); assert.equal(ARTWORK_EDIT_MODEL, "fal-ai/nano-banana-pro/edit");
});

test("comment-only edits send artwork-relative locations to the provider and preserve comments for review", async () => {
  let submitted;
  const f = fixture({ submit: async input => { submitted = input; return { request_id: "fal-job" }; } });
  const comments = [{ x: .25, y: .8, text: "Replace this text with Champions" }];
  await f.service.generate({ ...f.input, prompt: "", comments });
  assert.match(submitted.prompt, /x=25.00%, y=80.00%: Replace this text with Champions/);
  assert.match(submitted.prompt, /keep unrelated areas unchanged/);
  assert.deepEqual(submitted.image_urls, ["signed-reference"]);
  const preview = await f.service.read("project");
  assert.deepEqual(preview.candidate.comments, comments);
  assert.equal(f.calls.charge, 1);
});

test("invalid or unfinished comments are refused before billing", async () => {
  for (const comments of [null, {}, [{ x: 1.01, y: .5, text: "Change" }], [{ x: .5, y: NaN, text: "Change" }], [{ x: .5, y: .5, text: " " }], [{ x: .5, y: .5, text: "a".repeat(301) }], Array.from({ length: 9 }, () => ({ x: 0, y: 1, text: "Change" }))]) {
    const f = fixture();
    await assert.rejects(f.service.generate({ ...f.input, comments }), error => error.status === 400);
    assert.equal(f.calls.charge, 0);
    assert.equal(f.calls.submit, 0);
  }
});

test("changing a comment under a submitted request ID cannot bill or submit again", async () => {
  const f = fixture();
  const input = { ...f.input, comments: [{ x: .1, y: .2, text: "Remove this" }] };
  await f.service.generate(input);
  await f.service.generate(input);
  await assert.rejects(f.service.generate({ ...input, comments: [{ x: .3, y: .2, text: "Remove this" }] }), /another edit/);
  assert.equal(f.calls.charge, 1);
  assert.equal(f.calls.submit, 1);
});

test("apply and restore preserve the original and unrelated metadata while invalidating derived exports", async () => {
  const f = fixture(); await f.service.generate(f.input); await f.service.read("project");
  const applied = await f.service.change({ projectId: "project", action: "accept", editId: requestId, sourceUrl: "flat" });
  assert.equal(applied.project.generated_image_url, "edited");
  assert.equal(applied.project.original_image_url, "upload");
  assert.deepEqual(applied.project.canvas_data.universal_recovery, { mode: "keep_all" });
  for (const field of ["upscaled_image_url", "svg_url", "zip_url", "zip_signature", "zip_generated_at"]) assert.equal(applied.project[field], null);
  assert.equal(applied.versions.length, 2);
  const restored = await f.service.change({ projectId: "project", action: "restore", editId: applied.versions[0].id, sourceUrl: "edited" });
  assert.equal(restored.project.generated_image_url, "flat");
  assert.equal(f.calls.charge, 1);
});

test("discard does not overwrite output or refund successful paid work", async () => {
  const f = fixture(); await f.service.generate(f.input); await f.service.read("project");
  await f.service.change({ projectId: "project", action: "discard", editId: requestId });
  assert.equal(f.project().generated_image_url, "flat"); assert.equal(f.calls.refund, 0);
});

test("two concurrent requests cannot submit or bill twice", async () => {
  const f = fixture({ status: async () => ({ status: "IN_QUEUE" }) });
  await Promise.allSettled([f.service.generate(f.input), f.service.generate({ ...f.input, requestId: "different-request-12345" })]);
  assert.equal(f.calls.charge, 1); assert.equal(f.calls.submit, 1);
});

test("stale apply cannot replace artwork changed in another tab", async () => {
  const f = fixture(); await f.service.generate(f.input); await f.service.read("project");
  f.setProject({ ...f.project(), generated_image_url: "another-output" });
  await assert.rejects(f.service.change({ projectId: "project", action: "accept", editId: requestId, sourceUrl: "flat" }), /changed/);
  assert.equal(f.project().generated_image_url, "another-output");
});

test("a definite provider rejection is refunded once and never resubmitted by replay", async () => {
  const f = fixture({ submit: async () => { throw Object.assign(new Error("Rejected"), { definiteRejection: true }); } });
  await assert.rejects(f.service.generate(f.input), /refunded/);
  await f.service.generate(f.input); await f.service.read("project");
  assert.equal(f.calls.refund, 1); assert.equal(f.calls.charge, 1);
});

test("ambiguous submission stays reserved and cannot cause another paid request", async () => {
  const f = fixture({ submit: async () => { throw new Error("Network lost"); } });
  await assert.rejects(f.service.generate(f.input), /not confirm/);
  await assert.rejects(f.service.generate(f.input), /not confirmed/);
  await assert.rejects(f.service.generate({ ...f.input, requestId: "another-request-12345" }), /saved edit/);
  assert.equal(f.calls.charge, 1); assert.equal(f.calls.refund, 0);
});

test('unconfirmed submissions persist the transport cause for a safe later recovery', async () => {
  const f = fixture({ submit: async () => {
    throw Object.assign(new TypeError('fetch failed', { cause: { code: 'UND_ERR_SOCKET' } }), { elapsedMs: 1234 });
  } });
  await assert.rejects(f.service.generate(f.input), error => {
    assert.equal(error.code, 'ARTWORK_EDIT_SUBMISSION_UNCONFIRMED');
    assert.equal(error.diagnostic.causeCode, 'UND_ERR_SOCKET');
    return true;
  });
  assert.equal(f.project().canvas_data.artwork_edits.jobs[0].submissionFailure.elapsedMs, 1234);
  assert.equal(f.calls.refund, 0);
  assert.equal(f.project().generated_image_url, 'flat');
});

test("a storage outage recovers the same completed provider result without another charge", async () => {
  let attempts = 0;
  const f = fixture({ save: async () => { if (++attempts === 1) throw new Error("Storage outage"); return "edited"; } });
  await f.service.generate(f.input);
  await assert.rejects(f.service.read("project"), /Storage outage/);
  const recovered = await f.service.read("project");
  assert.equal(recovered.candidate.imageUrl, "edited");
  assert.equal(f.calls.charge, 1); assert.equal(f.calls.submit, 1);
});

test("no image from a completed provider refunds the edit and preserves existing artwork", async () => {
  const f = fixture({ result: async () => null });
  await f.service.generate(f.input); await assert.rejects(f.service.read("project"), /refunded/);
  assert.equal(f.calls.refund, 1); assert.equal(f.project().generated_image_url, "flat");
});

test("provider download failure refunds once and returns an idle snapshot to clear the loading UI", async () => {
  let rejected = true;
  const f = fixture({ result: async () => {
    if (rejected) throw Object.assign(new Error("download failed"), { providerTerminal: true, providerCode: "file_download_error" });
    return { url: "provider-output" };
  } });
  await f.service.generate({ ...f.input, comments: [{ x: .5, y: .5, text: "Change the title" }] });
  await assert.rejects(f.service.read("project"), error => {
    assert.match(error.message, /could not read your artwork/);
    assert.equal(error.snapshot.pending, null);
    assert.equal(error.snapshot.candidate, null);
    assert.equal(error.snapshot.project.generated_image_url, "flat");
    assert.equal(error.snapshot.project.canvas_data.artwork_edits.jobs[0].refunded, true);
    return true;
  });
  assert.equal((await f.service.read("project")).pending, null);
  assert.equal(f.calls.refund, 1);
  rejected = false;
  await f.service.generate({ ...f.input, requestId: "new-request-after-failure" });
  assert.equal((await f.service.read("project")).candidate.imageUrl, "edited");
  assert.equal(f.calls.submit, 2);
});

test("temporary polling failures preserve the pending request without refunding or resubmitting", async () => {
  const f = fixture({ status: async () => { throw new Error("Network interrupted"); } });
  await f.service.generate(f.input);
  await assert.rejects(f.service.read("project"), error => {
    assert.equal(error.snapshot, undefined);
    return true;
  });
  assert.equal(f.project().canvas_data.artwork_edits.jobs[0].status, "queued");
  assert.equal(f.calls.refund, 0);
  assert.equal(f.calls.submit, 1);
});

test("reused ledger reservation cannot pay for a second provider submission", async () => {
  const f = fixture({ charge: async () => ({ transactionId: "existing-charge", replayed: true }) });
  await assert.rejects(f.service.generate(f.input), /already billed/);
  assert.equal(f.calls.submit, 0);
});

test("invalid access, prompt, and stale source fail before billing", async () => {
  const f = fixture();
  await assert.rejects(f.service.generate({ ...f.input, prompt: "" }));
  await assert.rejects(f.service.generate({ ...f.input, sourceUrl: "old-source" }));
  assert.equal(f.calls.charge, 0);
  const denied = fixture({ load: async () => { throw new Error("Forbidden"); } });
  await assert.rejects(denied.service.generate(denied.input), /Forbidden/);
  assert.equal(denied.calls.charge, 0);
  assert.deepEqual(artworkEditInput("source", "Remove text").image_urls, ["source"]);
});
