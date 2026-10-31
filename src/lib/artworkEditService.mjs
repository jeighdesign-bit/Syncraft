import { normalizeArtworkComments, artworkCommentInstructions } from './artworkEditComments.mjs';
import { artworkEditFailureDetails } from './artworkEditProvider.mjs';

export { ARTWORK_EDIT_MODEL, ARTWORK_EDIT_COST } from './artworkEditPolicy.mjs';

const ACTIVE = new Set(['billing', 'submitting', 'queued', 'ready', 'unknown']);
const MAX_EDITS = 40;
const fail = (message, status = 409) => Object.assign(new Error(message), { status });
const stateOf = (project) => project.canvas_data?.artwork_edits || { jobs: [], versions: [] };
const item = (job) => ({
  id: job.id,
  imageUrl: job.imageUrl,
  prompt: job.prompt,
  comments: job.comments || [],
  createdAt: job.createdAt,
});

export function artworkEditSnapshot(project) {
  const state = stateOf(project);
  const candidate = state.jobs.find((job) => job.status === 'preview');
  const pending = state.jobs.find((job) => ACTIVE.has(job.status));
  return {
    project,
    versions: state.versions.map(item),
    candidate: candidate ? item(candidate) : null,
    pending: pending ? { requestId: pending.id, status: pending.status } : null,
  };
}

export function artworkEditInput(sourceUrl, prompt, comments = []) {
  return {
    image_urls: [sourceUrl],
    prompt: `Edit this existing flat artwork. ${prompt}${artworkCommentInstructions(comments)}\nKeep all unmentioned artwork, text, colors, composition, canvas proportions, and background unchanged. Return only the complete edited artwork, without a mockup, frame, annotations, or extra text.`,
    num_images: 1,
    aspect_ratio: 'auto',
    resolution: '2K',
    output_format: 'png',
    limit_generations: true,
  };
}

// Dependencies keep the job and billing state machine testable without paid calls.
// CAS compares both the full previous JSON and the current flat-artwork URL.
export function createArtworkEditService(deps) {
  const now = () => new Date(deps.now?.() ?? Date.now()).toISOString();
  async function update(projectId, mutate) {
    for (let attempt = 0; attempt < 5; attempt++) {
      const project = await deps.load(projectId);
      const state = structuredClone(stateOf(project));
      const extra = mutate(state, project) || {};
      const saved = await deps.cas(project, {
        ...extra,
        canvas_data: { ...(project.canvas_data || {}), artwork_edits: state },
      });
      if (saved) return saved;
    }
    throw fail('The project changed in another tab. Reopen AI Edit to check its saved state.');
  }
  async function jobUpdate(projectId, id, mutate) {
    return update(projectId, (state, project) => {
      const job = state.jobs.find((job) => job.id === id);
      if (!job) throw fail('This edit could not be found.', 404);
      return mutate(job, state, project);
    });
  }
  async function refundFailed(projectId, job) {
    if (!job.chargeId || job.refunded) return;
    const result = await deps.refund(job, projectId);
    if (!result.refunded)
      throw fail('The edit failed. Its credit refund is still pending; check again shortly.', 503);
    await jobUpdate(projectId, job.id, (current) => {
      current.refunded = true;
    });
  }
  async function markFailed(projectId, id) {
    const project = await jobUpdate(projectId, id, (job) => {
      job.status = 'failed';
    });
    await refundFailed(
      projectId,
      stateOf(project).jobs.find((job) => job.id === id),
    );
    return deps.load(projectId);
  }
  async function terminalFailure(projectId, id, message, status = 422) {
    const project = await markFailed(projectId, id);
    return Object.assign(fail(message, status), { snapshot: artworkEditSnapshot(project) });
  }
  async function read(projectId) {
    let project = await deps.load(projectId);
    for (const failed of stateOf(project).jobs.filter(
      (job) => job.status === 'failed' && job.chargeId && !job.refunded,
    ))
      await refundFailed(projectId, failed);
    project = await deps.load(projectId);
    let job = stateOf(project).jobs.find((job) => ACTIVE.has(job.status));
    if (!job) return artworkEditSnapshot(project);
    if (
      job.status === 'unknown' ||
      (['billing', 'submitting'].includes(job.status) &&
        Date.now() - Date.parse(job.createdAt) > 90_000)
    ) {
      throw Object.assign(
        fail(
          'This edit request was not confirmed. Your artwork is safe. Please contact support before starting another edit.',
          503,
        ),
        { code: 'ARTWORK_EDIT_SUBMISSION_UNCONFIRMED', diagnostic: job.submissionFailure },
      );
    }
    if (job.status === 'queued') {
      await deps.verifyJob(projectId, job);
      try {
        const status = await deps.status(job.providerId);
        if (status.status !== 'COMPLETED') return artworkEditSnapshot(project);
        const result = await deps.result(job.providerId);
        if (!result?.url) {
          throw await terminalFailure(
            projectId,
            job.id,
            'The AI could not finish this edit. Its credits were refunded.',
          );
        }
        project = await jobUpdate(projectId, job.id, (current) => {
          if (current.status === 'queued') {
            current.status = 'ready';
            current.providerUrl = result.url;
          }
        });
        job = stateOf(project).jobs.find((current) => current.id === job.id);
      } catch (error) {
        if (error.providerTerminal) {
          throw await terminalFailure(
            projectId,
            job.id,
            error.providerCode === 'file_download_error'
              ? 'The AI could not read your artwork. Its credits were refunded. You can try again.'
              : 'The AI could not finish this edit. Its credits were refunded.',
          );
        }
        throw error;
      }
    }
    if (job.status === 'ready') {
      await deps.verifyJob(projectId, job);
      // Deterministic storage key permits safe download/save retries by two tabs.
      let imageUrl;
      try {
        imageUrl = await deps.save(project, job);
      } catch (error) {
        if (error.providerTerminal) {
          throw await terminalFailure(
            projectId,
            job.id,
            'The AI returned an unreadable image. Its edit credits were refunded.',
          );
        }
        throw error;
      }
      project = await jobUpdate(projectId, job.id, (current) => {
        if (current.status === 'ready') {
          current.status = 'preview';
          current.imageUrl = imageUrl;
        }
      });
      await deps.mark(job, projectId);
      await deps.usage(project, job);
    }
    return artworkEditSnapshot(project);
  }
  async function generate({
    projectId,
    actorId,
    prompt = '',
    comments = [],
    sourceUrl,
    requestId,
  }) {
    try {
      comments = normalizeArtworkComments(comments);
    } catch (error) {
      throw fail(error.message, 400);
    }
    if (
      typeof prompt !== 'string' ||
      (!prompt.trim() && !comments.length) ||
      prompt.length > 1500 ||
      !/^[a-zA-Z0-9-]{16,80}$/.test(requestId || '')
    )
      throw fail('Enter an edit instruction of up to 1,500 characters or add a comment.', 400);
    prompt = prompt.trim();
    let project = await deps.load(projectId);
    const previous = stateOf(project).jobs.find((job) => job.id === requestId);
    if (previous) {
      if (
        previous.prompt !== prompt ||
        previous.sourceUrl !== sourceUrl ||
        JSON.stringify(previous.comments || []) !== JSON.stringify(comments)
      )
        throw fail('This request ID already belongs to another edit.');
      return read(projectId);
    }
    if (project.generated_image_url !== sourceUrl)
      throw fail('The artwork changed. Reopen AI Edit before editing it.');
    await deps.validateSource(project, sourceUrl);
    project = await update(projectId, (state, latest) => {
      if (latest.generated_image_url !== sourceUrl)
        throw fail('The artwork changed. Reopen AI Edit before editing it.');
      if (
        state.jobs.some(
          (job) =>
            ACTIVE.has(job.status) ||
            job.status === 'preview' ||
            (job.status === 'failed' && job.chargeId && !job.refunded),
        )
      )
        throw fail('Finish or discard your saved edit before starting another.');
      if (state.jobs.length >= MAX_EDITS)
        throw fail('This project has reached its edit-history limit. Start a new project.');
      state.jobs.push({
        id: requestId,
        prompt,
        comments,
        sourceUrl,
        actorId,
        createdAt: now(),
        status: 'billing',
      });
    });
    let charge;
    try {
      charge = await deps.charge({ projectId, actorId, requestId });
    } catch (error) {
      // Only a definite refusal releases the reservation. A network error may
      // have committed the charge; never automatically charge that job again.
      await jobUpdate(projectId, requestId, (job) => {
        job.status = error.code === 'INSUFFICIENT_CREDITS' ? 'failed' : 'unknown';
      });
      throw error;
    }
    project = await jobUpdate(projectId, requestId, (job) => {
      job.chargeId = charge.transactionId;
      job.isOwnerTest = charge.isOwnerTest;
      job.status = charge.replayed ? 'unknown' : 'submitting';
    });
    if (charge.replayed)
      throw fail(
        'This edit was already billed. Please contact support to recover it before submitting another request.',
        503,
      );
    let inputUrl;
    try {
      inputUrl = await deps.sourceUrl(sourceUrl);
    } catch (error) {
      const diagnostic = artworkEditFailureDetails(error, 'prepare-source');
      await jobUpdate(projectId, requestId, (job) => {
        job.submissionFailure = diagnostic;
      });
      throw await terminalFailure(
        projectId,
        requestId,
        'Could not prepare the artwork. Its edit credits were refunded.',
        503,
      );
    }
    let providerId;
    try {
      const result = await deps.submit(artworkEditInput(inputUrl, prompt, comments));
      providerId = result.request_id;
      if (typeof providerId !== 'string' || !/^[\w-]{1,150}$/.test(providerId))
        throw fail('The provider did not confirm the edit request.', 503);
    } catch (error) {
      const diagnostic = artworkEditFailureDetails(error, 'submit-provider');
      if (error.definiteRejection) {
        await jobUpdate(projectId, requestId, (job) => {
          job.submissionFailure = diagnostic;
        });
        throw await terminalFailure(
          projectId,
          requestId,
          'The provider could not accept this edit. Its credits were refunded.',
          502,
        );
      }
      await jobUpdate(projectId, requestId, (job) => {
        job.status = 'unknown';
        job.submissionFailure = diagnostic;
      });
      throw Object.assign(
        fail(
          'The provider did not confirm this edit. Please contact support before trying another edit.',
          503,
        ),
        { code: 'ARTWORK_EDIT_SUBMISSION_UNCONFIRMED', diagnostic },
      );
    }
    project = await jobUpdate(projectId, requestId, (job) => {
      job.providerId = providerId;
      job.status = 'queued';
    });
    return artworkEditSnapshot(project);
  }
  async function change({ projectId, action, editId, sourceUrl }) {
    if (!['accept', 'restore', 'discard'].includes(action)) throw fail('Invalid edit action.', 400);
    const project = await update(projectId, (state, latest) => {
      if (state.jobs.some((job) => ACTIVE.has(job.status)))
        throw fail('Wait for the saved edit to finish first.');
      if (action === 'discard') {
        const job = state.jobs.find((job) => job.id === editId && job.status === 'preview');
        if (!job) throw fail('This preview is no longer available.');
        job.status = 'discarded';
        return;
      }
      if (latest.generated_image_url !== sourceUrl)
        throw fail('The artwork changed in another tab. Reopen AI Edit.');
      let next;
      if (action === 'accept') {
        const job = state.jobs.find((job) => job.id === editId && job.status === 'preview');
        if (!job || job.sourceUrl !== sourceUrl)
          throw fail('This preview belongs to earlier artwork. Discard it and create a new edit.');
        job.status = 'applied';
        next = item(job);
      } else {
        if (state.jobs.some((job) => job.status === 'preview'))
          throw fail('Apply or discard the preview before restoring a version.');
        next = state.versions.find((version) => version.id === editId);
        if (!next) throw fail('This version is no longer available.', 404);
      }
      if (!state.versions.some((version) => version.imageUrl === sourceUrl))
        state.versions.push({
          id: `source-${state.versions.length}`,
          imageUrl: sourceUrl,
          prompt: 'Previous artwork',
          createdAt: now(),
        });
      if (!state.versions.some((version) => version.imageUrl === next.imageUrl))
        state.versions.push(next);
      return {
        generated_image_url: next.imageUrl,
        upscaled_image_url: null,
        svg_url: null,
        zip_url: null,
        zip_signature: null,
        zip_generated_at: null,
      };
    });
    return artworkEditSnapshot(project);
  }
  return { read, generate, change };
}
